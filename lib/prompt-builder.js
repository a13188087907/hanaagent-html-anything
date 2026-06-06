const SHARED_DESIGN_DIRECTIVES = `你是世界级的视觉设计师 + 资深前端工程师。请输出一份自包含的单文件 HTML，要求：

【内容驱动数量 — 最高优先级, 覆盖模板里的任何数字】
- 模板只定义"可用版面 / 风格 / 配色 / 字体 / 组件库", 不定义 slide / 帧 / 卡片 / section 的数量。
- 输出的 slide / frame / card / section 数量完全由【用户内容】的实际长度和信息结构决定。必须完整覆盖用户内容的每一个要点、章节、数据组, 不许总结、压缩、丢弃信息。
- 如果模板正文里写了类似"挑 6-10 张组成 deck / 输出 6-10 帧"的数字, 一律视为短示例下的参考下限, 不是上限。
- 模板里的"22 个锁死版面 / 10 个磁带式版面 / N 个 layout"指的是可复用的版式池, 同一个版式允许在不同内容上多次出现。
- 推荐做法: 先把【用户内容】按语义切成若干段, 每一段 → 至少一个独立的 slide / section / card, 然后再从模板的版式池里给每一段挑最合适的版面。

【硬性技术要求】
- 直接输出纯 HTML, 绝对禁止使用 markdown 代码围栏(\`\`\`)包裹, 不要任何解释性文字。第一个字符必须是 <!DOCTYPE html> 的 <。
- 在 <head> 中通过 CDN 引入 Tailwind v3 Play (https://cdn.tailwindcss.com) 与所需的 Google Fonts。
- 不要引用任何外部图片 URL(优先使用 CSS / SVG 内联绘制)。
- 必要的脚本通过 jsdelivr CDN 引入;保持单文件可双击打开即用。

【设计准则 — 世界级标准】
- 排版: 中文优先 Noto Sans SC / Noto Serif SC, 英文 Inter / Manrope / SF Pro 风格。
- 色彩: 使用 1 个主色 + 2 个中性色 + 至多 1 个强调色; 大胆留白; 不使用纯黑纯白 (#000/#fff), 改用 #0a0a0a / #fafafa。
- 网格: 8 px 基线; 段落最大宽度 65 ch; 标题与正文有清晰的层级。
- 微观细节: 圆角统一 (rounded-xl/2xl), 投影柔和 (shadow-sm/lg), 边框 1px #e5e7eb / #262626。
- 动效: 仅在必要处使用 transition-all 或入场 fade-in; 不要喧宾夺主。
- 无障碍: 颜色对比度 ≥ 4.5; 重要交互有 focus 态。

【内容真实性】
- 必须使用用户提供的真实数据, 不要编造、不要 lorem ipsum、不要 "Your text here"。
- 如果用户数据是结构化数据 (CSV/JSON), 请提取关键洞察并以图表/表格呈现。
- 中文与英文混排时, 中英文之间留半角空格 (盘古之白)。
`;

const SYSTEM_PROMPT = "你是一个 HTML 生成器。你的输出必须且只能是一个完整的自包含 HTML 文件。规则:1. 第一个字符必须是 <(即 <!DOCTYPE html>);2. 最后一个字符必须是 >(即 </html> 的最后一个字符);3. 绝对禁止在 HTML 之前或之后添加任何文字,包括解释、说明、设计解析、优化建议等;4. 绝对禁止使用 markdown 代码围栏(\`\`\`)包裹,无论是否有 html 标记都禁止;5. 不要输出任何非 HTML 内容。违反以上任何一条就是失败。";

export function buildPrompt({ skillBody, exampleHtml, content, format, editFromHtml, templateCategory }) {
  const typeDirective = getTypeDirective(templateCategory);
  let userPrompt;

  if (editFromHtml) {
    userPrompt = `${SHARED_DESIGN_DIRECTIVES}\n${typeDirective}\n${skillBody}\n\n【输入格式】: ${format || "markdown"}\n【修改要求】:\n${content}\n\n【现有 HTML,请做最小化修改】:\n${editFromHtml}`;
  } else {
    const exampleSection = exampleHtml
      ? `\n\n【参考样式 - 这是该模板的示例 HTML,请严格遵循其视觉风格(配色、布局、字体、间距、装饰元素),但用用户内容替换示例内容】:\n${exampleHtml}`
      : "";
    userPrompt = `${SHARED_DESIGN_DIRECTIVES}\n${typeDirective}\n${skillBody}${exampleSection}\n\n【输入格式】: ${format || "markdown"}\n【用户内容】:\n${content}`;
  }

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

function getTypeDirective(category) {
  if (!category) return "";
  switch (category) {
    case "video":
      return `
【模板类型: 单帧 — 最高优先级约束, 覆盖下方所有数量指令】
- 这是一个**单帧**模板，输出必须是一个固定视口（100vw × 100vh），**不允许出现滚动条**，body 设置 overflow:hidden。
- 如果用户输入了长文本/多段落内容，你**必须从中提炼**一句 ≤ 20 字的核心金句或标题，用于帧的主视觉展示。
- 主视觉下方可加 1-2 行副标题或摘要，但总文字量控制在 50 字以内。
- 严禁把用户内容展开为多 section / 多页 / 滚动布局。帧的使命是"一帧定格一个核心信息"。`;

    case "poster":
      return `
【模板类型: 海报 — 最高优先级约束, 覆盖下方所有数量指令】
- 这是一个**海报**模板，输出为单视口（100vw × 100vh），不可滚动，body 设置 overflow:hidden。
- 用户内容提炼为海报核心信息：标题 + 副标题 + 可选关键数据点。
- 长文本需压缩为视觉化的关键数据，不要逐段展开。`;

    case "slides":
      return `
【模板类型: 幻灯片 Deck】
- 每张幻灯片用 \`<section class="slide">\` 标签包裹。
- 必须包含完整的 JavaScript 导航逻辑：键盘 ←/→、触摸滑动、滚轮翻页。
- 用户内容的每个章节/论点/数据组 → 至少一张独立的 slide。内容多时宁可多页也不要硬塞。
- 加一个进度指示器（页码或进度条）。`;

    case "card":
      return `
【模板类型: 卡片】
- 输出为固定尺寸的卡片，使用合理的宽高比（参考模板 aspect_hint）。
- 卡片内容精炼，突出核心信息。`;

    default:
      return "";
  }
}

export { SHARED_DESIGN_DIRECTIVES, SYSTEM_PROMPT };
