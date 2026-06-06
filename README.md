# HanaAgent HTML Anything

<p align="center">
  <strong>AI 驱动的 HTML 生成器 · 75+ 专业模板</strong><br>
  一句话生成杂志文章、演示文稿、海报、社交卡片、数据报告等精美页面
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HanaAgent-Plugin-blue" alt="HanaAgent Plugin">
  <img src="https://img.shields.io/badge/version-0.4.0-green" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-orange" alt="License">
</p>

---

## ✨ 功能一览

- **75+ 专业模板** — 覆盖 9 大内容类型：文章、演示文稿、海报、社交卡片、网页原型、数据报告、文档、特效动画、视频帧
- **AI 流式生成** — 接入 OpenAI 兼容 API，实时流式输出，生成过程可视化
- **交互式预览面板** — 内置 HTML 预览 + 代码编辑器，生成后可直接修改
- **PPT / Keynote 模式** — 20+ 种演示模板，支持键盘翻页、触摸滑动、主题配色、CSS 动画
- **历史记录** — 自动保存所有生成记录，可回溯、重新编辑、继续生成
- **导出** — HTML 文件导出 + PNG 长图截图（整个 PPT 一张长图导出）
- **双路模型配置** — 优先使用插件独立配置，自动回退到 HanaAgent 全局模型

## 📦 安装

### 方式一：手动安装

将插件文件夹复制到 HanaAgent 插件目录：

```bash
# macOS / Linux
~/.hanako/plugins/html-anything/

# Windows
%USERPROFILE%\.hanako\plugins\html-anything\
```

重启 HanaAgent 即可使用。

### 方式二：下载安装包

从 [Releases](../../releases) 下载最新 zip，解压到上述插件目录。

## ⚙️ 配置

插件默认使用 HanaAgent 全局模型配置（`~/.hanako/added-models.yaml`），无需额外配置即可使用。

如需独立配置，在 HanaAgent 的插件设置中找到 **HTML Anything**：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `apiKey` | LLM API Key（OpenAI 兼容格式） | 使用全局配置 |
| `baseUrl` | API 地址 | `https://api.openai.com/v1` |
| `modelName` | 模型 ID | `gpt-4o` |

## 🚀 使用方式

### 对话触发

直接对 HanaAgent 助手说出你的需求，助手会自动调用插件：

```
帮我做一份 PPT，主题是"副业指南"
生成一篇杂志风格的技术博客
做一张小红书知识卡片
帮我做一份 SaaS 产品落地页
```

### 预览面板

生成完成后，在 HTML Anything 页面中可以：

- **预览** — 实时查看渲染效果
- **编辑代码** — 在代码编辑器中直接修改 HTML
- **切换模板** — 左侧模板库快速切换
- **导出 PNG** — 截图为长图（PPT 模式自动导出所有页面）
- **导出 HTML** — 下载 HTML 文件
- **查看历史** — 回溯之前的所有生成记录

### PPT 模式

选择演示文稿模板后：

- 键盘 ← → 翻页
- 滚轮翻页
- 触屏左右滑动
- 支持多种主题配色
- 导出 PNG 时自动生成所有页面的长图

## 🎨 模板库

### 文章（Magazine）

| 模板 | 说明 |
|------|------|
| 杂志文章 | Substack/Medium 高级感长文排版 |
| 博客长文 | 杂志感长文，含 masthead、hero、pull quote、作者署名 |
| 电子指南 | 跨页电子指南，封面 + 课程页 + 步骤列表 |

### 演示文稿（Deck / PPT）

| 模板 | 说明 |
|------|------|
| 蓝图架构 Deck | 工程 pipeline 讲解风格 |
| 课程培训 Deck | 暖纸背景，含 MCQ 自测 |
| 极简 Keynote | 极简单色，适合有话要说无需视觉堆砌 |
| 暗底图谱 Deck | AI-native / 知识图谱深色风格 |
| 贵赞编辑墨水 Deck | 电子杂志 × 电子墨水风，10 版面 + 5 调色板 |
| Cyber Terminal Deck | CRT 终端风格 |
| 投资人 Pitch Deck | 10 页融资 deck |
| 演讲者模式 Deck | 含逐字稿提词器 |
| 产品发布 Keynote | 暗 hero + 亮内容 |
| 技术分享 Deck | GitHub-dark + 终端代码块 |
| 瑞士国际主义 Deck | 16 列网格 + 22 个锁死版面 |
| 小红书图文 Deck | 9 页 3:4 竖版图文 |
| ... | 共 42 种演示模板 |

### 海报（Poster）

| 模板 | 说明 |
|------|------|
| 杂志风海报 | Sunday-paper 风格，大字 serif headline |
| 营销海报 | 竖版 1080×1920 朋友圈分享图 |
| 手绘线框图 | 网格背景 + marker 笔触白板草稿风 |

### 社交卡片（Card）

