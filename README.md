# HTML Anything

AI 驱动的 HTML 生成器，支持 75 种专业模板。可生成杂志文章、演示文稿、海报、社交媒体卡片、网页原型、数据报告等。

## 功能

- **75+ 专业模板**：覆盖文章、PPT、海报、卡片、原型、报告、文档、特效等 9 大类
- **AI 生成**：接入 OpenAI 兼容 API，流式输出 HTML
- **实时预览**：内置交互式预览面板，支持代码编辑
- **PPT 模式**：20+ 种 Keynote/Pitch 风格模板，支持翻页、主题、动画
- **历史记录**：自动保存生成历史，可回溯和重新编辑
- **导出**：支持 HTML 文件导出和 PNG 长图截图

## 安装

将插件文件夹复制到 HanaAgent 的插件目录：

```
~/.hanako/plugins/html-anything/
```

重启 HanaAgent 即可使用。

## 配置

插件会自动读取 HanaAgent 全局模型配置（`added-models.yaml`）。

也可以在插件设置中单独配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `apiKey` | LLM API Key（OpenAI 兼容格式） | 使用全局配置 |
| `baseUrl` | API 地址 | `https://api.openai.com/v1` |
| `modelName` | 模型 ID | `gpt-4o` |

## 使用方式

1. 在 HanaAgent 中对助手说「帮我做一个 PPT」「生成一份杂志风格的文章」等
2. 助手会自动选择合适的模板并生成 HTML
3. 在 HTML Anything 页面中查看、编辑和导出

## 支持的内容类型

| 类型 | 模板举例 |
|------|----------|
| 文章 | 杂志文章、博客长文、电子指南 |
| 演示 | Pitch Deck、Keynote、技术分享、课程培训 |
| 海报 | 杂志海报、营销海报、线框图 |
| 卡片 | Twitter 卡片、小红书卡片、Spotify 卡片 |
| 原型 | Web 原型、SaaS 落地页、App 预览 |
| 报告 | 数据可视化、财务报告、团队看板 |
| 文档 | 技术文档、PRD、会议纪要、简历 |
| 特效 | VFX 文字特效、像素动画、产品展架 |
| 视频帧 | 数据图表帧、流程图帧、品牌 Logo 帧 |

## 技术栈

- HanaAgent Plugin API
- Tailwind CSS v3（CDN）
- Google Fonts（Noto Sans SC / Noto Serif SC）
- modern-screenshot（PNG 导出）

## License

MIT
