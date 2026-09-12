# 按作品 ID 逐帧导出视频

从 `src/shows/catalog.ts` 选择作品，读取其 MIDI、四轨编排和署名：1920×1080、30 / 60 FPS、H.264 + AAC MP4，包含作品自己的灯光、LED、导播和片头片尾。波西米亚与自由创作示例已声明支持；新增作品通过 `ShowDefinition.offline` 明确支持状态。使用独立后台 Chrome 页面，不占用用户正在观看的页面。暂不导出用户临时改动的布局、导播或外部 LED 视频素材。

## 运行

需要 Node.js 24、Google Chrome、可调用的 `ffmpeg` / `ffprobe`，以及本地 FluidR3_GM.sf2。启动项目的 Vite 服务（默认 http://localhost:5173）。Playwright 可以安装在项目外，通过 `PLAYWRIGHT_MODULE` 指定模块路径。

```powershell
npm run video:export -- --list
npm run video:export -- --song bohemian-rhapsody
# 默认 1080p60 全曲，输出 exports/bohemian-rhapsody-1080p60.mp4
# 省略 --song 仍默认波西米亚，旧 export-bohemian.mjs 入口兼容

npm run video:export -- --song bohemian-rhapsody --fps 30 --output exports/bohemian-1080p30.mp4
npm run video:export -- --song freeform-study --start 150 --duration 8 --output exports/preview.mp4
```

未知 ID、MIDI 哈希不符、素材缺失或作品声明不支持离线，会在编码前报错。先用 `npm run song:verify -- --song <id>` 检查新作品，再导出代表性短片。

导出不会覆盖现有文件。旁边的 `.mp4.json` 保存作品 ID、MIDI 哈希、帧数、分辨率、音频峰值、音量调整、GPU 渲染器和耗时。过程文件放在本次独立临时目录，成功后删除，失败时保留供排查。`exports/` 不纳入 Git。

## 数据流与边界

- `OfflineStage.ts`：独立驱动画面。乐器按 120 Hz 顺序推进 MIDI 视觉事件和动画；每帧给灯光、LED、导播、文字相同的歌曲时间。导出页停止原来的 RAF，消除真实时间干扰。镜头采用作品轨，减少动态效果偏好由导出页明确关闭。
- `encodeVideo.ts`：从最终 WebGL 画布创建带固定时间戳的 VideoFrame，用 Chrome WebCodecs 编码 H.264。优先硬件加速；有界编码队列等待慢帧，不丢帧。编码数据分批交给仅监听本机、随机路径的临时接收端，不保存图片序列。
- `render-midi-audio.mjs`：通过现有 SpessaSynth core 和同一音色库，从零顺序合成原始 MIDI，保留程序、控制器和速度事件。48 kHz 立体声，应用项目默认主音量；需要时整曲等比例衰减至峰值 -1 dBFS，避免 PCM 削波并为 AAC 留余量，不改变声部比例或压缩动态。剪辑区间也先合成前序事件以保留持续音和效果器状态。
- `export-show.mjs`：协调载入、音频预检、视频、FFmpeg 封装与验证；检查总帧数、恒定帧率、分辨率、音视频时长，并完整解码检查。60 FPS 时每帧对应 800 个音频采样，帧数向上取整后的末尾不足一帧部分保留黑场。

作品必须使用可按绝对歌曲时间重现的内容。`offline.supported` 是作者声明，执行器不自动判断任意程序的确定性。外部 LED 视频需要额外的逐帧解码等待接口，音频频谱动画需要读取离线 PCM，不能直接套用本导出流程。后台 GPU 渲染与硬件编码是两个独立能力；报告中的 renderer 证明前者，编码配置只表达优先使用硬件的请求。

合法的静音片段（开场、空拍或尾部黑场）会保留静音音轨，不当作合成失败；非有限音频采样仍会报错。
