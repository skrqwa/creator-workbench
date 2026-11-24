# Creator Workbench 开发协作说明

## 前端界面改造（已定稿视觉规范）

修改 `src/`、`index.html` 或调整界面样式、布局、组件与主题时，先读取以下真源文件并严格对齐：

- [docs/ui-design-system.md](docs/ui-design-system.md)：已定稿的「黛青画册流 v2」信息架构、各页面交互细节、无障碍底线与最终审核清单。
- [src/tokens.css](src/tokens.css)：唯一的色板、字栈、圆角、阴影与日/夜主题 CSS 变量真源（WCAG AA 对比度已校准，组件内直接引用变量，不另写硬编码色值）。
- [docs/video-style-library.md](docs/video-style-library.md) 与 [src/video-style-presets.mjs](src/video-style-presets.mjs)：视频成品的「模板风格库」规范与前后端共享预设（含清锐紫白等 4 套皮肤、6 套跨题材结构模板、8 类组件素材与 5 套克制动效）。
- [docs/design-reference/](docs/design-reference/)：经确认的像素级 HTML 与 PNG 参考稿（创作页日/夜、视频风格模板库动态预览、八平台分发、选题灵感）。

## 工程边界与验证

- 界面全部使用自然简明中文；保留全部既有本地工程、OpenScreen、Qwen 配音、导出与八平台安全核对能力，不破坏 `desktop/` IPC 契约。
- 每次前端改造完成后，执行 `npm test`、`npm run build` 与 `npm run smoke` 验证全部通过，并在 `1440×900` / `1280×800` 下核查日间宣纸与夜间夜墨两套主题的界面截图后再交付审核。
