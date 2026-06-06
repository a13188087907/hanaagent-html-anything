import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED_DESIGN_DIRECTIVES, SYSTEM_PROMPT } from "./prompt-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PPT_DIR = path.join(__dirname, "..", "assets", "ppt");

let _skillBody = null;
let _themes = null;
let _layouts = null;
let _animations = null;
const _refCache = {};

function readFile(filePath) {
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return ""; }
}

function readSkillBody() {
  if (_skillBody) return _skillBody;
  const raw = readFile(path.join(PPT_DIR, "SKILL.md"));
  // Strip YAML frontmatter
  const bodyMatch = raw.match(/^---[\s\S]*?---\s*\n([\s\S]*)/);
  _skillBody = bodyMatch ? bodyMatch[1].trim() : raw;
  return _skillBody;
}

function readReference(name) {
  if (_refCache[name] !== undefined) return _refCache[name];
  _refCache[name] = readFile(path.join(PPT_DIR, "references", `${name}.md`));
  return _refCache[name];
}

function readThemes() {
  if (_themes) return _themes;
  try {
    _themes = JSON.parse(readFile(path.join(PPT_DIR, "themes.json")));
  } catch { _themes = []; }
  return _themes;
}

function readLayouts() {
  if (_layouts) return _layouts;
  try {
    _layouts = JSON.parse(readFile(path.join(PPT_DIR, "layouts.json")));
  } catch { _layouts = []; }
  return _layouts;
}

function readAnimations() {
  if (_animations) return _animations;
  try {
    _animations = JSON.parse(readFile(path.join(PPT_DIR, "animations.json")));
  } catch { _animations = { css: [], canvas: [] }; }
  return _animations;
}

function buildThemeDirective(themeId) {
  const themes = readThemes();
  const theme = themes.find(t => t.themeId === themeId);
  if (!theme) return "";

  let directive = `\n【主题配色 — 必须使用以下 CSS 变量】\n`;
  directive += `当前主题: ${theme.name} (${theme.nameEn}) — ${theme.description}\n`;
  directive += `在 <style> 的 :root 中定义以下变量，页面中所有颜色、圆角、阴影都引用这些变量：\n<style>\n:root {\n`;
  for (const [k, v] of Object.entries(theme.tokens)) {
    directive += `  ${k}: ${v};\n`;
  }
  directive += `}\n`;
  if (theme.extraCSS) {
    directive += `${theme.extraCSS}\n`;
  }
  directive += `</style>\n`;
  return directive;
}

function buildLayoutSnippets(layoutIds) {
  if (!layoutIds || layoutIds.length === 0) return "";
  const layouts = readLayouts();
  const selected = layouts.filter(l => layoutIds.includes(l.layoutId));
  if (selected.length === 0) return "";

  let directive = `\n【可用布局参考 — 每个 slide 从以下布局中选择最合适的，用用户内容替换示例数据】\n`;
  for (const layout of selected) {
    directive += `\n--- 布局: ${layout.name} (${layout.layoutId}) ---\n`;
    directive += `用途: ${layout.description}\n`;
    directive += `${layout.htmlSnippet}\n`;
  }
  return directive;
}

function buildAnimationDirective() {
  const anims = readAnimations();
  if (!anims.css || anims.css.length === 0) return "";

  let directive = `\n【可用 CSS 动画 — 通过 data-anim="xxx" 或 class="anim-xxx" 添加入场动画】\n<style>\n`;
  for (const a of anims.css) {
    directive += `${a.cssCode}\n`;
  }
  directive += `</style>\n`;
  return directive;
}

export function buildPptPrompt({ deckType, themeId, layouts, content, format, editFromHtml }) {
  const skillBody = readSkillBody();

  // Build type directive for slides
  const typeDirective = `
【模板类型: 幻灯片 Deck】
- 每张幻灯片用 \`<section class="slide">\` 标签包裹。
- 第一张 slide 加 class \`is-active\`。
- <style> 中必须包含以下 slide 显示/隐藏规则（不可省略）：
<style>
.slide{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;opacity:0;pointer-events:none;transition:opacity .4s ease,transform .4s ease;transform:translateX(30px);overflow:hidden}
.slide.is-active{opacity:1;pointer-events:auto;transform:translateX(0);z-index:2}
</style>
- 必须包含完整的 JavaScript 导航逻辑。以下是必须包含的最小导航脚本（不可省略）：
<script>
(function(){var s=document.querySelectorAll('.slide'),c=0;function show(n){s.forEach(function(el,i){el.classList.toggle('is-active',i===n)});var pb=document.querySelector('.progress-bar');if(pb)pb.style.width=((n+1)/s.length*100)+'%'}show(0);document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();if(c<s.length-1){c++;show(c)}}if(e.key==='ArrowLeft'){e.preventDefault();if(c>0){c--;show(c)}}if(e.key==='Home'){e.preventDefault();c=0;show(c)}if(e.key==='End'){e.preventDefault();c=s.length-1;show(c)}});document.addEventListener('wheel',function(e){e.preventDefault();if(e.deltaY>0&&c<s.length-1){c++;show(c)}else if(e.deltaY<0&&c>0){c--;show(c)}},{passive:false});var tx=0;document.addEventListener('touchstart',function(e){tx=e.touches[0].clientX});document.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50){if(dx<0&&c<s.length-1){c++;show(c)}else if(dx>0&&c>0){c--;show(c)}}})})();
</script>
- 用户内容的每个章节/论点/数据组 → 至少一张独立的 slide。内容多时宁可多页也不要硬塞。
- 加一个进度指示器（页码或进度条）。
- 所有颜色使用 CSS 变量（来自主题），不要硬编码颜色值。`;

  // Build theme directive
  const themeDirective = themeId ? buildThemeDirective(themeId) : "";

  // Build layout snippets
  const layoutDirective = buildLayoutSnippets(layouts);

  // Build animation directive
  const animDirective = buildAnimationDirective();

  // Load deck-specific reference if deckType is provided
  const deckRef = deckType ? readReference("full-decks") : "";

  let userPrompt;

  if (editFromHtml) {
    userPrompt = `${SHARED_DESIGN_DIRECTIVES}\n${typeDirective}\n${skillBody}\n${themeDirective}\n${layoutDirective}\n${animDirective}\n\n【输入格式】: ${format || "markdown"}\n【修改要求】:\n${content}\n\n【现有 HTML,请做最小化修改】:\n${editFromHtml}`;
  } else {
    userPrompt = `${SHARED_DESIGN_DIRECTIVES}\n${typeDirective}\n${skillBody}\n${themeDirective}\n${layoutDirective}\n${animDirective}\n\n【输入格式】: ${format || "markdown"}\n【用户内容】:\n${content}`;
  }

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}

export function listThemes() {
  return readThemes().map(t => ({
    themeId: t.themeId,
    name: t.name,
    nameEn: t.nameEn,
    light: t.light,
    accent: t.tokens["--accent"] || "#3b6cff",
  }));
}

export function getTheme(themeId) {
  return readThemes().find(t => t.themeId === themeId) || null;
}

export function listPptLayouts() {
  return readLayouts().map(l => ({
    layoutId: l.layoutId,
    name: l.name,
    category: l.category,
    description: l.description,
  }));
}
