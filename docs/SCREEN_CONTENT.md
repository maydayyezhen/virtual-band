# LED 通用内容源

主线 `/studio/band/` 的「LED 内容」面板支持：选择全部/主屏/左屏/右屏、导入图片或静音视频、程序光带、实时声谱、文字、完整显示/裁切铺满、亮度、暂停、跟随歌曲、恢复默认。面板默认折叠；手机展开后可在面板内滚动。

## 接入约定

LED 的职责是显示一个图像表面或 GPU 纹理；不解析文件格式，不管理音频，不调用灯光和镜头。新的内容类型实现 `ScreenContent.create(screen, signal)`，返回独立的 `ScreenPlayer`：

```ts
interface ScreenPlayer {
  readonly surface: CanvasImageSource | THREE.Texture;
  update(frame: ScreenFrame): boolean | void;
  dispose(): void;
}
```

`create` 可以异步加载资源，支持取消。每块屏幕得到自己的播放器。`update` 由主页面原有循环调用，最多约 30 次/秒；收到绝对时间、时间变化量、播放状态、目标像素尺寸和可选音频数据。返回 `false` 表示画面没有改变。每帧绘制必须同步，资源在 `create` 中预先准备；不要再启动一套 RAF。新帧必须能处理向前/向后跳转。

`ScreenSession` 管理加载、时间和资源；`NocturneVenue.screens` 提供按屏幕 ID 独占的显示接口。图片/视频读取使用浏览器解码，程序动画使用 Canvas，GPU 动画可以直接提交 Texture/RenderTarget.texture。新增内容源无需修改舞台代码。

## 使用示例

```ts
import { ScreenSession, imageContent, videoContent, canvasContent, surfaceContent } from './screens';

const screens = new ScreenSession(venue.screens);

// file 来自文件选择器，也可以传入可读取的资源 URL。
await screens.setContent(['main'], imageContent(imageFile));
await screens.setContent(['left', 'right'], videoContent(videoFile, { loop: true }), {
  clock: 'song', fit: 'cover', brightness: .8,
});

// 每块屏幕会创建符合它自身分辨率的 Canvas。
await screens.setContent(['main'], canvasContent('我的动画', (ctx, frame) => {
  ctx.fillStyle = '#081220';
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.fillStyle = '#8ce5ff';
  ctx.fillRect((Math.sin(frame.time) * .4 + .5) * frame.width, 0, 20, frame.height);
}));

// 已有 Canvas / OffscreenCanvas / ImageBitmap / VideoFrame / 图片 / 视频 / THREE.Texture。
// 外部资源借给屏幕，默认不由屏幕销毁。动态 GPU 内容由回调更新自己的渲染器。
await screens.setContent(['main'], surfaceContent('外部渲染', renderTarget.texture, frame => {
  updateMyScene(frame.time);
  myRenderer.render(myScene, myCamera);
}));

// 主页面现有循环中调用；第三个参数是可选的只读音频数据快照。
screens.update(dt, player ? { time: player.time, playing: player.isPlaying } : null, audioData);
screens.restore(['main']);
screens.dispose();
```

通用入口支持浏览器可绘制的图像表面，包括图片、Canvas/WebGL Canvas、OffscreenCanvas、ImageBitmap、VideoFrame，以及 Three.js 纹理。HTML 页面/DOM 本身不是图像表面，需要内容源先将它转换成浏览器可绘制的画布或纹理；视频是否能解码取决于浏览器支持的编码。跨域素材需要资源端允许读取。

## 时间与音频

- `clock: 'song'` 使用现有 MIDI 播放器时间；没有歌曲时使用独立时间。暂停歌曲时屏幕暂停，拖动歌曲进度时重定位。
- `clock: 'local'` 独立播放。切换到独立模式从当前画面时间继续。屏幕的 `playing: false` 单独冻结画面；恢复时，跟随歌曲的内容会追上当前歌曲位置。
- 图片是静态内容。程序动画按绝对时间绘制；实时音频图案额外使用当前音频数据，不能当成离线、逐帧一致的音频分析缓存。
- 自建视频元素默认静音。正常播放交给原生视频播放器；发生跳转或漂移超过约 150 ms 时校正，暂停后按更小误差定位。循环视频按歌曲时间对视频时长取模；解码和跳转是异步的，不承诺逐帧锁相。
- `ScreenAudioTap` 读取现有 `AudioEngine.connectMixTap`，包含 MIDI 和自由弹奏的混音，不新增 AudioContext，不再播一份音频。声谱示例使用真实数据，无声时不会伪造节奏。
- `surfaceContent` 借用已有视频时，播放控制由原有视频持有者负责。需要本模块管理视频时间、暂停和清理时，使用 `videoContent`。

