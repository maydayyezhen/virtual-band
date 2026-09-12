# DeepSeek Harness 试作：Take On Me

为 a-ha 的《Take On Me》完成整首舞台演出并加入游戏。工作区为 `D:\works\virtual-band-v2-new`。先读仓库 `AGENTS.md`、`docs/NEW_SONG.md`，再按 `docs/SHOW_AUTHORING.md` 查接口；不用阅读整个仓库后才动手。

## 已准备好的输入

- 建议作品 ID：`take-on-me`。
- MIDI：`public/examples/take-on-me/take-on-me.mid`，原始文件不改写。
- 原创 AI 封面：`public/artwork/take-on-me-cover.png`，已准备好，直接使用。
- 来源、SHA-256、精确时长与速度信息：`public/examples/take-on-me/source.json`。
- 当前路由分析：`public/examples/take-on-me/analysis.txt`。
- MIDI 总时长约 224.985 秒，展示时长可写 `03:45`。当前路由生成四件乐器：鼓、电子琴、电吉他、贝斯；不要为了套波西米亚镜头增加虚假乐器或改音色。
- 音乐艺人：`a-ha`；制作署名：`yezhen 制作`。

这些是待创作素材，尚未注册到游戏，也没有替你编排演出。

## 任务

试听并分析这份 MIDI 的完整结构，自主完成灯光、LED、镜头和片头片尾四条轨道。整体可以从素描与霓虹的封面意象出发，做一场明亮、利落、有递进的演出；这只是灵感，不规定镜头表、色彩时刻或素材组合。允许原创技法、机位、运动和程序动画，不能只是把波西米亚的时间轴改个名字。

特写应对准当时实际演奏的实例，兼顾鼓、电子琴、电吉他和贝斯。重要灯光/LED 变化留出展示空间，安静或变化平缓的段落再安排细节。主屏和侧屏分别考虑比例。内容按歌曲绝对时间求值，正确支持暂停、继续和跳转；若使用不支持离线的内容，如实声明限制。

新建自己的 `ShowDefinition` 并在 `src/shows/catalog.ts` 注册一次，配置封面、署名和有代表性的自动预览片段。保留现有菜单美术、纯舞台播放页、Esc 暂停菜单、菜单音乐和加载遮罩。不要重做 UI 或音频架构。

完成后运行 `npm run song:verify -- --song take-on-me`、`npm run build`，在 Chrome 检查自动预览、开始演出、暂停继续、返回选歌及切换回波西米亚；实际审阅全曲画面。补短创作记录，说明设计重点、真正做过的检查和剩余问题。遇到错误修原因，不删验证来凑通过。

这次只交付游戏内完整作品，不导出整曲视频，不自动提交 Git。流程保持简洁，不做白模、多阶段评审或大规模重构。
