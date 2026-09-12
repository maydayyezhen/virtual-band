# 演出创作接口：灯光、导播镜头与 LED

第一次接触仓库并要新增整首歌曲，先读 [新作品交付流程](NEW_SONG.md)。本文是各创作接口的统一入口。三块系统已有独立执行接口；编排需要同时考虑它们在歌曲时间上的配合。公共预设供借鉴，允许自由新增表现形式，接口不足时再扩展执行模块。源码类型是契约的最终依据，修改接口时同步维护本文。

## 先找对应入口

| 任务 | 接口与执行入口 | 可参考的作品 / 详细说明 |
| --- | --- | --- |
| 组装整场作品 | [catalog.ts](../src/shows/catalog.ts)：`PreparedBandShow`、`SHOW_EXAMPLES` | [主线架构](ARCHITECTURE_V2.md) |
| 灯光编排、新技法 | [LightingProgram.ts](../src/lighting/LightingProgram.ts)、[SectionShow.ts](../src/lighting/SectionShow.ts) | [BohemianRhapsody.ts](../src/lighting/shows/BohemianRhapsody.ts)、[灯光系统](LIGHTING_SYSTEM.md) |
| 机位、运动、切镜 | [CameraShow.ts](../src/shows/CameraShow.ts)、[CameraShowPlayer.ts](../src/camera/CameraShowPlayer.ts) | [BohemianCamera.ts](../src/shows/BohemianCamera.ts)、[镜头系统](CAMERA_SYSTEM.md)、[波西米亚导播](BOHEMIAN_DIRECTION.md) |
| LED 素材、程序动画、多屏构图 | [ScreenContent.ts](../src/screens/ScreenContent.ts)、[ScreenSession.ts](../src/screens/ScreenSession.ts) | [BohemianTheatre.ts](../src/screens/shows/BohemianTheatre.ts)、[屏幕内容接口](SCREEN_CONTENT.md) |
| 片头片尾 | [TitleShow.ts](../src/titles/TitleShow.ts) | [BohemianTitles.ts](../src/shows/BohemianTitles.ts) |
| 离线成片 | [OfflineStage.ts](../src/export/OfflineStage.ts) | [导出范围与操作](VIDEO_EXPORT.md) |

作品工厂 `prepare(music, rig)` 返回四条轨道：`{ lighting, screens, camera, titles }`。目前这四个字段均为必填，局部实验可复用原作品其他轨道。宿主向各模块提供同一播放器的歌曲时间；`MusicAnalysis` 提供节拍和声部分析，不负责播放音频。模块通过各自端口输出，不相互启动或接管。

编排前先看乐曲段落、实际演奏实例，以及灯光/LED 的关键变化。舞台画面发生重要变化时留出展示窗口，变化平缓处再安排乐器特写，并检查该实例当时确实在演奏。新作品可以有自己的艺术取舍，这不是固定镜头配方。

主线 `/studio/band/` 的「自由创作示例」使用原波西米亚 MIDI 和原 LED，演示新写的镜头轨迹、转场和流动灯光。点击「载入波西米亚示例」恢复原作品。示例不是新歌曲成片，只用于验证创作接口。

## 作品与公共库

- `src/shows/examples/FreeformStudy.ts`：一份可运行的原创灯光和镜头示例，新增设计不要求先注册公共预设。
- `src/camera/shots/ConcertShots.ts`：从波西米亚提取的琴键、琴桥、电子琴、鼓组、萨克斯等机位，以及 NOCTURNE 全景/中景。工厂返回独立对象，可在作品中修改。乐器机位按当前模型的局部坐标编写；场馆机位使用 NOCTURNE 世界米制坐标，不承诺适用所有新模型和场地。
- `src/lighting/patterns/ConcertLooks.ts` / `ConcertShow.ts`：原有 11 类组合技法，保留既有视觉。它们仍有针对当前场馆的轨迹数值，属于可借鉴的技法而非跨场馆自动适配器。
- 歌曲文件保留节拍、段落、对象选择和艺术设计。需要时直接写新函数，成熟后再抽成库。

## 镜头位置、运动与转场

`CameraCue.from` 接受原有 `ShotFraming`，也接受明确的 `{ position, target, fov }`。无 `subject` 时为世界坐标；带 `{ type, instance }` 时由真实实例的模型局部坐标转换到世界坐标。舞台运行时仍应用场馆镜头活动边界。

