# NOCTURNE Lighting Runtime V2

这套目录是对旧 `DustLightingDirector + PhysicalLightingExecutor + MovementActionLab` 实验路线的替代核心。旧文件暂时保留用于对照，但 `main.ts` 已不再导入它们。

核心约束只有一条：**同一个 ShowPlan、同一个音乐时刻，必须得到同一个 FrameState。**

当前数据流：

```text
legacy Dust MIDI JSON
        ↓
   SongScore
        ↓
 reference ShowPlan
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
- `DustReferenceShow.ts`：只作为 Runtime V2 的手写参考计划。它强调稳定构图、有限换位、Hold 和鼓点 accent；`oscillator` 只在少量段落作背景纹理。
- 播放器支持 seek；灯光 seek 不从零快进，而是直接重新求值目标音乐时刻。

## 有意没有伪装完成的部分

当前 Dust 数据是旧的秒域 JSON，没有保留原始 MIDI tick/tempo map，所以这个 prototype 使用 `startSeconds/endSeconds`。真正的 Agent 通用版应在接入原始 MIDI parser 后把持久化时间升级成整数 tick，并由唯一 tempo map 做 tick↔seconds 转换。

当前编译器还没有完整实现灯头加速度/可达性轨迹编译、Rig 世界坐标、版本 hash、Agent 工具、计划 patch/并发保护。这些都应该建立在当前 deterministic evaluator 已验证可用之后，而不是重新回到逐帧 stateful transition。

## 下一步

1. 先本地观看 Dust Runtime V2，重点测试播放、暂停和拖动 seek。
2. 验证“连续播放到某时刻”和“直接 seek 到该时刻”的灯光画面一致。
3. 若视觉与执行模型成立，再接真实 MIDI tick/tempo map 和运动约束编译。
4. 最后把 RigSnapshot + MIDI Analysis + ShowPlan schema 作为工具交给编排 Agent；Agent 生成计划，Runtime 不在热路径调用模型。
