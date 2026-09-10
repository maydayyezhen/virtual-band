# Legacy V1 Lighting Experiments

这个目录是 **NOCTURNE 旧灯光实验实现的冻结归档**。2026-09-10 在 Runtime V2 已接管当前实验入口后，将旧文件从 `lighting/` 根目录集中移到这里。

## 包含内容

- `DustLightingDirector.ts`：旧 Dust MIDI 灯光 Director。按歌曲分析结果生成 cue，并大量使用持续 scan。它验证了 MIDI 分析、分组 cue、鼓点 transient 等想法，但编排层和灯具状态切换耦合较重。
- `PhysicalLightingExecutor.ts`：旧状态式物理执行器。通过逐帧状态、速度/加速度限制、scan handoff 等逻辑解决“灯头瞬移”和中途切换不连续的问题。
- `MovementActionLab.ts`：旧动作实验台。用于人工检查 fan / sweep / cross / converge / chase / hold / idle scan 等动作，以及 PREPARE → READY → PLAY → HOLD → RETURN 的 staged demo。

## 为什么归档

旧路线的基本模型是：Director 发目标 → Executor 根据上一帧状态逐帧追目标。它适合验证物理连续性，但最终结果依赖播放历史，直接 seek 到某个音乐时刻与连续播放到该时刻不天然等价。

当前 V2 改为：

```text
ShowPlan
  ↓
compileShowPlan()
  ↓
evaluateShow(musicTime)
  ↓
FrameState
  ↓
NocturneLightingAdapter
  ↓
fixture.set(..., 0)
```

因此 transition / motion 应逐步变成由音乐绝对时间定义的可复现轨迹，而不是依赖 RAF 历史积分。

## 使用规则

1. **不要从当前 `main.ts` 导入本目录。** 当前入口只使用 `lighting/v2/`。
2. **不要让 V1 和 V2 同时写同一批灯具。** 旧项目已经验证过多写入者会造成状态覆盖、跳变和难以定位的竞态。
3. 本目录用于查阅、对比、回归和提取经验，不作为新功能落点。
4. 如果确实需要复活旧实验，请从 Git 历史中的 `76c874c57531674a4356269942cad125215e6311` 查看当时完整入口/UI 接线，而不是直接把归档文件重新塞回当前入口。
5. `../dust.json.gz` 仍留在上一级目录，因为当前 V2 和音频播放器仍需要它；它不是仅属于 V1 的废弃文件。

## 已经从 V1 得到、应保留到 V2 的经验

- Moving head 的位置变化不能瞬移；速度和加速度约束仍然重要。
- 新目标到来时，视觉状态必须连续，不能从旧目标值重新开始。
- scan / oscillator 的启停要保持视觉位置连续，不能开关即跳。
- flash / hit / strobe 这类瞬态强调可以即时发生，它们与机械运动的连续性规则不同。
- Hold 很重要；持续运动不应该成为默认舞台状态。

归档不是回退主线。后续修改应优先发生在 `lighting/v2/`，只有需要保存历史修复说明时才改这里。