```ts
const cue: CameraCue = {
  time: 0, name: '自己的升降轨迹',
  from: { position: [-7, 5, 29], target: [0, 4, 0], fov: 42 },
  motion: ({ from, progress }) => ({
    ...from,
    position: [-7 + 10 * progress, 5 + 5 * Math.sin(progress * Math.PI / 2), 29 - 5 * progress],
  }),
};
```

`motion` 收到绝对 `time`、镜头内 `elapsed`、`duration`、线性 `progress`、起止构图。可以自行实现曲线、关键帧、速度曲线、目标运动和变焦；省略时仍是原有缓入缓出插值。`interpolateShot` 可供作品组合使用。`from` 也是主体声明：轨迹必须保留主体，以便 MIDI 演奏检查覆盖整个镜头；需要换主体时新建 cue。

默认切镜；`transition: { kind: 'glide', seconds }` 是原有平滑衔接。新的 `{ kind: 'custom', seconds, sample }` 接收前镜头末端、当前镜头当前采样的**世界坐标**与转场进度，返回世界位置、目标和 FOV，可以创作新的过渡路径。它控制单台相机的运动，不是多画面溶解/擦除；那类画面转场需另增渲染合成接口。

所有采样函数同步、无累积状态，资源在编排创建时准备，不另开 RAF。减少动态效果设置会固定镜头中点时间并关闭运动转场。非法轨迹或不存在的主体保留上一有效机位，面板显示错误；离线导出遇到同类错误停止，不输出静默失效的画面。

## 原创灯光与扩展技法

`createLightingProgram` 从完整的中性灯架状态起步，不要求选择 `rock`、`opera` 等模式。提供有序 `effects`：

```ts
const show = createLightingProgram({
  id: 'my-show', title: '我的光廊',
  sections: [{ beat: 0, name: '开场', speed: .2 }],
  effects: [{
    fixture: (base, fixture, { music, current }) => ({
      target: [fixture.position[0] * .5, 3 + Math.sin(music.t * current.speed), 2],
      intensity: .2 + music.kick * .4,
      color: rgb('#65dce8'),
    }),
  }],
});
const prepared = prepareSectionShow(show, musicAnalysis, venue.lighting.rig);
```

可分别自定义 `fixture`（目标/颜色/强度/角度等）、`pixel`（灯带单元）、`gobo`（图案旋转/颜色/透明度）、`environment`（基础光/背景/雾）、`master`。每个函数收到本帧已有输出、真实硬件描述及歌曲/段落上下文，返回要改的字段。每次求值从基础帧重新生成；后层接收同一帧前层结果，绝不累加上一渲染帧。不要原地修改输入。

`withLightingEffects(existingShow, effects)` 可以扩展任何现有 `SectionShow`；`createConcertShow({ ..., effects })` 可直接给原技法增加原创效果。需要全局、多灯具联合求解时，仍可直接实现 `SectionShow.evaluate(context)`，返回完整 `LightingFrame`；无需勉强塞进逐灯回调。

段落 `transitionSeconds` 提供过渡进度，原生程序自行决定怎样使用 `current`、`previous`、`transition`，不强制一种过渡风格。灯具由 ID 匹配，空灯带/图案列表正常工作。终曲淡出也是作品行为，应使用 `music.finished` 或歌曲剩余时间编写。场馆在应用前校验完整帧；运行时出错保留上一有效帧并显示错误，其他系统继续运行，离线导出则停止。

## LED 内容与自由创作

LED 已有通用内容接口，无需再为图片、视频和程序动画各建一套系统。从 [screens/index.ts](../src/screens/index.ts) 使用 `imageContent`、`videoContent`、`textContent`、`canvasContent` 或 `surfaceContent`；任意新内容可直接实现 `ScreenContent`：

```ts
interface ScreenContent {
  readonly label: string;
  create(screen: ScreenDescriptor, signal: AbortSignal): ScreenPlayer | Promise<ScreenPlayer>;
}
interface ScreenPlayer {
  readonly surface: CanvasImageSource | Texture;
  update(frame: ScreenFrame): boolean | void;
  dispose(): void;
}
```

`create` 收到屏幕 ID、物理尺寸和像素尺寸，每块屏幕创建独立播放器。主屏、左右屏可分别构图，不能假设所有屏幕比例相同。`update` 收到 `time`、`delta`、`playing`、`width`、`height` 和可选 `audio`（波形/频谱），返回 `false` 表示无需刷新纹理。`canvasContent` 的绘制回调只接收画笔和帧；需要屏幕 ID 时，在外层 `create(screen, signal)` 中选择内容或闭包传入。

