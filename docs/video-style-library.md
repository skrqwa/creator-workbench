# 创作工坊 · 视频模板风格库实现规范（已定稿）

本规范把提炼自 134 条实播参考样本的跨题材视频结构、配色、动效与画面组件固化为**可视化、可预览、可套用**的模板系统。

> **核心边界**：工作台自身软件 UI 沿用「黛青画册流 v2」（[src/tokens.css](../src/tokens.css)）；本模块定义的是**导出视频与图文成品**的视觉模板（默认首推高清晰的「清锐紫白」皮肤），只复用结构、对比度与节奏逻辑，不复制任何第三方 Logo、贴纸、文案或配乐。

---

## 1. 真源与像素参考

- **前后端共享预设数据**：[src/video-style-presets.mjs](../src/video-style-presets.mjs)
  - `VIDEO_PALETTES`：4 套视频配色皮肤（`crisp-violet` 清锐紫白、`celadon-paper` 黛青宣纸、`warm-amber` 暖光琥珀、`cinema-slate` 夜幕影棚），每套自带前端预览 `colors` 与后端导出 `mediaTheme`。
  - `VIDEO_TEMPLATES`：6 套跨题材结构模板（竖屏外框录屏教程、横屏交互课件长教程、明暗三段观点拆解、同构矩阵横评合集、左证右析文件解读、空间锚点连续运镜），每套自带默认画幅、组件绑定、动效参数与 `starterScenes` 默认分镜骨架。
  - `VIDEO_COMPONENTS`：8 类标准画面组件素材（顶部章节进度条、独立底栏胶囊字幕、多步单点高亮卡、左步骤卡+右真终端、对话生成成品卡、左红线+右阶梯、等待压缩/×1.5 标、不变空间方位锚）。
  - `MOTION_PRESETS`：5 套克制动效参数（显式时长与贝塞尔曲线，严禁震屏/闪白/满屏砸字）。
  - `ANTI_CLUTTER_RULES`：5 条去 AI 廉价感护栏。
- **可交互网页预览参考**：[04-模板风格库v2.html](design-reference/04-模板风格库v2.html)
- **高清截图参考**：
  - [05-style-library-violet.png](design-reference/preview/05-style-library-violet.png)（清锐紫白 · 9:16 竖屏外框教程）
  - [06-style-library-courseware.png](design-reference/preview/06-style-library-courseware.png)（清锐紫白 · 16:9 横屏交互课件）

---

## 2. 前端实现要求（`src/`）

1. **顶栏增加「风格模板」入口**：顶部主流程维持 5 项以内——`选题灵感` · `风格模板` · `内容创作` · `八平台分发` · `发布记录`。
2. **可视化预览而非纯文字列表**：
   - 左栏按三段排布：① 4 套视频配色皮肤卡（带真实色球，点击实时换肤）；② 6 套结构模板卡（带微型结构缩略图与画幅标）；③ 8 类内置画面组件素材标签（选中模板时高亮对应装配组件）。
   - 右栏为**实时动态视频预览舞台**：支持 `9:16 竖屏 / 16:9 横屏` 切换、实时呈现当前配色与组件动效（带「暂停动画 / 播放动画」按钮并尊重 `prefers-reduced-motion`）；下方以真实色块令牌 + 动效时长曲线 + 默认分镜骨架展示规格，点击「套用此模板新建作品」直接进入新项目。
3. **在「内容创作」页支持随时换肤与选卡槽**：允许创作者在项目内切换 `paletteId`（4 套视频皮肤）并在预览舞台实时看到外框、章节进度条与底部安全区字幕效果。

---

## 3. 工程数据与导出渲染兼容（`desktop/`）

1. **向后兼容 `project.json`**：新增可选字段 `stylePresetId`（默认按 `kind` 映射：`tutorial -> framed-screencast`，`brief -> contrast-opinion`）和 `paletteId`（默认 `crisp-violet`），旧工程缺少这两个字段时自动回退默认值，不破坏现有示例与 `npm run smoke`。
2. **接入 `desktop/media.mjs`**：导出横竖版 MP4、封面、小红书步骤图卡与带图教程时，优先读取 `getPalette(project.paletteId).mediaTheme` 作为渲染主题色（保留原有 `themes.tutorial` / `themes.brief` 作为兜底），并严格遵守底部独立字幕安全槽约束，避免字幕遮挡操作区。

---

## 4. 审核自检补充项

- [ ] 打开「风格模板」页可直接点击切换 4 套配色皮肤与 6 套模板，右侧动画舞台、色块令牌、动效参数与分镜骨架实时联动。
- [ ] 点击「套用此模板新建作品」后，新项目正确写入 `stylePresetId`、`paletteId` 与 `starterScenes`，重启工程后完整保留。
- [ ] 使用「清锐紫白」皮肤导出封面/图卡/短视频后，实际渲染产物呈现高对比紫白清晰风格且不破坏既有 34 项单测与 `npm run smoke`。
