# Band View 与相机层 · 交接备忘

这份文档记的是 `/studio/band/`（无 UI 乐队页）和它依赖的相机/音频层。
**重点在第 4 节"没做完的"** —— 后面出问题先看那里。

---

## 1. 这次动了什么（一览）

| 层 | 变化 |
|---|---|
| **相机** | 新增第 4 种视图 kind `band-orbit`；`CameraSystem` 补 `currentViewId`、resize 重算机位、`setCameraBounds` + `validateViews`；取景数学统一到 `CameraFraming`；删除死代码 `InstrumentOrbitMode.ts` |
| **展示** | 6 个 Atelier 模式装配抽成 `createAtelierShowcase()`；机位注册抽成 `registerAtelierViews()` |
| **鼓** | 与其他 5 件统一：距离改用共享函数、删过期 `viewportFraming`、补 `localToWorld`（它原本是唯一不做坐标转换的） |
| **音频** | 整套音频图抽成 `createBandAudioGraph()` |
| **Layout Lab** | 乐器呈现放大 `BAND_SCALE = 1.5`；相机从"外接球拟合"改为"包围盒拟合" |
| **新页面** | `/studio/band/` 与 `studio/band/index.html` |

---

## 2. 架构地图

### 2.1 相机层（`src/camera/`）

```
CameraRegistry      存"有哪些机位"（4 种 kind，见 2.3）
CameraFraming       两种"取景 → 距离"算法
  ├── distanceForOrbitView()   构图版：读 viewportFraming（保留区/边距）
  └── frameBounds()            盒拟合版：包围盒八角点求交，任意主体
  └── orbitPosition()          轨道机位
CameraSystem        唯一输出相机 + 过渡 + 机位身份 + 边界校验
```

**两条过渡路径都由调用方选择**（输入层不定策略）：

```ts
camera.goToView(id)         // 飞过去：时长 = 距离 ÷ MOVE_SPEED(4 m/s)，夹在 0.5–2.6 s
camera.goToView(id, true)   // 瞬切：调用返回前已到位
```

**过渡是插值轨道参数（yaw/pitch/半径），不是插值位置向量。** 见第 5 节，这条踩过坑。

### 2.2 坐标系：三层，靠 `localToWorld` 打通

```
① 乐器局部空间     29 个机位住在这里（donor 原生单位，约 10× 米）
      ↓ instrument.root 的世界矩阵
② 世界空间         相机最终在的地方
```

**关键**：机位坐标是 `instrument-orbit`，`CameraSystem.resolve()` 用 `instrument.root.localToWorld()` 出口。
所以**同一份 29 个机位数据同时适用于两套完全不同的场地**：

| | 主应用 `/assets/instruments/` | Band View `/studio/band/` |
|---|---|---|
| 乐器变换来自 | `AtelierStudioVenue.layout`（键盘 ×0.44、提琴 +2.213…） | `normalizeInstrument`（×0.151～0.583 + 贴地） |
| 机位数字 | 一个都不用改 | 一个都不用改 |

实测六件乐器两边 `goToView` 与实机姿态逐位相同。**这条是承重墙，不要动。**

### 2.3 四种视图 kind

| kind | 坐标空间 | 用途 | 会随窗口重构图吗 |
|---|---|---|---|
| `world` | 世界 | 绝对定点 | ❌ 存的是算好的位置 |
| `instrument` | 乐器局部 | 定点特写 | ❌ |
| `instrument-orbit` | 乐器局部 | **29 个乐器机位** | ✅ 每次 resolve 重算距离 |
| `band-orbit` | 世界 | **舞台机位** | ✅ 同上 |

> ⚠️ 要"拉窗口不跑构图"就必须用**后两种**。`world` 视图store 的是成品位置，无法自我重构图。

### 2.4 音频层（`src/audio/BandAudioGraph.ts`）

一份音频图：`AudioEngine` + `SampleLibrary` + `Sf2BankLibrary` + 6 个后端 + 6 个采样器。

**共享 SF2 库按 URL 缓存**，142 MB 音源只下载解析一次。

> ⚠️ **`BassSampler` 是六件里唯一没有 MP3 兜底的**（构造函数只收 backend，没有 `SampleLibrary`）。
> 后端没 `prepare()` 就**静默丢音**。`graph.prepare()` 是让它出声的唯一途径，且**不需要用户手势**
> （只有启动 AudioContext 才需要）。实测 `prepare()` ≈ 0.5 s。

### 2.5 状态机（`src/dev/band-viewer/StageDirector.ts`）

```
band   六件同台 · 拖动转视角 · 单击无事 · 双击乐器进入
focus  单件近景 · 该乐器展示模式接管全部输入 · Esc / 右键 退回
```

