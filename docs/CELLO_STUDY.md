# 大提琴建模样板

入口：`http://localhost:5173/studio/cello/`。

这是保留的静态造型检查页。大提琴和琴弓现已接入 `/studio/band/` 的乐器目录、自动编队、自由弹奏与 MIDI 演奏；此页仍不创建音频引擎，可切换白模与木材漆面、正侧背面和局部近景，也可与现有小提琴比较。

## 模块边界

- `src/instruments/cello/createCelloModel.ts`：只依赖 Three.js，`createCelloModel()` 同步返回 `{ root, dispose }`；原生米制，正面朝 +Z，尾柱接地为 Y=0。多次调用创建独立资源，调用方移出场景后负责调用 `dispose()`。
- `src/instruments/cello/createCelloBow.ts`：独立琴弓工厂，局部 +X 从调节钮指向弓尖，弓毛位于 Y=0。包含弯曲渐细弓杆、扁平弓毛、乌木弓根、贝母眼、金属箍、皮革握位、银丝缠绕及弓尖护片。摆放由展台负责，未附加到琴身，也不改变琴身的米制尺寸。
- `src/dev/cello-study/`：负责灯光、镜头、材质检查与对比操作；不创建音频引擎。
- `createCelloAssembly.ts`：复用琴身和琴弓工厂，统一静态摆放与释放；布局编辑器、静态展台、演奏实例共用。
- `CelloInstrument.ts`：每个实例独享 GM42 的 SF2 通道和输入状态。现场音符由共享 `LiveAudioEngine` 发声；MIDI 的 `visualNoteOn/Off` 只驱动指位提示和琴弓，原谱声音仍由序列器播放。
- `CelloStringMotion.ts`：四根独立的动态弦网格，复用顶点缓冲；力度控制振幅，琴桥和按弦点固定，只让有效弦长振动，弓毛接触处降低振幅。实时输入与 MIDI 共用视觉状态，松音保留短衰减，reset 恢复原始直弦。振动采用与现有小提琴一致的可见慢振表达，不模拟真实声学频率。
- `studio/cello/index.html`：独立预览入口，包含于 Vite 构建。

局部取景使用 `cello:body`、`cello:bridge`、`cello:scroll` 等具名组。模型不引用相机、DOM、应用状态或 MIDI。GM42 对应大提琴，GM48/49 合奏保留原来的键盘后备；当前波西米亚示例没有 GM42，不会因加入大提琴而替换合奏轨。

主线双击大提琴进入演奏，按住指板或使用 A–K 半音阶试音，拖动可换音；桥与指板之间区域触发对应空弦。音高按 C2/G2/D3/A3 定弦计算，指位显示最多覆盖每弦两个八度。超出模型指位范围的 MIDI 音高仍完整播放。琴弓用简化的往复与换弦姿态提示当前最新音符，多音声音不被视觉姿态裁剪；停音后回到停放位置。这是演奏可视化，不是力学仿真或完整指法求解。

琴弓增加 `cello:bow`、`cello:bow-frog`、`cello:bow-tip` 取景组，支持整体、弓根和弓尖的材质/白模检查。外部零件参考 [Yamaha 琴弓规格](https://usa.yamaha.com/products/musical_instruments/strings/bows/cbb305/specs.html)，木质外观延续项目原小提琴琴弓，无品牌标志。

## 检查

大提琴支持与小提琴相同的 `1` 运弓 / `2` 拨弦切换，也可点击演奏面板按钮。拨弦使用现有 GM45 SF2 音色，琴弓停放，弦一次受激后自然衰减；切回运弓恢复 GM42。实时演奏方式与原 MIDI 的视觉演奏方式分别保存。

`npm run build` 检查类型和生产入口。`npm run cello:browser` 使用本机 Google Chrome 检查有限几何坐标、米制范围、视角与材质切换、对比、拖拽、窄屏布局及无音频请求。可通过 `PLAYWRIGHT_MODULE` 指向现有 Playwright 安装，通过 `SCREENSHOT_DIR` 保存各视角截图。

`npm run cello:integration:browser` 检查主线舞台的高度与落地、实际拾取、按键与指针输入独立释放、失焦释放、SF2 可听输出、运弓与停放、静音 MIDI 视觉接口、GM42 导入，以及两把大提琴的实际双击和输入归属。

`npm run cello:vibration:browser` 检查活动弦逐帧变形、其他弦静止、固定端点、按弦后的静止区段、力度响应、松音衰减、reset、实时/MIDI 状态独立释放，以及网格复用。

造型验收仍需看图：正侧背轮廓、拱面与镶线、F 孔切边、弦桥接触、琴颈过渡、卷首雕刻及木材纹理。自动检查通过不代表美术质量达标。
