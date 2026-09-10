# NOCTURNE Lighting

当前目录只保留一个明确的主线和一个明确的历史归档，避免新旧灯光执行逻辑混在一起。

```text
lighting/
├─ v2/                 # 当前正在使用的确定性灯光 Runtime
├─ legacy-v1/          # 已冻结的旧实验实现，仅供查阅/回归
└─ dust.json.gz        # 共享的 Dust MIDI 派生数据，当前音频与 V2 示例仍会读取
```

## 当前主线

`v2/` 是唯一应该从 NOCTURNE 当前入口继续开发的灯光系统。`src/assets/venues/nocturne/main.ts` 只导入 V2 模块，不导入 `legacy-v1/`。

核心原则：同一个 ShowPlan、同一个音乐时刻，得到同一个 FrameState。运行时按音乐绝对时间求值，然后通过场景适配器即时写入灯具。

## 历史实现

`legacy-v1/` 保存此前用于验证问题的三份实现：旧 Dust 编排器、状态式物理执行器和 Movement Lab。它们保留是为了回看已经验证过的经验，例如运动不能瞬移、scan 切换要连续、瞬态 accent 可以立即触发。

这些文件不是当前运行依赖。不要把 `legacy-v1/` 和 `v2/` 同时接到同一批灯具上，否则会重新出现多个写入者竞争状态的问题。

## 共享数据为什么不移动

`dust.json.gz` 不是旧执行器本身，而是当前 `DustAudioPlayer`、Vite 虚拟 MIDI 模块和 V2 Dust reference show 仍在使用的数据，所以继续放在 `lighting/` 根目录。等以后切到完整原始 MIDI + tick/tempo map，再单独迁移数据层，不和历史代码归档混在一起。
