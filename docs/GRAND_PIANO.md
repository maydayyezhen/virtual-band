# 三角钢琴

入口仍是 `/studio/band/`。双击钢琴进入近景，面板可切换整琴、键盘和开盖视角；点击或滑动琴键弹奏，电脑键盘 A/W/S/E/D/F/T/G/Y/H/U/J/K 对应 C4–C5，空格控制右侧延音踏板。失焦、取消触摸和离开近景都会释放当前输入。

## 模型与边界

- `src/instruments/piano/createGrandPiano.ts` 只生成模型：黑色漆面、黄铜五金、木色音板、88 键（A0–C8）、开盖、琴腿脚轮、三踏板外形与琴凳。仅右踏板支持交互；没有击弦机、联动器或内部机械模拟。
- `GrandPianoInstrument.ts` 管理按键和踏板姿态，使用独立的 SF2 通道租约。谱面、电脑键盘、每个触摸点分别持有琴键，释放其中一个输入不会打断其他输入。
- `PianoShowcaseMode.ts` 声明钢琴近景，输入由钢琴与萨克斯共用的 `NoteInstrumentShowcaseMode` 处理，复用 `OrbitController`、`CameraRegistry` 和 `InstrumentInteractionSystem`。命中归属由实例对象确定。
- `InstrumentDefinitions.ts` 注册模型、音频通道和近景；`LayoutDocument.ts` 声明演奏占地、1.85 米开盖高度及侧翼排位。布局编辑器复用同一模型工厂，不创建音源。

GM 0、1、3 显示为钢琴；GM 2 及电钢琴仍由双层键盘表现。模型路由不改变 MIDI 音频。原始文件继续由 SpessaSynth 播放，`visualNoteOn/Off` 只改变琴键姿态。超出实体 88 键范围的音符仍然发声，仅没有对应实体琴键。

波西米亚示例的 GM 0 钢琴轨自动进入钢琴实例；编队不包含歌曲专用坐标。

验证：`npm run piano:browser` 检查实体键命中、输入所有权、延音与失焦、实例隔离、MIDI 静音视觉接口及波西米亚排位。`live:browser` 检查包括钢琴在内的真实音源输出，`formation:browser` 检查重新排位与锁定，`layout:verify` 检查布局数据。