**乐器全程可见，不隐藏。** focus 是相机与输入状态，不是可见性状态。

**进入是"先飞、落地后再激活模式"**：模式 `activate()` 会自己硬切机位，提前激活会打断飞行。
落地信号是 `CameraSystem.isTransitioning` 变 false，由渲染循环里的 `stage.update()` 检测。

---

## 3. 怎么验证"没回归"（改任何相机相关代码都请照做）

### 3.1 主应用截图 —— 字节级比对

```powershell
# 基准（改动前先存一张）
node <cdp> "http://localhost:5173/assets/instruments/" "<temp>\baseline.png" 22000 "1"
# 改动后
node <cdp> "http://localhost:5173/assets/instruments/" "<temp>\after.png" 22000 "1"
# 比 sha256，要求完全相同
```

**这个场景是确定性的**，正常情况能到字节相同。本次所有重构都验过。

### 3.2 六件乐器姿态 —— 数值比对

探针 `probe-angles.js` 逐个切乐器，输出实机 yaw/pitch/radius。基准值：

| 乐器 | yaw | pitch | radius |
|---|---|---|---|
| drums.main | 0.36 | 0.32 | 8.667 |
| keyboard.main | 0.39 | 0.425 | 10.218 |
| violin.main | 0.22 | 0.06 | 14.010 |
| electric.main | −0.32 | 0.07 | 18.145 |
| acoustic.main | 0.31 | 0.09 | 20.053 |
| bass.main | 0.33 | 0.075 | 23.017 |

### 3.3 Band View 基准值

| 项 | 值 |
|---|---|
| 初始全景相机 | `[-0.02, 5.009, 6.559]` / target `[-0.02, 2.288, -1.136]` / fov 38 |
| 舞台机位 | `band:audience` / `band:rear` / `band:overhead` / `band:wing` |
| 边界校验 | `validateViews()` 应返回 **0** |

### 3.4 无头环境的坑

**软件渲染（SwiftShader）只有 ~0.5 FPS。** 想验证缓动/飞行的**落点**时，别干等，直接快进：

```js
bandView.camera.update(10);   // dt 一大，缓动一步到位并清空 desired
```

---

## 4. ★ 没做完的（排查先看这里）

### 4.1 ① OrbitController 未合并 —— **最大的结构遗留**

**现象**：全景转视角和近景转视角**是两套代码**，手感不一致。

| | 全景（`main.ts` 的 `stageOrbit`） | 近景（6 个 mode 各自内建） |
|---|---|---|
| 惯性 | ❌ 松手即停 | ✅ 会滑一段 |
| 平移 | ❌ | ✅ Shift+拖 / 右键拖 |
| 双指 | ❌ | ✅ |
| 俯仰范围 | `[-0.15, 1.35]` | `[0.04, 1.43]` |
| 提交 | `setPose(..., true)` | `setPose(..., true)` |

**排查入口**：`src/dev/band-viewer/main.ts` 的 `stageOrbit` + `applyStageCamera()`；
以及 `src/presentation/atelier/Atelier*ShowcaseMode.ts` 里各自的 `want/current` 状态。

**要做的事**：在 `src/camera/` 抽 `OrbitController`（yaw/pitch/distance/target + 惯性 + 平移 + 缩放 + 缓动），
Band View 先用，再把 6 个 mode 逐个迁过去。**每迁一个跑一次 3.1 + 3.2 回归。**

**风险**：中。动主应用正在用的代码路径。

### 4.2 `CalibrationAudioRuntime` 是第三份音频图

`src/audio/calibration/CalibrationAudioRuntime.ts` 里有和 `BandAudioGraph` 几乎相同的一份接线，但**不完全一样**：

| | BandAudioGraph | CalibrationAudioRuntime |
|---|---|---|
| backend label | `'drums'` | `'calibration-drums'` |
| acoustic gain | `0.86` | **无** |

**没有合并**，因为合并会改变校准工具的行为。要统一的话得给工厂加 label 前缀和 gain 参数。

### 4.3 `CameraSystem.currentViewId` 的语义边界

`setPose()` 被直接调用时会**清空** `currentViewId`（相机不再停在某个命名机位上了）。
所以"用户手动转过之后 resize 不重构图"是靠这个实现的 —— 见 `reframeCurrentView()`。
**如果将来有新的轨道控制器绕过 `setPose` 直接改 `output.position`，这个保护会失效。**

### 4.4 `StageDirector.update()` 依赖渲染循环

