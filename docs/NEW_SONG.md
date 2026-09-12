# 新作品：从 MIDI 到游戏内交付

这是第一次接触仓库的 agent 的完整工作入口。先读本页，再按 [演出创作接口](SHOW_AUTHORING.md) 找需要的类型和范例。目标是完成一首有整体设计的作品，而不是把波西米亚换个名字或堆叠预设。

## 1. 确认输入，理解音乐

本流程以**确定版本的 MIDI**为输入，产物是游戏中的舞台演出，不包含凭空作曲、生成原唱人声或从 MP3 自动还原多轨 MIDI。用户尚未提供可用 MIDI 时，先明确来源和具体编曲版本。不要拿同名的另一份 MIDI 配已有时间轴。

素材放 `public/examples/<song-id>/`；原始 MIDI 不改写，音色程序、踏板、力度和混音控制交给现有 SpessaSynth。记录素材来源，封面使用原创 AI 图或用户指定素材。

```powershell
npm run midi:analyze -- public/examples/<song-id>/song.mid
(Get-FileHash public/examples/<song-id>/song.mid -Algorithm SHA256).Hash.ToLowerInvariant()
```

分析报告给出真实声部、路由和乐器实例。读 [MIDI 边界](MIDI_PLAYBACK.md)，不要用音符密度代替听觉判断。试听全曲，标出开场、主歌、高潮、独奏、间奏、尾声和重要换段时间；变速曲用 `MusicAnalysis.secondsAtBeat()` 转换拍号位置，不按固定 BPM 估时间。

## 2. 写一份简短的创作安排

在 `docs/shows/<song-id>.md` 记录整体主题、主色、分段时间，以及每段灯光、LED、镜头和文字的配合。简短到足以指导实现即可，不需要白模评审、多轮方案或先造框架。

- 大的灯光/LED 变化留给全景；安静或变化少的段落可讲述乐器细节。
- 特写绑定真实 `{ type, instance }`，同类型的多个实例必须分清。检查各个实际声部是否获得合适的表现机会，不照抄钢琴偏重的镜头比例。
- 允许原创机位、运动曲线、转场路径、灯光技法、Canvas 叙事动画；公共库是参考，不是创作上限。
- 开场、高潮和收尾必须有完整设计。片头片尾使用 `TitleShow`，不把文字散落在页面或导出脚本里。

## 3. 实现作品，集中注册

参照 [BohemianShow.ts](../src/shows/BohemianShow.ts) 创建自己的作品定义，可放 `src/shows/<SongName>Show.ts`。复杂轨道可以拆成同作品目录下的文件。类型契约为 [ShowDefinition.ts](../src/shows/ShowDefinition.ts)。

一份定义包含：

| 字段 | 填写内容 |
| --- | --- |
| `id` | 唯一、稳定的小写英文 ID，允许数字与连字符 |
| `title / artist / credit` | 作品名、音乐作者、制作署名，导出也使用这些信息 |
| `midiUrl / sha256` | public 素材 URL 与精确文件校验值 |
| `menu` | 游戏展示标题、中文副标题、时长、封面、简介、预览起点与长度；技术实验填 `null` |
| `offline` | 确认确定性离线渲染后填 `{ supported: true }`；否则填 `{ supported: false, reason: '具体缺失能力' }` |
| `prepare(music, rig)` | 返回 `{ lighting, screens, camera, titles }` 四条轨道 |

然后只在 [catalog.ts](../src/shows/catalog.ts) 导入并加入 `SHOW_EXAMPLES`。**不再编辑 `SongLibrary.ts` 或给新歌手写按钮**：正式作品的封面、自动预览、选择与播放都会从目录生成。`menu: null` 的实验仍可按 ID 加载或导出，但不出现在游戏选歌列表。工作台的两个旧快捷按钮只是原有演示，不是作品注册入口。

资源 URL 使用 `/examples/...`、`/artwork/...` 等 public 内路径。预览范围必须落在真实歌曲时长内，选一段有声音且有代表性的音乐。`menu.title` 是游戏和视频标题；轨道自己的片头片尾要采用一致的作者信息。

不要另建音频播放器、时钟或 RAF。宿主负责实例生成、自动编队、暂停菜单、加载遮罩和资源释放。若新歌暴露出模型缺失或路由错误，明确处理这一问题；不要靠改 MIDI 音色、硬编码实例数量或改全局镜头来掩盖。

## 4. 验证技术正确性，再审阅作品

```powershell
npm run song:verify -- --song <song-id>
npm run build
```

不传 `--song` 会检查全部已注册作品。检查包括 ID 唯一性、MIDI 哈希、封面存在、菜单时长/预览范围、四条轨道、镜头排序、特写切入正在演奏且镜头内休止不超过一秒、片头片尾范围，以及灯光顺序/倒序采样一致性。灯具描述使用仓库中的 NOCTURNE 基线；修改场馆后需复核描述。**这不证明构图好看、LED 正确或全曲质量合格**；有意采用不同的停奏镜头语言时，明确说明并调整验证规则，不能静默删除失败断言。

启动 Vite，用 Chrome 进入 `/studio/band/`，验证新歌的封面、高亮预览、加载、完整演出、Esc 暂停/继续、返回选歌，再切到另一首确认没有音频叠播或旧资源残留。需要直接跳段检查时，用 `?workspace=1`，开发控制台可执行 `await bandView.loadLightingExample('<song-id>')`，再调用 `bandView.player.play()` / `seek(seconds)`。这些仅用于开发检查。

至少审阅开场、每个重要换段前后、各类特写、高潮和尾声；交付全程作品需要从头到尾审阅一次，可以边播放边观察，不必为每次小调整重复全曲。检查穿模、遮挡、错误主体、画面亮度、多屏比例、跳转恢复和结束黑场。编排代码不变时不用反复导出整曲。

`song:verify` 没覆盖的自定义轨道/新接口，补针对性验证。若改通用镜头、灯光或音频执行模块，再运行 [创作接口](SHOW_AUTHORING.md) 中对应回归入口，保证旧作品保留。

## 5. 按需要导出

```powershell
npm run video:export -- --list
npm run video:export -- --song <song-id> --start 30 --duration 5 --fps 30 --output exports/<song-id>-sample.mp4
npm run video:export -- --song <song-id> --fps 60 --output exports/<song-id>-full.mp4
```

先用短片验证自定义内容，用户需要视频时再完整导出。音乐和视频使用同一目录项，未知 ID、MIDI 版本不符或声明不支持离线的作品会提前失败。`offline.supported` 是作者声明，不是程序自动证明：外部 HTML 视频和依赖实时频谱的 LED 仍需要对应离线解码/采样支持。详见 [视频导出](VIDEO_EXPORT.md)。

## 交付

最终说明作品 ID、进入方式、艺术设计重点、实际验证范围及遗留限制。交付文件包括 MIDI/素材、作品定义与四轨编排、封面、目录注册、短创作记录和适用验证。用户要求视频时附成片及导出报告；用户要求 Git 提交时才执行相应提交任务。不要只交代码片段，也不要把临时烟雾测试作品留在正式选歌列表。

可以给新 agent 的任务：

> 阅读 AGENTS.md 和 docs/NEW_SONG.md，为这份 MIDI 完成整首舞台作品并加入游戏。自行设计灯光、LED、导播镜头与片头片尾，允许新增表现技法；制作 AI 封面，设置自动预览，保持现有菜单与播放架构。按文档完成技术检查和全曲画面审阅，交付可在选歌页直接播放的作品，说明实际验证结果。视频仅在我明确要求时导出。
