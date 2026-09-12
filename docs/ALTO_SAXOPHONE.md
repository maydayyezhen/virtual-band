# 中音萨克斯

主线 `/studio/band/` 和布局编辑器均支持 `saxophone` 实例。双击进入近景，可选整支、按键和喇叭口视角。鼠标点按珠母键试音，A/W/S/E/D/F/T/G/Y/H/U/J/K 演奏 C4–C5 半音阶。电脑键盘使用实际发声音高，不在音频上再次移调。

## 模型

`createAltoSax.ts` 以米构建黄铜锥管、U 形弯管、开放喇叭口、内壁与卷边、脖管、软木、黑色吹嘴、哨片、卡箍、音孔盖、珠母键、连杆、护架和折叠支架。管体与按键对象分离，几何不访问音源、舞台或摄像机。外形是项目自有 Atelier 风格，没有复制厂家标识。

结构参考 [Yamaha 部件说明](https://www.yamaha.com/en/musical_instrument_guide/saxophone/mechanism/)；基本键位关系参考 [Yamaha 指法资料](https://www.yamaha.com/en/musical_instrument_guide/saxophone/play/play002.html)。六个主键的动作是演出用简化表现，未模拟所有高音辅助键、替代指法或气流，不作为指法教学工具。点按单个珠母键会试奏一个代表音，并更新整组按键。

## 运行边界

- `SaxophoneInstrument` 独立持有一个 SF2 通道租约。自由弹奏采用后按音优先，释放后恢复仍按住的前一个音；多个输入持有同音时不会提前断音。
- `visualNoteOn/Off` 只更新视觉状态，不发声；MIDI 的完整复音和控制器由现有 SpessaSynth 播放。谱面出现重叠音时，模型显示最后进入的音，结束后恢复仍活动的音。
- `saxKeyPattern` 仅在视觉上将实际音高加 9 个半音，计算中音萨克斯的书写音高键型。超常规音域仍保留原 MIDI 音频和音符事件，模型使用简化键型。
- `NoteInstrumentShowcaseMode` 是钢琴和萨克斯共用的输入/近景控制器；按键手势带有输入来源标识，失焦和离开近景释放当前输入。演奏音色与单声部策略仍属于乐器对象。
- `InstrumentDefinitions` 注册模型、GM 65 音源和视角。`LayoutDocument` 声明带支架的 0.95 米高度、演奏占地和前排规则。多个实例、保存布局和自动排位沿用原来的 ID 与布局接口。

目前只把 GM 65 中音萨克斯轨路由到此模型；高音、次中音和上低音萨克斯保留现有后备显示，避免以同一种外形冒充全部型号。波西米亚示例的 138 个萨克斯音符自动接入，全曲 5922 个有效音符保持不变。

验证入口：`saxophone:browser`、`piano:browser`、`midi:routing:verify`、`midi:verify`、`layout:verify`、`formation:browser`、`live:browser`。