模式接管只在 `loop()` 里检测（`stage?.update()`）。渲染循环停摆时，相机会到位但模式不接管，
**那一帧输入是空的**。真机是 16 ms 的事；无头 0.5 FPS 下要等 1.5 s 以上，验证时别误判成 bug。

### 4.5 舞台机位只有 4 个，且受场馆几何硬约束

`band:rear` 原本是 180° 平视，**渲染出来是纯黑**：乐队中心离 LED 墙只有 ≈ 7 m，
而平视后方机位需要 ≈ 8.9 m 进深，相机落到了 z = −8.92（墙在 −8.2）。
现改为 `pitch: 0.85`（49°），水平进深缩到 5.3 m。

**加新舞台机位时注意**：`yaw` 越接近 π，需要的水平进深越大。
加完记得看 `validateViews()` 的输出 —— 它会直接点名越界的机位。

### 4.6 已知的历史遗留（本次未动）

- `LayoutEditorCameraPan.ts`（8 个 TS 报错）、`NocturneLayoutStage.ts`（5 个）、
  `MovementActionLab.ts`（1 个）——共 **14 个 `tsc` 错误**，是基线就有的，与本次无关。
  `npm run build` 因此走不到 `vite build`。
- `LayoutEditorRuntime` 仍是自己一套相机（`frameBounds` + 自己的 yaw/pitch/distance），
  没有并入 `CameraSystem`。

---

## 5. 踩过的坑（改相机前务必读）

### 5.1 外接球拟合会浪费画面

Layout Lab 原来用 `bounds.getBoundingSphere()` 定机位。乐队是**又宽又扁**的方阵，
外接球直径 5.95 m 而实际高度只有 1.41 m —— 相机被推远到 10.26 m，
主体只占画面 **43% 宽 / 20% 高**。改成包围盒八角点拟合后 → 7.04 m，**62.7% / 29.2%**。

### 5.2 插值位置向量会在天顶翻转

反向机位切换（如 观众席 ↔ 乐队后方）时，两个偏移向量的大圆**从天顶掠过**：

```
观众席  offset ≈ (0, 0.33, 0.94)
乐队后方 offset ≈ (0, 0.75, −0.66)
大圆中点 ≈ (0, 0.97, 0.25)   → 俯角 ≈ 75°
```

相机一旦几乎在目标正上方，`lookAt` 的 up 与视线平行，**滚转失去唯一定义 → 单帧突翻**。

**修法**：插值**轨道参数**（yaw 最短角 / pitch / 半径 / target），不用 slerp 偏移向量。
实测全部 12 组机位对：峰值俯仰 54.4°（等于端点最大值）、单帧最大转角 1.82°、零天顶风险。

### 5.3 指数缓动让"时长与距离无关"

原来的 `1 - exp(-dt·7)` 不管飞 2 m 还是 7 m 都是 ~0.5 s，7 m 跨舞台的峰值速度 **≈ 50 m/s**。
改成 `时长 = 距离 ÷ 巡航速度` 后：跨舞台 2.22 s、峰值 7.7 m/s。

调快慢只改 `CameraSystem.ts` 的 **`MOVE_SPEED`**（m/s）。smoothstep 峰值 ≈ 1.5 × 它。

### 5.4 模式激活会硬切相机

`Atelier*ShowcaseMode.activate()` 内部调 `selectView('whole', true)` —— **瞬切**。
所以 `StageDirector` 必须**先飞、落地后再激活**，否则飞行被打断。

### 5.5 模式 `deactivate()` 会重置镜头 fov

`deactivate()` 调 `camera.resetLens()`（fov → 42）。切换 focus 前要**先存 fov 再还原**，
否则飞行途中 fov 会弹一下。见 `StageDirector.releaseCamera()`。

### 5.6 `normalizeInstrument` 会清空 `userData`

它默认 `stripUserData: true`，会把 donor 的交互标签（`userData.hit` / `instrumentId`）洗掉 ——
编辑器需要这个行为。**但 Band View 必须传 `stripUserData: false`**，否则乐器"长得对但点不响"。

---

## 6. 常用入口

| 用途 | 位置 |
|---|---|
| 无 UI 乐队页 | `/studio/band/` |
| 乐器展示（主应用） | `/assets/instruments/` |
| 布局编辑器 | `/studio/layout/` |
| Band View 调试出口 | `window.bandView`（仅 DEV） |
| 主应用调试出口 | `window.virtualBandV2`（仅 DEV） |

**Band View 操作**：拖动转视角 · 滚轮推拉 · 双击乐器进近景（支架琴身都算）· 近景里 Esc 或右键退回 ·
全景 `1`–`4` 切舞台机位 · 近景 `1`–`5` 切该乐器命名机位 · `A S D Q W E T J K L 空格` 打鼓。
