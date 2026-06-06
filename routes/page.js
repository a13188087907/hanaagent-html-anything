import fs from "node:fs";
import path from "node:path";

export default function registerPageRoutes(app, ctx) {
  app.get("/page", (c) => c.html(renderShell(c, ctx)));
  app.get("/assets/*", (c) => serveAsset(c, ctx));
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderShell(c, ctx) {
  const hanaCss = c.req.query("hana-css") || "";
  const theme = c.req.query("hana-theme") || "inherit";
  const base = `/api/plugins/${ctx.pluginId}`;
  const sessionPath = c.req.query("sessionPath") || "default";

  let html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>HTML Anything</title>\n';
  if (hanaCss) html += '<link rel="stylesheet" href="' + esc(hanaCss) + '">';
  html += '<style>' + CSS + '<\/style>\n</head>\n<body data-hana-theme="' + esc(theme) + '">\n<div id="app" data-base="' + esc(base) + '" data-session="' + esc(sessionPath) + '">';
  html += BODY;
  html += '<script>var __HA_VER=' + Date.now() + ';';
  try {
    const rt = ctx._htmlAnything;
    html += 'var __HA_MODELS = ' + JSON.stringify(rt ? rt.modelResolver.listModels() : { models: [], defaultModel: null }) + ';';
    html += 'var __HA_PPT_TEMPLATES = ' + JSON.stringify(rt ? rt.templateStore.listPpt() : []) + ';';
    // PPT themes: read themes.json directly and extract summary
    var _pptThemes = [];
    try {
      var _tJson = JSON.parse(fs.readFileSync(path.join(ctx.pluginDir, 'assets', 'ppt', 'themes.json'), 'utf-8'));
      _pptThemes = _tJson.map(function(t) { return { themeId: t.themeId, name: t.name, nameEn: t.nameEn, light: t.light, accent: t.tokens['--accent'] || '#3b6cff' }; });
    } catch {}
    html += 'var __HA_PPT_THEMES = ' + JSON.stringify(_pptThemes) + ';';
  } catch { html += 'var __HA_MODELS = {}; var __HA_PPT_TEMPLATES = []; var __HA_PPT_THEMES = [];'; }
  html += readInlineJs(ctx);
  html += '<\/script>';
  html += '<script>window.__HA_TEMPLATES = ' + readTemplatesJson(ctx) + ';<\/script>';
  html += '\n</body>\n</html>';
  return html;
}

const BODY = [
  '<header id="toolbar">',
  '  <div class="toolbar-left">',
  '    <button id="tplBtn" class="btn"><span id="tplEmoji">✨</span><span id="tplName">加载中...</span><span id="tplHint" class="hint"></span><span class="caret">▾</span></button>',
  '    <span id="fmtBadge" class="badge">text</span>',
  '  </div>',
  '  <div class="toolbar-right">',
  '    <button id="historyBtn" class="icon-btn" title="历史记录">📋</button>',
  '    <button id="settingsBtn" class="icon-btn" title="模型设置">⚙</button>',
  '    <button id="genBtn" class="btn primary" disabled>生成</button>',
  '    <div id="settingsPop" class="settings-pop">',
  '      <h4>选择模型</h4>',
  '      <div id="modelList" class="model-list"></div>',
  '    </div>',
  '    <div id="historyPanel" class="history-panel">',
  '      <div class="history-header"><h4>历史记录</h4><button id="historyClose" class="icon-btn sm">✕</button></div>',
  '      <div id="historyList" class="history-list"><div style="padding:12px;color:var(--ink-s);font-size:12px">暂无历史</div></div>',
  '    </div>',
  '  </div>',
  '</header>',
  '<main id="main" class="split">',
  '  <section id="editor" class="panel">',
  '    <textarea id="contentInput" placeholder="输入内容... 支持 Markdown、CSV、JSON 或纯文本" spellcheck="false"></textarea>',
  '    <div id="aiBar">',
  '      <span class="ai-hint">✨ AI 生成内容</span>',
  '      <input id="aiInput" type="text" placeholder="描述你想要的内容，例如：生成一份产品介绍..." autocomplete="off">',
  '      <button id="aiBtn" class="btn sm primary" disabled>生成</button>',
  '    </div>',
  '  </section>',
  '  <div id="divider"></div>',
  '  <section id="preview" class="panel">',
  '    <div id="previewHeader">',
  '      <div class="tab-bar">',
  '        <button class="tab active" data-tab="preview">预览</button>',
  '        <button class="tab" data-tab="deck" style="display:none">Deck</button>',
  '        <button class="tab" data-tab="code">代码</button>',
  '      </div>',
  '      <div class="preview-actions">',
  '        <button id="refreshBtn" class="icon-btn" title="刷新" style="display:none">↻</button>',
  '        <button id="exportPngBtn" class="btn sm" style="display:none" title="导出 PNG 截图">📷 PNG</button>',
  '        <button id="exportHtmlBtn" class="btn sm" style="display:none">下载 HTML</button>',
  '        <span id="statusPill" class="pill idle">就绪</span>',
  '      </div>',
  '    </div>',
  '    <div id="previewBody">',
  '      <div id="previewEmpty" class="empty-state">',
  '        <div class="empty-icon">🪄</div>',
  '        <h2>选择模板并 <em>生成</em> HTML</h2>',
  '        <p>在左侧输入内容,点击生成按钮</p>',
  '      </div>',
  '      <iframe id="previewFrame" sandbox="allow-scripts allow-same-origin" style="display:none"></iframe>',
  '      <div id="deckViewer" style="display:none">',
  '        <iframe id="deckFrame" sandbox="allow-scripts"></iframe>',
  '        <div id="deckNav"><button id="deckPrev">←</button><span id="deckInfo">1 / 1</span><button id="deckNext">→</button></div>',
  '      </div>',
  '      <textarea id="codeArea" class="code-editor" spellcheck="false" style="display:none" readonly placeholder="尚无 HTML"></textarea>',
  '    </div>',
  '  </section>',
  '</main>',
  '<div id="tplDropdown" class="dropdown" style="display:none">',
  '  <div class="dd-header">',
  '    <div class="dd-title"><span>模板</span><span id="ddCount"></span></div>',
  '    <input id="ddSearch" type="text" placeholder="搜索模板..." autocomplete="off">',
  '    <div id="ddChips" class="chips"></div>',
  '  </div>',
  '  <div id="ddList" class="dd-list"></div>',
  '  <div class="dd-footer">搜索 · 按类别筛选 · 悬停预览 &nbsp; <kbd>Esc</kbd> 关闭</div>',
  '</div>',
  '<div id="hoverPreview" class="popover" style="display:none">',
  '  <div class="pv-header"><span id="pvEmoji" class="pv-emoji"></span><div><div id="pvName" class="pv-name"></div><div id="pvHint" class="pv-hint"></div></div></div>',
  '  <div class="pv-card" id="pvCard"></div>',
  '</div>',
  '<div id="genOverlay" style="display:none"><span class="pulse-dot"></span> 正在生成,请稍候...</div>',
].join('\n');

const CSS = `
:root {
  --ink:#0f0e0c; --ink-s:#3d3a35; --ink-m:#6b675f; --ink-f:#9c978d;
  --paper:#f8f5ee; --surface:#fff;
  --line:#e0dbd2; --line-s:#d4cfc5; --line-f:#eae6de;
  --coral:#d4513b; --coral-s:rgba(212,81,59,.10);
  --green:#1f7a3a; --red:#9c2a25;
  --mono:"JetBrains Mono","Fira Code","Consolas",monospace;
}
[data-hana-theme="dark"] {
  --ink:#f3efe6; --ink-s:#b8b3a7; --ink-m:#8b8676; --ink-f:#5f5c53;
  --paper:#1a1916; --surface:#232220;
  --line:#3a3835; --line-s:#48453f; --line-f:#2e2c29;
  --coral:#e87460; --coral-s:rgba(232,116,96,.12);
  --green:#3aad5e; --red:#d45050;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body,#app{height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif;color:var(--ink);background:var(--surface)}
#app{display:flex;flex-direction:column;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line-f);background:var(--surface);flex-shrink:0}
.toolbar-left,.toolbar-right{display:flex;align-items:center;gap:8px}
.toolbar-right{margin-left:auto;position:relative}
.btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;font-size:12.5px;font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;transition:all .15s}
.btn:hover{border-color:var(--ink-s)}
.btn:disabled{opacity:.4;cursor:default}
.btn.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.btn.primary:hover{opacity:.9}
.btn.primary:disabled{opacity:.4}
.btn.sm{padding:4px 10px;font-size:11px}
.icon-btn{display:grid;place-items:center;width:26px;height:26px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink-s);cursor:pointer;font-size:13px}
.icon-btn:hover{background:var(--paper)}
.settings-pop{position:absolute;right:8px;top:100%;margin-top:4px;background:var(--paper);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:12px;min-width:240px;z-index:100;display:none}
.settings-pop.open{display:block}
.settings-pop h4{margin:0 0 8px;font-size:12px;color:var(--ink-s)}
.settings-pop .model-list{display:flex;flex-direction:column;gap:4px;max-height:240px;overflow-y:auto}
.model-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;border:1px solid transparent}
.model-item:hover{background:var(--surface)}
.model-item.active{border-color:var(--accent,#6366f1);background:rgba(99,102,241,.06)}
.model-item .dot{width:8px;height:8px;border-radius:50%;background:var(--line)}
.model-item.active .dot{background:var(--accent,#6366f1)}
.history-panel{position:absolute;right:8px;top:100%;margin-top:4px;background:var(--paper);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:0;min-width:320px;max-width:400px;z-index:100;display:none}
.history-panel.open{display:block}
.history-header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}
.history-header h4{margin:0;font-size:12px;color:var(--ink-s)}
.history-list{max-height:360px;overflow-y:auto;padding:4px}
.history-item{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid transparent}
.history-item:hover{background:var(--surface);border-color:var(--line)}
.history-item .hi-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ink-s)}
.history-item .hi-top .hi-tpl{font-weight:500;color:var(--ink)}
.hi-mode-ppt{display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#e0e7ff;color:#4338ca;margin-right:4px}
.hi-mode-anything{display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#92400e;margin-right:4px}
.history-item .hi-preview{font-size:12px;color:var(--ink-s);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.history-item .hi-actions{display:flex;gap:4px;margin-left:auto}
.history-item .hi-actions button{font-size:11px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;background:transparent;cursor:pointer;color:var(--ink-s)}
.history-item .hi-actions button:hover{background:var(--surface);color:var(--ink)}
.icon-btn.sm{width:24px;height:24px;font-size:12px;padding:0;line-height:24px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-m);background:var(--paper);border:1px solid var(--line-f)}
.hint{font-size:10px;color:var(--ink-f);text-transform:uppercase;margin-left:2px}
.caret{color:var(--ink-f);font-size:10px}
#main{display:flex;flex:1;overflow:hidden}
#main #editor{width:44%;min-width:200px;display:flex;flex-direction:column}
#divider{width:5px;cursor:col-resize;background:var(--line);transition:background .15s;flex-shrink:0}
#divider:hover,#divider.active{background:var(--accent,#6366f1)}
#main #preview{flex:1;min-width:200px;display:flex;flex-direction:column}
.panel{display:flex;flex-direction:column;min-width:0;overflow:hidden}
#previewBody{flex:1;display:flex;flex-direction:column;overflow:hidden}
#contentInput{flex:1;width:100%;border:none;outline:none;resize:none;padding:16px;font-size:13px;line-height:1.7;background:var(--paper);color:var(--ink);font-family:inherit}
#contentInput::placeholder{color:var(--ink-f)}
#aiBar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--line-f);background:var(--surface);flex-shrink:0}
.ai-hint{font-size:11px;color:var(--ink-f);white-space:nowrap}
#aiInput{flex:1;padding:6px 12px;border-radius:999px;border:1px solid var(--line-f);background:var(--paper);color:var(--ink);font-size:12.5px;outline:none}
#aiInput::placeholder{color:var(--ink-f)}
#aiInput:focus{border-color:var(--ink-s)}
#previewHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line-f);background:var(--surface);flex-shrink:0}
.tab-bar{display:flex;gap:2px}
.tab{padding:4px 12px;border-radius:999px;font-size:11.5px;font-weight:500;border:1px solid transparent;background:transparent;color:var(--ink-m);cursor:pointer}
.tab.active{background:var(--paper);border-color:var(--line);color:var(--ink)}
.preview-actions{display:flex;align-items:center;gap:6px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:500}
.pill.idle{color:var(--ink-f)}
.pill.running{background:var(--coral-s);color:var(--coral)}
.pill.done{background:rgba(31,122,58,.12);color:var(--green)}
.pill.error{background:rgba(156,42,37,.12);color:var(--red)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.pulse-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--coral);animation:pulse 1.2s ease-in-out infinite;vertical-align:middle;margin-right:4px}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;text-align:center;height:100%;background:var(--paper)}
.empty-state .empty-icon{font-size:48px}
.empty-state h2{font-size:20px;font-weight:600;color:var(--ink)}
.empty-state h2 em{font-family:Georgia,serif;font-style:italic}
.empty-state p{font-size:13px;color:var(--ink-m);max-width:320px;line-height:1.6}
#previewFrame,#deckFrame{width:100%;height:100%;border:none;background:#fff;flex:1}
#deckViewer{display:flex;flex-direction:column;flex:1;background:#1a1a1a}
#deckNav{display:flex;align-items:center;justify-content:center;gap:16px;padding:8px;background:#222;color:#aaa;font-size:12px}
#deckNav button{background:none;border:none;color:#ccc;cursor:pointer;font-size:16px;padding:4px 8px}
.code-editor{flex:1;width:100%;border:none;outline:none;resize:none;padding:16px;font-size:11.5px;line-height:1.6;background:#15140f;color:#e8e4dc;font-family:var(--mono);tab-size:2}
#genOverlay{position:absolute;left:0;right:0;top:42px;padding:6px 12px;font-size:11px;color:var(--coral);background:var(--coral-s);border-bottom:1px solid var(--line-f);z-index:5}
.dropdown{position:fixed;z-index:50;left:12px;top:44px;width:480px;max-height:min(560px,72vh);background:var(--surface);border:1px solid var(--line-s);border-radius:12px;box-shadow:0 20px 50px -15px rgba(21,20,15,.25);overflow:hidden;display:flex;flex-direction:column}
.dd-header{padding:12px 16px 8px;border-bottom:1px solid var(--line-f)}
.dd-title{display:flex;justify-content:space-between;font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:var(--ink-f)}
.dd-title span:last-child{opacity:.6}
#ddSearch{width:100%;margin-top:8px;padding:8px 12px;border-radius:999px;border:1px solid var(--line-f);background:var(--paper);color:var(--ink);font-size:13px;outline:none}
#ddSearch::placeholder{color:var(--ink-f)}
.chips{display:flex;gap:4px;margin-top:8px;overflow-x:auto;padding-bottom:2px}
.chip{padding:4px 10px;border-radius:999px;font-size:11px;border:1px solid var(--line-f);background:transparent;color:var(--ink-m);cursor:pointer;white-space:nowrap}
.chip.active{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.dd-list{flex:1;overflow-y:auto;padding:8px}
.dd-group-label{padding:6px 12px 4px;font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:var(--ink-f)}
.dd-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:background .1s}
.dd-item:hover,.dd-item.hovered{background:var(--paper)}
.dd-item.selected{background:var(--coral-s)}
.dd-item-emoji{font-size:22px;flex-shrink:0}
.dd-item-info{flex:1;min-width:0}
.dd-item-name{font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dd-item-desc{font-size:11px;color:var(--ink-m);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dd-item-hint{font-size:10px;color:var(--ink-f);text-transform:uppercase;flex-shrink:0}
.dd-item-preview{font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid var(--line-f);background:transparent;color:var(--ink-f);cursor:pointer;flex-shrink:0}
.dd-item-preview:hover{color:var(--ink)}
.dd-footer{padding:8px 16px;border-top:1px solid var(--line-f);font-size:10px;color:var(--ink-f)}
.dd-footer kbd{padding:1px 4px;border:1px solid var(--line-f);border-radius:3px}
.popover{position:fixed;z-index:50;width:380px;background:var(--surface);border:1px solid var(--line-s);border-radius:12px;box-shadow:0 20px 50px -15px rgba(21,20,15,.25);overflow:hidden}
.pv-header{padding:10px 14px;border-bottom:1px solid var(--line-f);display:flex;align-items:center;gap:8px}
.pv-emoji{font-size:18px}
.pv-name{font-size:13px;font-weight:600;color:var(--ink)}
.pv-hint{font-size:10px;color:var(--ink-f);text-transform:uppercase}
.pv-card{padding:16px;min-height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:var(--line-f)}
.pv-card-emoji{font-size:56px;line-height:1}
.pv-card-desc{font-size:12px;color:var(--ink-s);text-align:center;max-width:280px;line-height:1.5}
.pv-card-tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:center}
.pv-card-tag{font-size:10px;padding:2px 8px;border-radius:99px;background:var(--surface);color:var(--ink-m);border:1px solid var(--line)}
.mode-switch{display:inline-flex;border-radius:8px;overflow:hidden;border:1px solid var(--line);margin-right:8px}
.mode-btn{padding:5px 14px;font-size:12px;font-weight:500;border:none;background:transparent;color:var(--ink-m);cursor:pointer;transition:all .15s}
.mode-btn.active{background:var(--surface);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.mode-btn:hover:not(.active){color:var(--ink-s)}
.ppt-theme-bar{display:flex;align-items:center;gap:8px;padding:6px 16px;background:var(--paper);border-bottom:1px solid var(--line);font-size:12px}
.ppt-theme-label{color:var(--ink-m);white-space:nowrap}
.ppt-theme-chips{display:flex;gap:4px;flex-wrap:wrap}
.ppt-theme-chip{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;transition:all .15s}
.ppt-theme-chip.active{border-color:var(--ink);transform:scale(1.2)}
.ppt-theme-chip:hover{transform:scale(1.15)}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.fade-in{animation:fadeIn .15s ease-out}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--line);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:var(--line-s)}
`;

function serveAsset(c, ctx) {
  const raw = c.req.path.split("/assets/")[1] || "";
  const fileName = path.basename(decodeURIComponent(raw));
  if (!fileName) return c.text("Not found", 404);

  const assetsDir = path.resolve(ctx.pluginDir, "assets");
  let filePath = path.resolve(assetsDir, fileName);
  if (!filePath.startsWith(assetsDir + path.sep) || !fs.existsSync(filePath)) {
    const examplesDir = path.resolve(assetsDir, "examples");
    filePath = path.resolve(examplesDir, fileName);
    if (!filePath.startsWith(examplesDir + path.sep) || !fs.existsSync(filePath)) {
      return c.text("Not found", 404);
    }
  }

  c.header("Content-Type", contentType(fileName));
  c.header("Cache-Control", fileName === "page.js" ? "no-cache, no-store, must-revalidate" : "public, max-age=3600");
  return c.body(fs.readFileSync(filePath));
}

function contentType(name) {
  if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

let _inlineJsCache = null;
function readInlineJs(ctx) {
  if (_inlineJsCache) return _inlineJsCache;
  try {
    _inlineJsCache = fs.readFileSync(path.join(ctx.pluginDir, "assets", "page.js"), "utf-8");
    return _inlineJsCache;
  } catch {
    return "console.error('page.js not found');";
  }
}

let _templatesCache = null;
function readTemplatesJson(ctx) {
  if (_templatesCache) return _templatesCache;
  try {
    _templatesCache = fs.readFileSync(path.join(ctx.pluginDir, "assets", "templates.json"), "utf-8");
    return _templatesCache;
  } catch {
    return "[]";
  }
}
