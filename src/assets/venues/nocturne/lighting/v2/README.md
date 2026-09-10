# NOCTURNE Lighting Runtime V2

这套目录是当前 NOCTURNE 灯光主线，用来替代旧 `DustLightingDirector + PhysicalLightingExecutor + MovementActionLab` 实验路线。旧实现已经集中归档到 `../legacy-v1/`，当前 `main.ts` 不再导入它们。

核心约束只有一条：**同一个 ShowPlan、同一个音乐时刻，必须得到同一个 FrameState。**

当前数据流：

```text
legacy Dust MIDI JSON
        ↓
   SongScore
        ↓
 adaptive / reference ShowPlan
        ↓
 compileShowPlan()
        ↓
  CompiledShow
        ↓
evaluateShow(musicSeconds)
        ↓
   FrameState
        ↓
NocturneLightingAdapter
        ↓
 fixture.set(..., 0)
```

## 第一版已经落地

- `contracts.ts`：ShowPlan / Cue / RigSnapshot / FrameState 的最小协议。
- `ShowRuntime.ts`：选择器解析、基础诊断、`section → motion → accent` 分层混合、纯时间求值。
- 基础效果：`constant`、`curve`、`oscillator`、`eventEnvelope`。
- `NocturneLightingAdapter.ts`：唯一场景写入口；每帧把 Runtime 的最终状态即时写入旧 NOCTURNE 灯具，不再让场景跑第二层 tween；强制关闭旧 scan。
- `DustReferenceShow.ts`：第一版手写基线计划，强调稳定构图、有限换位、Hold 和鼓点 accent。
- `DustAdaptiveStressShow.ts`：当前 Another One Bites the Dust 压力测试编排。复用旧 Director 的“逐小节能量/密度/声部焦点 → phrase → style”思路，但不复活旧 stateful executor。
- 播放器支持 seek；灯光 seek 不从零快进，而是直接重新求值目标音乐时刻。

## Adaptive Stress Show v2.1：Dry Groove

第一版 adaptive stress show 验证了高 cue 密度下没有明显跳变，但视觉上出现“灯头一直软绵绵晃动”的问题。v2.1 因此把编排原则改成：**Bass riff 是视觉时钟，moving head 默认 Hold，运动只用于明确换位。**

当前策略：

1. phrase 仍由 MIDI 的小节能量、密度、声部焦点和 crash 自动分析产生，保留旧 Director 的 style vocabulary。
2. 移除 stress show 中持续的 oscillator 漂移。`groove-left/right`、`cross`、`stagger`、`knife`、`grid` 现在主要是静态构图，完成换位后保持。
3. 大幅 pan/tilt 换位采用 **压暗 → 暗处移动 → 到位重新亮出**。机械运动本身仍是连续 curve，但观众看到的是更利落的构图切换。
4. Bass MIDI note 直接生成短促左右交替的 intensity bite；较强/周期性 anchor note 会同时击中 rear，并轻推 front-floor。这会生成较多独立 cue，用来真实压力测试 evaluator。
5. kick 主要打 floor/front-floor；snare 用 rear/side 的短白切；crash 才允许全场白色打开。鼓点 accent 不修改 pan/tilt，因此不会把机械运动重新变成节拍器。
6. 白色只用于 snare、crash 和高能量 look；主视觉继续以暗红/红色为核心。
7. 连续播放与 seek 仍使用同一套绝对时间曲线，不能为了“更硬”回退到 stateful transition。

压力测试的目标不是让所有灯一直运动，而是让 Runtime 同时承受大量 phrase look、暗场换位、Bass riff transient、kick/snare/crash transient，并仍保持确定性和视觉连续。

当前 `main.ts` 默认加载 `dust-adaptive-stress-v2`；`DustReferenceShow.ts` 保留作为较轻量回归基线。

## 与 legacy-v1 的边界

`../legacy-v1/` 只保存旧实验代码和经验，不是 V2 的依赖，也不应该重新接回当前入口。V2 可以吸收旧实验已经证明有效的约束，例如灯头速度限制、连续 handoff 和瞬态 accent，但实现必须服从“绝对音乐时间可复算”这一主线。

`../dust.json.gz` 暂时仍是共享数据：当前 Dust 音频与 V2 show 都在读取它，因此没有跟随旧代码移入归档目录。

## 有意没有伪装完成的部分

当前 Dust 数据是旧的秒域 JSON，没有保留原始 MIDI tick/tempo map，所以这个 prototype 使用 `startSeconds/endSeconds`。真正的 Agent 通用版应在接入原始 MIDI parser 后把持久化时间升级成整数 tick，并由唯一 tempo map 做 tick↔seconds 转换。

当前编译器还没有完整实现灯头加速度/可达性轨迹编译、Rig 世界坐标、版本 hash、Agent 工具、计划 patch/并发保护。这些都应该建立在当前 deterministic evaluator 已验证可用之后，而不是重新回到逐帧 stateful transition。

## 下一步

1. 本地观看 `dust-adaptive-stress-v2`，重点判断 Bass riff 是否真正成为视觉骨架，而不是看“运动够不够多”。
2. 观察 phrase 边界的大换位是否形成明确的“暗 → 到位 → 亮”构图切换。
3. 多次拖动 seek，验证“连续播放到某时刻”和“直接 seek 到该时刻”的灯光画面一致。
4. 若视觉与执行模型成立，再接真实 MIDI tick/tempo map 和运动约束编译。
5. 最后把 RigSnapshot + MIDI Analysis + ShowPlan schema 作为工具交给编排 Agent；Agent 生成计划，Runtime 不在热路径调用模型。
