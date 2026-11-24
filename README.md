# Creator Workbench · 创作工作台

在自己的电脑上把一个选题做成完整视频、竖版短片和带图教程，再按平台调整和投稿。作品、配音、素材和平台版本保存在同一个可继续编辑的工程里。

[下载安装包](https://github.com/skrqwa/creator-workbench/releases/latest) · [查看安装包测试](https://github.com/skrqwa/creator-workbench/actions/workflows/desktop.yml)

![宣纸浅色主题下编辑《用标签找回写作灵感》，左侧编排分镜，右侧预览成片](build/studio-v2-light.webp)

[查看同一工程的夜墨深色界面](build/studio-v2-dark.webp)

## 从第一期开始

1. 在 Windows 运行对应的 `.exe` 安装程序。在 macOS 打开与芯片匹配的 `.dmg`，把应用拖入「应用程序」。当前个人开源发行包使用 Windows 未签名安装包与 macOS 本地签名。可对照发行页的 SHA256SUMS 核对下载。
2. 打开「录屏教程」或「热点口播」。前者附一个可操作的选题簿练习页、实际操作录屏和分段解说，后者以嫦娥六号为例，附原始出处、图片、旁白及字幕。作品编辑页可改文稿、替换图片和音频、安排分镜顺序和时长。
3. 在「导出成品」生成横版及精简竖版 MP4、封面、PNG 图集和带图 HTML / Markdown 教程。导出物保存在工程的 `exports/` 下。要换电脑继续编辑，把整个工程目录复制到另一台电脑，再在项目库中选择「从文件夹打开」。
4. 在「八平台分发」调整各平台的标题、正文、封面及素材。要一起核对多个账号，点「批量核对」，勾选账号并逐个预览。只想试存草稿时，把每个账号都设为「去平台复核」，确认页应显示 0 个账号直接提交。

## 收集选题和制作

- **选题收件箱**支持 RSS、Atom、GitHub Releases（输入 `owner/repo`）和手工收藏。来源网址及可用的原始发布日期会进入工程。
- **录屏与推镜**可在「制作工具」接入 [OpenScreen 2.3+](https://github.com/getopenscreen/openscreen)。选择程序和目标窗口，录制后会保留 OpenScreen 工程、窗口视频及可用的光标轨迹。也可导入已调好镜头的 `.openscreen` 工程，把导出的片段放进分镜。
- **声音**可直接导入音轨，或配置 [Qwen Voice Clone](https://github.com/skrqwa/qwen-voice-clone) 的 Python、脚本和已授权的 `.pt` 音色模板，按当前分镜的文稿在本机生成 WAV。两套内置示例附现成解说。
- **图文**使用分镜中的图片或录屏截图、引言和讲解生成。文章平台默认使用教程截图，小红书默认使用排好的步骤卡，可在各自版本中修改。

## 发布方式

| 平台 | 可选内容 | 接入方式 |
| --- | --- | --- |
| 抖音 | 视频、图集 | 登录创作页复核；通过已授权的 AiToEarn 插件提交；视频另支持抖音开放平台接口 |
| 小红书 | 图文卡片、视频 | 登录创作页复核，或通过插件提交笔记 |
| B站 | 视频、专栏 | 投稿页复核；获开放平台授权后投稿并查询稿件状态 |
| 微信视频号 | 视频、封面 | 视频号助手复核，或通过插件提交 |
| 微信公众号 | 教程长文 | 官方接口上传正文配图和封面、写入草稿箱；有发表接口权限的机构账号可提交，个人主体在后台发表 |
| 快手 | 视频 | 创作者页复核，或通过获授权的应用上传、发布并查询 |
| 今日头条 | 图文、视频 | 文章可在头条号保存草稿、从对应草稿确认提交；视频进入创作页复核 |
| 知乎 | 文章、带图想法 | 网页文章草稿；定向授权账号可使用官方文章／想法接口，配图使用官方 MCP 工具 |

添加账号时选「创作网页」「浏览器插件」或「官方接口」。网页账号使用各自的登录窗口。插件在系统浏览器内工作，按插件说明授权 `http://127.0.0.1:24683`，账号填写平台实际昵称或稳定账号 ID。官方接入需要各平台授予的应用和用户权限，凭据在本机通过系统加密保存。知乎配图需事先安装其官方图片上传程序。[插件设置](https://docs.aitoearn.ai/zh/use/plugin-publish/index) · [知乎同步助手](https://github.com/zhihu/ZhihuSync) · [知乎上传工具](https://github.com/zhihu/zhihu-mediacloud-uploader)

选择「去平台复核」后，工作台会尝试把材料填入平台编辑器，作者可在页面内补齐字段并存草稿。「确认并提交」的可用性取决于平台、作品类型和账号权限。工作台取得平台回执后，会在「发布记录」中显示可用的稿件编号、链接或状态。如果网络中断且平台可能已收到投稿，先在原账号检查作品与草稿，再决定是否补发。

平台接口来源见[抖音视频发布](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/create-video/video-create)、[B站开放平台](https://open.bilibili.com/doc/)、[微信草稿](https://developers.weixin.qq.com/doc/subscription/api/draftbox/draftmanage/api_draft_add)、[微信发表](https://developers.weixin.qq.com/doc/subscription/api/public/api_freepublish_submit)、[快手视频接口](https://open.kuaishou.com/platformDocs/openAbility/contentManagement/createAVideo.html)和[头条文章交互参考](https://github.com/xwh5/multi-publisher/blob/master/src/adapters/toutiao.ts)。

### 四个平台的草稿实测

2026-11-24，在 Windows 桌面版（`a987898`）用内置示例《用标签找回写作灵感》测试了四个已登录账号，均选择「去平台复核」。四个平台都保存了草稿，本次送审和公开发表均为 0 次。

| 平台 | 从工作台到平台编辑器 | 保存后如何核实 |
| --- | --- | --- |
| 小红书 | 标题、正文和 3 张步骤卡自动填入。 | 点「暂存离开」后显示「保存成功」，草稿箱从 0 变为 1，并列出同名笔记。草稿存于当前浏览器本地，需要用同一账号窗口重开。 |
| 抖音 | 竖屏视频和标题自动带入，手动补了 113 字简介和横竖封面。横封面收到「请勿使用截屏当封面」的提示。 | 点「暂存离开」，再从「继续编辑」重开，标题、三段简介、视频和两种封面都保留了。 |
| B站 | 手动选择横屏成片 `full.mp4`，把平台默认标题 `full` 改为作品名。简介已自动带入，分别调整 4:3 和 16:9 封面的取景，让标题完整可见。 | 点「存草稿」，从「稿件管理」的「草稿」重开同名稿件，核对了「上传完成」、作品标题、113 字简介和封面缩略图。 |
| 知乎 | 标题自动带入，正文只填入了末段。把同一份教程转为内嵌配图的 `.docx`，用知乎的「导入文档」补齐并删去重复段落。 | 编辑器显示草稿保存时间，编辑页有草稿编号。逐段对照了原文，3 个小标题和 3 张配图的顺序也与教程一致。 |

**工作台的草稿状态回读仍待修复。** 四份草稿保存后，「发布记录」把小红书标为「已备稿」，抖音、B站和知乎仍显示「待人工处理」。遇到这两种状态，先回到原账号的草稿箱或「继续编辑」核对同名作品，避免重复建稿。

微信视频号、微信公众号、快手、今日头条的草稿流程仍待真实账号验证。八个平台的公开投稿、送审及发表后状态回查，以及插件和官方接口的直接提交，也待实测。

## 本地开发和构建

使用 Node.js 24 和 npm。首次安装会下载对应平台的 Electron 和 FFmpeg。

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run smoke
npm run dist
```

`npm run smoke` 使用独立的临时工作区，打开两套示例、修改旁白、替换图片、导出并重启复查。可将 `CREATOR_INSTALLED_EXE` 指向已安装的可执行文件，复测安装版。安装包输出到 `release/`，GitHub Actions 分别在 Windows x64、macOS Apple Silicon 和 macOS Intel 上构建。

自有代码采用 [MIT](LICENSE)。示例和随安装包分发组件的许可分别见[素材署名](examples/CREDITS.md)和[第三方组件](THIRD-PARTY.md)。
