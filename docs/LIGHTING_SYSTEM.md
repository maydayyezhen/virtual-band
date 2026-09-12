# 主舞台灯光与歌曲编排

主线入口：`/studio/band/`。点击「载入波西米亚示例」，再点击底部播放。固定机位菜单的「灯光全景」可以手动查看完整灯架；段落菜单可以跳转到指定音乐段落。「歌曲灯光」关闭后恢复装饰灯光，音乐继续播放。

## 模块边界

```text
原始 MIDI ──→ SpessaSynth MidiPlayback ──→ 唯一播放时间
    │                                      │
    └──→ MusicAnalysis（音符、声部、速度图） │
                       │                   │
段落表 / 轨迹函数 ──→ PreparedLightingShow.evaluate(seconds)
                                │
                         完整 LightingFrame
                                │
                         LightingSession
                                │ 独占控制 / 释放恢复
                       NocturneVenue.lighting
                                │
               光束、实际照明、灯条、地面图案、环境光和雾
```

- `src/lighting/Lighting.ts`：纯数据协议。位置使用世界坐标、米；角度使用度；颜色使用线性 RGB。每一帧包含完整灯具状态，不能靠上一帧补齐。
- `MusicAnalysis.ts`：复用现有 `@tonejs/midi`，从原始 MIDI 读取全部声部，不受舞台乐器分配和可视化删减影响。保留速度图，以连续四分音符拍位置驱动运动；支持自定义音符到声部的映射。
- `SectionShow.ts`：按拍定位段落，转换为秒，确定当前/上一段以及过渡权重。相同时间必定返回相同结果。
- `ConcertShow.ts`：公共演唱会编排模板。处理双配色、光束过渡、声部响应、灯条追逐、地面图案和结尾淡出。`patterns/ConcertLooks.ts` 提供 11 种可复用场景；轨迹尺寸按 NOCTURNE 场馆编写，其他场馆需适配轨迹尺度。
- `LightingSession.ts`：主页面现有循环调用 `update(player.time)`。没有自己的 RAF、AudioContext 或累计时间；暂停不会漂移，拖动进度直接重建结果。
- `venues/nocturne/NocturneLighting.ts`：场馆私有灯具适配、独占控制和资源销毁。编排看不到原生灯具对象，也不能操作镜头、屏幕、乐器或播放器。

## 新增一首歌曲

已有表现形式只需写段落表，无需改舞台、播放器或主页面：

```ts
import { createConcertShow } from '../ConcertShow';

export const mySong = createConcertShow({
  id: 'my-song',
  title: '我的歌曲',
  transitionSeconds: 1.15,
  level: .86,
  flash: .8,
  fadeOutSeconds: 9,
  sections: [
    { beat: 0, name: '前奏', kind: 'piano', color: '#6faedb', second: '#ecc594', power: .4 },
    { beat: 64, name: '主歌', kind: 'ballad', color: '#edb77d', second: '#546ba5', power: .45 },
    { beat: 128, name: '高潮', kind: 'rock', color: '#f47b4d', second: '#f4d6a1', power: 1 },
  ],
});
```

然后在 `src/shows/catalog.ts` 注册 MIDI 的 SHA-256 和 `prepare` 方法。目录位于应用编排层，分别返回灯光编排与屏幕内容源；两者共享音乐分析及播放时间，互不操作对方。拖入匹配 MIDI 会自动启用对应编排，不用按文件名猜测。不同版本、不同速度图的同名 MIDI 不会误套用。

新增表现形式时，可以增加公共轨迹函数，或实现 `SectionShow.evaluate(context)` 返回 `LightingFrame`；这仍属于编排层。只有需要新的物理灯具/渲染能力时才扩展场馆适配器。当前示例按钮对应 Queen；歌曲识别目录可以注册多首，尚未制作曲库管理界面或可视化编排编辑器。

## 场馆控制与资源

`venue.lighting.rig` 描述 30 个灯具、56 个灯条像素和 4 个地面图案。`acquire()` 返回独占 lease；第二个控制者会被拒绝。`apply(frame)` 先校验完整帧的 ID、范围和有限数值，再修改场馆。`release()` 可重复调用，恢复接管前装饰状态；释放后的旧句柄不能继续写入。

灯条与地面图案按需创建，关闭编排时从场景移除，场馆销毁时释放几何、材质和纹理。所有 30 条可见光束保留，真实表面照明使用 6 个固定槽位，按向下照射灯具的强度选择；避免让所有材质计算 30 个 SpotLight。它是性能折中，不是严格物理等价的全灯实时照明。地面图案采用纹理平面，与参考实现一致，不是真实投影到任意物体的 gobo。

纯灯光帧涵盖环境光、主照明、背景色和雾。LED 内容继续由原有屏幕模块更新，镜头仍由 `StageDirector` 控制；歌曲编排不写它们。灯光全景是手动机位，歌曲切段不会切镜头。

## 波西米亚示例来源与差异

`public/examples/bohemian-rhapsody/queen.mid` 从用户提供的 `queen-bohemian-midi-lightshow (1).html` 内嵌 MIDI 原样提取；章节、光束轨迹、配色、音符响应、灯条与图案表现由同一参考整理成独立模块。

保留 11 个按拍编写的段落，以及 78 → 154 → 78 BPM 变速。音频继续由 SpessaSynth 播放原始字节。主线结束时间采用原始 MIDI 结束事件（约 329.039 秒），不复制参考合成器额外增加的 3 秒展示尾音规则。参考屏幕故事已作为独立 LED 内容源接入，见 [SCREEN_CONTENT.md](SCREEN_CONTENT.md)。音色复刻和自动镜头不属于这次接入。

旧 `assets/venues/nocturne/lighting/v2` 实验保留原状，不作为主线执行器。其秒制、pan/tilt 协议与这里的世界目标、速度图及附加灯具不一致，因此没有通过兼容补丁硬接；主线保留同样的纯时间求值原则，并建立统一的完整帧接口。

## 验证

- `npm run lighting:verify`：2402 个采样帧正反向求值一致、11 段定位、变速与连续拍相位、持续音响应、内容匹配、暂停/跳转/释放。
- `npm run lighting:browser`：真实 Chrome + 原始 MIDI 播放；固定镜头比较各段，播放/暂停/停止/跳转、终曲熄灯、关闭恢复、独占控制、非法帧、重复加载和同名不同曲文件。
- `npm run stage:browser`、`npm run camera:browser`：独立场馆/布局、手动镜头和漫游回归。
- `npm run build`：类型检查和生产构建。

Chrome 脚本使用已安装的 Chrome；本机可设置 `PLAYWRIGHT_MODULE` 指向现有 Playwright 模块，不增加项目运行依赖。`SCREENSHOT_DIR` 可指定灯光测试截图目录。