## 生命周期与失败

目标屏幕全部准备成功后才换画面。失败或取消保留旧内容；同一屏幕的新请求会取消尚未完成的旧请求。`cancelPending(ids)` 只取消加载，`restore(ids)` 取消加载并恢复默认图案。图案错误会冻结该内容并显示原因，不中断其他屏幕和主渲染循环。

图片/视频工厂创建的 Blob URL、媒体元素，以及程序 Canvas 由播放器自己释放。`surfaceContent` 默认借用资源，不关闭调用方的 ImageBitmap/VideoFrame，也不销毁 GPU 纹理。定制内容源需要在 `dispose` 中释放它自己拥有的资源，且释放操作应可重复调用。

舞台销毁前恢复屏幕原材质和地面反射的来源，避免把外部借用纹理当成舞台资产销毁。主屏的地面反射继续跟随当前内容，GPU 纹理的画面适配也应用到反射。

## 波西米亚参考剧场

在主线点击「载入波西米亚示例」，三块 LED 自动切到参考 HTML 的七幕 Canvas 剧场：幕后的影子、窗前的独白、影子走向月亮、面具的法庭、撕开这座剧院、剧院尽头的海、最后一束暖光。主屏与两块竖屏使用各自构图，保留参考的 1.5 秒幕间溶解、鼓点碎片和人物动作。主屏地面反射跟随画面。

`src/shows/catalog.ts` 按原始 MIDI 的 SHA-256 匹配，创建一次 `MusicAnalysis`，分别准备灯光与屏幕内容。`screens/shows/BohemianTheatre.ts` 是普通 `ScreenContent`；`MidiTheatre.js` 是从用户参考提取的纯 Canvas 绘制模块，声明文件约束接入边界。它不访问场馆、镜头、音频引擎，也不启动循环。各播放器拥有并释放自己的背景、碎片、路径和过渡画布缓存。

动画直接读取歌曲绝对时间，暂停后不重复绘制，向前/向后跳转可重现同一画面。末尾按当前原始 MIDI 的结束时间（约 329.039 秒）淡出至黑屏，不额外增加参考播放器的 3 秒尾音。左右屏强弱和尾声淡出在 Canvas 内容中完成，LED 亮度仍由面板独立控制；整场亮度不作逐像素等同原参考的保证。

可以按目标屏幕手动导入图片、视频或换程序动画；「恢复歌曲画面」让所选屏幕追上当前歌曲时间。「恢复默认」回到场馆默认图案。换成未匹配歌曲或布局时，`SongScreens` 只释放仍属于旧歌曲内容对象的屏幕，保留手动替换的素材；重新载入匹配示例则重新启用三屏编排。关闭歌曲灯光不影响歌曲画面。自动镜头和通用素材时间线编辑器仍未接入。

## 验证

- `npm run screens:verify`：歌曲/独立时间、暂停、多屏独立、加载失败回滚、并发取消、异常隔离、销毁。
- `npm run screens:browser`：Chrome 实际导入 SVG 和 MP4、错误文件保留原图、视频暂停/跳转/歌曲同步、Canvas 与音频输入、ImageBitmap/VideoFrame/Texture、适配、外部所有权、手机布局和销毁。
- `npm run theatre:browser`：七幕三屏、过渡、暂停/倒退跳转、结束黑屏、缓存释放、主线联动、手动替换/恢复与非匹配歌曲。可设置 `REFERENCE_HTML` 指向原始参考，在 Chrome 比对 27 个原始绘制帧；`SCREENSHOT_DIR` 保存主线截图。
- `npm run stage:browser`、`npm run lighting:browser`：场馆和歌曲灯光回归。
- `npm run build`：类型检查与生产构建。

Chrome 测试沿用 `PLAYWRIGHT_MODULE` 指定已有 Playwright；`SCREENSHOT_PATH` 可以保存屏幕示例截图。不增加项目运行依赖。