| 模板 | 说明 |
|------|------|
| Twitter 分享卡 | 推特金句 / 数据卡，16:9 |
| 小红书知识卡片 | 1080×1440 多张联排可滑动 |
| Spotify 播放卡 | Now Playing 风格 |
| X 帖子卡 | 拟真推文卡片，含互动数据 |
| 社交媒体三联 | 三张 1080×1080 方形卡片轮播 |
| Reddit 帖子卡 | 拟真 Reddit 帖子卡 |

### 网页原型（Prototype）

| 模板 | 说明 |
|------|------|
| Web 产品原型 | 可点击功能性原型 |
| SaaS Landing | 完整落地页：hero/features/pricing/CTA |
| 定价页 | 三档定价 + 特性对比表 + FAQ |
| iPhone App 单屏 | 像素级 iPhone 15 Pro 边框内设计 |
| 管理后台仪表板 | 固定侧栏 + KPI 网格 + 图表 |
| Apple Soft 原型 | squircle + spring motion |

### 数据报告（Report）

| 模板 | 说明 |
|------|------|
| 数据可视化报告 | CSV/JSON → 可视化报告页 |
| 季度财报 | Masthead + KPI + 图表 + P&L 表 |
| 社媒创作者仪表板 | 跨平台社媒数据看板 |

### 文档（Doc）

| 模板 | 说明 |
|------|------|
| 技术文档页 | 三栏文档页：侧导航 + 正文 + TOC |
| PRD / 产品 Spec | 问题 + 指标 + user stories + 设计 |
| 工程Runbook | 服务概述 + 操作命令 + 事故清单 |
| 会议纪要 | 议程 + 决议 + action items |
| 极简简历 | A4 单页现代极简简历 |
| 可打印发票 | 寄件/收件 + 明细 + 付款指引 |

### 特效 & 视频帧（VFX / Frame）

| 模板 | 说明 |
|------|------|
| VFX 文字光标 | 光标拖光 + 彩色射线，视频片头 |
| 像素动画解说 | 像素美术 + kinetic 字体，纯 CSS 循环 |
| iPhone × MacBook 立体展架 | 静态 3D 展架，屏幕内嵌真实 HTML |
| NYT 风数据图表帧 | 编辑级图表 + 错峰揭示动画 |
| 品牌 Logo 收尾帧 | Logo 组装入场 + glow bloom |

## 🛠️ 技术栈

- **运行时**：HanaAgent Plugin API
- **样式**：Tailwind CSS v3（CDN）、Google Fonts（Noto Sans SC / Noto Serif SC）
- **字体**：中文 Noto Sans SC / Noto Serif SC，英文 Inter / Manrope
- **截图**：modern-screenshot（SVG foreignObject 渲染）
- **PPT 子系统**：独立主题配置（CSS 变量）、布局参考（HTML snippet）、动画库

## 📁 项目结构

```
html-anything/
├── manifest.json          # 插件清单（路由、配置、工具声明）
├── package.json
├── index.js               # 插件入口，初始化模型解析器、历史记录、模板存储
├── lib/
│   ├── model-resolver.js  # 双路径模型配置：插件配置 → 全局 yaml 回退
│   ├── llm-client.js      # SSE 流式传输 + 非流式补全
│   ├── html-generator.js  # 生成调度、后处理、预览保存
│   ├── template-store.js  # 模板 + 示例 HTML + Skill 文件管理
│   ├── prompt-builder.js  # 通用 HTML 生成 prompt 构建
│   ├── ppt-prompt-builder.js  # PPT 专用 prompt（主题、布局、动画指令）
│   ├── history-store.js   # 生成历史管理（最多 50 条）
│   └── deck.js            # Deck HTML 解析器
├── routes/
│   ├── page.js            # 预览面板外壳（HTML + 内联 JS）
│   ├── api-generate.js    # 流式/同步 HTML 生成
│   ├── api-generate-text.js  # 辅助文本生成
│   ├── api-preview.js     # 预览内容读取
│   ├── api-export.js      # HTML 导出 + PNG 上传
│   ├── api-history.js     # 历史记录 CRUD
│   └── api-models.js      # 模型列表查询
├── tools/
│   ├── preview-html.js    # Agent 工具：推送 HTML 到预览
│   └── export-html.js     # Agent 工具：导出 HTML 文件
├── assets/
│   ├── page.js            # 预览面板前端（模板选择、编辑器、截图、导出）
│   ├── templates.json     # 非 PPT 模板索引
│   ├── templates-ppt.json # PPT 模板索引
│   ├── examples/          # 98 个模板示例 HTML
│   ├── skills/            # 75 个模板 Skill 指令文件
│   └── ppt/               # PPT 子系统：主题、布局、动画、参考文档
└── skills/
    ├── html-anything/SKILL.md    # 插件 Skill 入口
    └── skill-triggers.json       # 9 大分类触发配置
```

## 📄 License

MIT
