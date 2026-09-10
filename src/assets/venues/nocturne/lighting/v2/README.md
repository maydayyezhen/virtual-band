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
- `DustAdaptiveStressShow.ts`：当前 Another One Bites the Dust 压力测试编排。复用旧 Director 的“逐小节能量/密度/声部焦点 → phrase → style”思路，但不复活旧 stateful executor。`opening-lock / bass-lock / groove-left/right / stagger-groove / cross-groove / build-fan / knife-* / climax-grid / outro-shadow` 会根据 MIDI 分析动态出现。
- 播放器支持 seek；灯光 seek 不从零快进，而是直接重新求值目标音乐时刻。

## Adaptive Stress Show 的目的

这份压力测试故意比 `DustReferenceShow` 生成更多 cue、更频繁的 phrase 切换和更多同时活动的运动/鼓点层，用来验证 Runtime V2 在复杂编排下仍保持：

1. 逐 phrase 的 Look 切换从上一目标状态连续过渡，不发生逻辑瞬变。
2. Moving head 的主要换位仍是有限 curve；持续纹理只用绝对音乐时间 oscillator，并通过 fade in/out 叠在稳定目标之上。
3. kick / snare / crash 只通过 `eventEnvelope` 写 intensity，不抢 pan / tilt / color。
4. 连续播放到某个时刻与直接 seek 到该时刻，仍应得到同一个 FrameState。
5. 当前 `main.ts` 默认加载 `dust-adaptive-stress-v2`，而 `DustReferenceShow.ts` 保留作为较轻量的回归基线。

这次只复用旧系统的**编排思路**，不复用旧系统“上一帧状态驱动下一帧”的执行模型。

## 与 legacy-v1 的边界

`../legacy-v1/` 只保存旧实验代码和经验，不是 V2 的依赖，也不应该重新接回当前入口。V2 可以吸收旧实验已经证明有效的约束，例如灯头速度限制、连续 handoff 和瞬态 accent，但实现必须服从“绝对音乐时间可复算”这一主线。

`../dust.json.gz` 暂时仍是共享数据：当前 Dust 音频与 V2 show 都在读取它，因此没有跟随旧代码移入归档目录。

## 有意没有伪装完成的部分

当前 Dust 数据是旧的秒域 JSON，没有保留原始 MIDI tick/tempo map，所以这个 prototype 使用 `startSeconds/endSeconds`。真正的 Agent 通用版应在接入原始 MIDI parser 后把持久化时间升级成整数 tick，并由唯一 tempo map 做 tick↔seconds 转换。

当前编译器还没有完整实现灯头加速度/可达性轨迹编译、Rig 世界坐标、版本 hash、Agent 工具、计划 patch/并发保护。这些都应该建立在当前 deterministic evaluator 已验证可用之后，而不是重新回到逐帧 stateful transition。

## 下一步

1. 本地观看 `dust-adaptive-stress-v2`，重点观察 phrase 密集切换、鼓点层叠和长时间播放。
2. 多次拖动 seek，验证“连续播放到某时刻”和“直接 seek 到该时刻”的灯光画面一致。
3. 若视觉与执行模型成立，再接真实 MIDI tick/tempo map 和运动约束编译。
4. 最后把 RigSnapshot + MIDI Analysis + ShowPlan schema 作为工具交给编排 Agent；Agent 生成计划，Runtime 不在热路径调用模型。
