# 随安装包分发的组件

Creator Workbench 的自有代码采用 MIT 许可。安装包还包含独立程序、开源库和可编辑示例，各自的许可证随组件分发。

| 组件 | 用途 | 许可与源代码 |
| --- | --- | --- |
| Electron / Chromium | 桌面窗口、创作者后台 | [Electron 源码和 MIT 许可](https://github.com/electron/electron)，安装目录附 Chromium 组件许可 |
| FFmpeg / ffmpeg-static | 在独立进程编码 MP4、处理旁白、字幕和封面 | [FFmpeg 6.1.1 源码](https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz) · [分发构建、各平台来源及许可](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1) · [ffmpeg-static GPL-3.0-or-later](https://github.com/eugeneware/ffmpeg-static) |
| resvg-js | 离线栅格化导出图片 | [项目与许可证](https://github.com/thx/resvg-js) |
| React、Lucide、fast-xml-parser 和 MCP TypeScript SDK | 编辑器界面、图标、订阅源解析和知乎定向授权接口 | [React](https://github.com/facebook/react) · [Lucide](https://github.com/lucide-icons/lucide) · [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) · [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) |

安装目录的 `resources/app.asar.unpacked/node_modules/ffmpeg-static/` 附有对应二进制的 README 与许可证。FFmpeg 的构建参数可以通过随附可执行文件的 `-buildconf` 查看。依赖锁定在 `package-lock.json`。

示例图片、练习录屏和合成旁白的作者、许可、参考资料见 [示例署名](examples/CREDITS.md)。OpenScreen、Qwen Voice Clone 和 AiToEarn 插件独立安装。
