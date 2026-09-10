# NOCTURNE Lighting Runtime V2

这套目录是当前 NOCTURNE 灯光主线。旧 `DustLightingDirector + PhysicalLightingExecutor + MovementActionLab` 已归档到 `../legacy-v1/`，当前入口不再依赖它们。

核心约束：**同一个 ShowPlan、同一个音乐时刻，必须得到同一个 FrameState。**

```text
SongScore
   ↓
MusicChoreographyAnalysis
   ↓
Dust song-specific mapping
   ↓
ShowPlan
   ↓
compileShowPlan()
   ↓
evaluateShow(musicSeconds)
   ↓
FrameState
   ↓
NocturneLightingAdapter
   ↓
fixture.set(..., 0)
```

## Runtime V2

- `contracts.ts`：ShowPlan / Cue / RigSnapshot / FrameState 最小协议。
- `ShowRuntime.ts`：`section → motion → accent` 分层、选择器解析、诊断与纯时间求值。
- `NocturneLightingAdapter.ts`：唯一场景写入口，关闭旧 scan/tween，直接应用 Runtime 的最终帧。
- `ShowPlanIds.ts`：给生成式 cue 增加 section namespace，同时保留同 section 内重复 ID 的诊断价值。
- 播放与 seek 都直接按绝对音乐时间求值，不从零重放。

## Full-score mapping v5

`MusicChoreographyAnalysis.ts` 不再只提取 energy / density。它会把整个 `SongScore` 分析成四层音乐信息：

1. **Note**：role、pitch band、相对音高、力度、时值、前一音程、上/下/重复轮廓、importance。
2. **Phrase**：声部 phrase、pitch range、整体 rise/fall/arch/dip/mixed/static、密度、sustain ratio、motif key。
3. **Harmonic moment**：近同时发生的多音/多声部聚合、音域跨度、平均力度。
4. **Texture window**：按小节统计全声部密度、能量与 role energy。

`DustAdaptiveStressShow.ts` 当前只是兼容入口，实际转发到 `DustFullScoreShow.ts`。当前输出 `dust-full-score-mapping-v5`，映射策略：

- Bass / electric / guitar / upper / lower 等 pitched role 的**所有 note attack**按各自音域归一化为 low/mid/high，再映射到不同灯组或灯具子集；不再只盯 Bass 和鼓。
- phrase 的音高轮廓、pitch range、密度、时值和 sustain ratio 驱动 pan / tilt / beam angle 的有限运动曲线；重复 motif 通过稳定 hash 保持相近的空间方向。
- harmonic moment 驱动较宽的 front / front-floor intensity swell，让和声厚度能进入画面。
- texture window 用整小节的所有音符调制各灯组的宏观亮度曲线，让歌曲密度变化不是靠逐拍闪烁表现。
- drums 分拆为 kick / snare / hat / tom / crash；tom note number 会沿 floor fixtures 产生空间移动感，hat 只做很轻的纹理，crash 才有较大的全场打开。
- 最终所有结果仍只生成 ShowPlan；Runtime 热路径不做音乐分析，也不依赖上一帧。

这版的目标不是自动“生成一个好看 show”这么简单，而是先验证：**更多真实 MIDI 信息能否进入编排语言，同时保留确定性、seek-safe 和无逻辑跳变。**

## 仍未完成

当前 Dust 数据仍是旧秒域 JSON，没有原始 MIDI tick / tempo map。真正通用版应把持久化时间升级为整数 tick，并由唯一 tempo map 转换到 seconds。编译器也还没有完整的灯头速度/加速度可达性轨迹编译、Rig 世界坐标和 Agent 工具协议。