可以自己写粒子、叙事动画、图片/视频混合及内容间转场，在同一 Canvas 或自有渲染器中合成，再提供画面或 GPU 纹理。无需注册成内置动画预设。素材异步加载放在 `create`，响应取消信号；`update` 同步求值，不启动额外 RAF。用绝对歌曲时间计算程序画面，保证暂停与倒退跳转可重现；随机效果使用固定种子或时间索引。

`ScreenSession` 负责加载、取消、替换、歌曲/独立时钟及销毁；[SongScreens.ts](../src/screens/SongScreens.ts) 管理歌曲内容的接入与恢复。保留面板手动替换及「恢复歌曲画面」行为。`surfaceContent` 默认借用外部资源，拥有资源的自定义播放器必须在 `dispose` 释放它们。视频默认静音，LED 的音频输入来自已有混音分析，不另建歌曲播放器。生命周期和全部字段见 [屏幕内容接口](SCREEN_CONTENT.md)。

**实时支持不等于已经支持逐帧导出。** 当前波西米亚 Canvas 剧场可离线求值；普通 HTML 视频的实时校时不保证导出逐帧准确，实时频谱也没有离线 PCM 输入。引入这类内容并要求成片时，需要补对应解码/采样能力。导出已按目录 ID 选择作品，但仅允许作品显式声明 `offline.supported: true`；声明本身不证明新内容支持离线；参见 [视频导出](VIDEO_EXPORT.md)。

## 接入与验证

在 `src/shows/catalog.ts` 注册作品工厂，返回 `PreparedBandShow`。默认拖入 MIDI 仍按精确 SHA-256 匹配原作品；显式选择创作示例会选指定工厂，同时保留内容校验。函数是受信任的项目 TypeScript，不把用户输入当代码执行，也不把函数强行序列化成 JSON。

新增目录条目会自动生成游戏选歌项（`menu: null` 的技术实验除外），无需再添加 UI 按钮。工作台原有两个示例快捷按钮位于 [LightingPanel.ts](../src/dev/band-viewer/LightingPanel.ts)，不作为完整歌曲目录；宿主接入位于 [main.ts](../src/dev/band-viewer/main.ts)。新作品的数据与函数放在作品文件，只有多个作品需要的通用能力才抽到执行模块。

主线默认先显示开始界面，再进入选歌页；正式作品的素材、封面、预览信息及四轨工厂统一写在 [ShowDefinition](../src/shows/ShowDefinition.ts) 作品定义中，在 `catalog.ts` 注册一次。[SongLibrary.ts](../src/app/stage/SongLibrary.ts) 只是目录的派生视图，不维护第二份数据。高亮曲目自动试听，沿用 MIDI 播放器，不创建乐队；开始演出时才组装场景。[StageShell.ts](../src/app/stage/StageShell.ts) 只管理导航、展示和交互状态。实验示例仍保留在「创作工具」；`?workspace=1` 可直接进入旧工作台，`?offline=1` 保持导出入口。

按改动选择相关检查，接口或运行时代码改动执行构建，并在 Chrome 预览受影响片段、暂停和跳转。不必为了文档调整重复全曲检查或导出视频。现有检查中的波西米亚专用验证不会自动覆盖新作品，新增作品需换成对应声部、时间和内容断言。

- `npm run song:verify -- --song <id>`：当前作品素材、版本、预览、四轨、特写演奏状态与灯光倒序求值；详见 [新作品交付流程](NEW_SONG.md)。
- `npm run show:authoring:verify`：原创位置/轨迹/转场、倒退跳转、减少动态效果、灯光叠层/各类硬件、错误隔离；对比改动前 27 个波西米亚镜头及 241 帧灯光输出。
- `node scripts/verify-show-authoring-browser.mjs`：Chrome 中切换两套作品、真实场馆输出、实时求值与离线求值一致、手动接管、移动端按钮。
- `npm run camera:performance:verify`：原作品每个特写切入时正在演奏，以及镜头内停奏间隔。
- `npm run lighting:verify` / `node scripts/verify-camera-show-browser.mjs`：原灯光和镜头回归。
- `npm run screens:verify` / `npm run screens:browser`：LED 时钟、加载替换、内容源、资源释放和交互；`npm run theatre:browser` 检查原七幕剧场及多屏联动。
- `npm run build`：类型检查与生产构建。浏览器脚本需本地 Vite 服务及 `PLAYWRIGHT_MODULE`，配置见 [README](../README.md)。

基线 `scripts/fixtures/bohemian-show-baseline.json` 捕获自 `47bbc81`，用于此次重构的效果保留检查；有意重编作品时，应审阅相应输出变化后更新基线。
