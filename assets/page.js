/**
 * HTML Anything — full native JS client. No React, no build step.
 * Handles: template picker, editor, preview, deck, export, host messaging.
 */

// ─── Host messaging ─────────────────────────────────────────────────
const PROTOCOL = "hana.plugin.ui", VER = 1;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const app = $("#app");
const BASE = app?.dataset.base || "/api/plugins/html-anything";
const SESSION = app?.dataset.session || "default";
const TOKEN = new URLSearchParams(window.location.search).get("token") || "";

function apiUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `${BASE}${path}${TOKEN ? `${sep}token=${TOKEN}` : ""}`;
}

function targetOrigin() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("hana-host-origin");
  if (explicit) return explicit;
  try { const o = new URL(document.referrer).origin; if (o) return o; } catch {}
  // Fallback: try parent origin for plugin iframes served from same host
  return window.location.ancestorOrigins?.[0] || null;
}
function postMsg(msg) {
  const o = targetOrigin();
  // Use specific origin when available, "*" as fallback so hana.ready always fires
  window.parent.postMessage(msg, o || "*");
}
function hanaEvent(type, payload) { postMsg({ protocol: PROTOCOL, version: VER, kind: "event", type, payload }); }
function hanaRequest(type, payload, ms = 10000) {
  const id = `ha-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const origin = targetOrigin();
  if (!origin) return Promise.reject(new Error("No host origin"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error(`Timeout: ${type}`)); }, ms);
    function onMsg(e) {
      if (e.source !== window.parent) return;
      const m = e.data || {};
      if (m.protocol !== PROTOCOL || m.version !== VER || m.id !== id || m.type !== type) return;
      clearTimeout(timer); window.removeEventListener("message", onMsg);
      m.kind === "error" ? reject(new Error(m.error?.message || type)) : resolve(m.payload);
    }
    window.addEventListener("message", onMsg);
    postMsg({ protocol: PROTOCOL, version: VER, id, kind: "request", type, payload });
  });
}
const hana = {
  ready: () => hanaEvent("hana.ready"),
  resize: (h) => hanaEvent("ui.resize", { height: h }),
  toast: (msg, type) => hanaRequest("toast.show", { message: msg, type }),
};

// ─── State ───────────────────────────────────────────────────────────
let templates = [];
let selectedTplId = null;
let currentHtml = "";
let modeHtmlStore = { anything: "", ppt: "" };

function setCurrentHtml(html) {
  currentHtml = html;
  modeHtmlStore[currentMode] = html;
}
let pollTimer = null;
let hoverTimer = null;
let leaveTimer = null;
let hoveredTplId = null;
let previewCache = {};
let availableModels = [];
let selectedModelId = null;

// ─── PPT mode state ───────────────────────────────────────────────
var currentMode = "anything";
var pptTemplates = [];
var pptThemes = [];
var selectedPptTheme = null;
var originalTemplates = [];

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("ha-state") || "{}");
    return { templateId: s.templateId || null, content: s.content || "", layoutMode: s.layoutMode || "split", selectedModel: s.selectedModel || null };
  } catch { return { templateId: null, content: "", layoutMode: "split" }; }
}
function saveState(patch) {
  try {
    const s = JSON.parse(localStorage.getItem("ha-state") || "{}");
    Object.assign(s, patch);
    localStorage.setItem("ha-state", JSON.stringify(s));
  } catch {}
}

// ─── Format detection ────────────────────────────────────────────────
function detectFormat(text) {
  if (!text) return "text";
  const t = text.trim();

  // HTML
  if (/^<!DOCTYPE\s+html/i.test(t) || /^<html[\s>]/i.test(t) || (/^<div[\s>]/i.test(t) && /<\/div>/i.test(t))) return "html";

  // JSON
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { JSON.parse(t); return "json"; } catch {}
  }

  // CSV / TSV
  const lines = t.split("\n");
  if (lines.length >= 2) {
    const commaCols = (lines[0].match(/,/g) || []).length;
    const tabCols = (lines[0].match(/\t/g) || []).length;
    if (commaCols >= 2 && lines.slice(0, 5).every(l => (l.match(/,/g) || []).length === commaCols)) return "csv";
    if (tabCols >= 2 && lines.slice(0, 5).every(l => (l.match(/\t/g) || []).length === tabCols)) return "tsv";
  }

  // SQL
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(t.slice(0, 100)) && /;/i.test(t)) return "sql";

  // YAML
  if (/^[a-z_][\w]*\s*:/im.test(t) && !/^---\s*$/m.test(t)) return "yaml";

  // Markdown
  if (/^#{1,6}\s/m.test(t) || /^\s*[-*+]\s/m.test(t) || /\*\*[^*]+\*\*/.test(t) || /\[.*?\]\(.*?\)/.test(t) || /^>\s/m.test(t)) return "markdown";

  return "text";
}

// ─── Init ────────────────────────────────────────────────────────────
async function init() {
  hana.ready();
  hana.resize(600);

  const state = loadState();

  // Load templates — prefer inline data, then fetch
  if (window.__HA_TEMPLATES) {
    templates = window.__HA_TEMPLATES;
  } else {
    try {
      const resp = await fetch(`${BASE}/assets/templates.json`);
      if (resp.ok) templates = await resp.json();
    } catch {}
  }
  if (!templates.length) templates = [{ id: "article-magazine", zhName: "杂志文章", emoji: "📰", scenario: "magazine", aspectHint: "长文", description: "默认模板" }];

  // Save a copy of anything templates for mode switching
  originalTemplates = templates.slice();

  // Initialize PPT mode state
  pptTemplates = (typeof __HA_PPT_TEMPLATES !== 'undefined') ? __HA_PPT_TEMPLATES : [];
  pptThemes = (typeof __HA_PPT_THEMES !== 'undefined') ? __HA_PPT_THEMES : [];

  // Insert mode switch UI before tplBtn
  var modeSwitch = document.createElement("div");
  modeSwitch.id = "modeSwitch";
  modeSwitch.className = "mode-switch";
  modeSwitch.innerHTML = '<button class="mode-btn active" data-mode="anything">Anything</button><button class="mode-btn" data-mode="ppt">PPT</button>';
  $(".toolbar-left").insertBefore(modeSwitch, $("#tplBtn"));
  modeSwitch.addEventListener("click", function(e) {
    var btn = e.target.closest(".mode-btn");
    if (!btn) return;
    switchMode(btn.dataset.mode);
  });

  // Restore state
  if (state.templateId && templates.find(t => t.id === state.templateId)) selectedTplId = state.templateId;
  else selectedTplId = templates[0].id;
  updateTplButton();
  if (state.content) $("#contentInput").value = state.content;
  updateFormatBadge();
  setLayoutMode(state.layoutMode);

  // Load available models
  try {
    await loadModels(state.selectedModel);
  } catch(e) { console.error("loadModels error", e); }

  // Bind events
  bindToolbar();
  bindEditor();
  bindPreview();
  bindTemplatePicker();
  bindAiBar();

  // Auto-check if there's already a preview
  try {
    const resp = await fetch(apiUrl("/api/preview?mode=" + currentMode));
    const data = await resp.json();
    if (data.html) {
      setCurrentHtml(data.html)
      renderPreview();
      setStatus("done");
    }
  } catch {}
}

// ─── Toolbar ─────────────────────────────────────────────────────────
function updateTplButton() {
  const tpl = templates.find(t => t.id === selectedTplId) || templates[0];
  $("#tplEmoji").textContent = tpl.emoji;
  $("#tplName").textContent = tpl.zhName;
  $("#tplHint").textContent = tpl.aspectHint || "";
}

function updateFormatBadge() {
  const text = $("#contentInput").value;
  $("#fmtBadge").textContent = detectFormat(text);
}

function setLayoutMode(mode) {
  const main = $("#main");
  main.className = mode;
  saveState({ layoutMode: mode });
}

// ─── History ─────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const resp = await fetch(apiUrl("/api/history"));
    const data = await resp.json();
    const allItems = data.items || [];
    // Show all items but put current mode's items first
    allItems.sort(function(a, b) {
      var ma = (a.mode || "anything") === currentMode ? 0 : 1;
      var mb = (b.mode || "anything") === currentMode ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return b.ts - a.ts;
    });
    renderHistory(allItems);
  } catch {
    renderHistory([]);
  }
}

function renderHistory(items) {
  const container = $("#historyList");
  if (!items.length) {
    container.innerHTML = '<div style="padding:12px;color:var(--ink-s);font-size:12px">暂无历史</div>';
    return;
  }
  container.innerHTML = items.map(item => {
    const date = new Date(item.ts);
    const timeStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    const preview = esc(item.contentPreview) || "(无内容)";
    const modeLabel = item.mode === "ppt" ? '<span class="hi-mode-ppt">PPT</span>' : '<span class="hi-mode-anything">Anything</span>';
    return `<div class="history-item" data-id="${item.id}" data-mode="${item.mode || 'anything'}">
      <div class="hi-top">
        ${modeLabel}
        <span class="hi-tpl">${esc(item.templateName || "自动")}</span>
        <span>${timeStr}</span>
        <span class="hi-actions">
          <button data-action="load" title="加载到预览">加载</button>
          <button data-action="delete" title="删除">删除</button>
        </span>
      </div>
      <div class="hi-preview">${preview}</div>
    </div>`;
  }).join("");

  // Bind clicks
  container.querySelectorAll(".history-item").forEach(el => {
    el.querySelector('[data-action="load"]').addEventListener("click", (e) => {
      e.stopPropagation();
      loadHistoryItem(el.dataset.id);
    });
    el.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(apiUrl(`/api/history/${el.dataset.id}`), { method: "DELETE" });
      loadHistory();
    });
    el.addEventListener("click", () => loadHistoryItem(el.dataset.id));
  });
}

async function loadHistoryItem(id) {
  try {
    // Find mode from the history-item element
    var el = document.querySelector('.history-item[data-id="' + id + '"]');
    var itemMode = el ? (el.dataset.mode || 'anything') : 'anything';

    // Switch mode if needed
    if (itemMode !== currentMode) {
      switchMode(itemMode);
    }

    const resp = await fetch(apiUrl(`/api/history/${id}`));
    const data = await resp.json();
    if (data.html) {
      setCurrentHtml(data.html)
      renderPreview();
      setStatus("done");
      $("#historyPanel").classList.remove("open");
      hana.toast("已加载历史记录", "success");
    } else {
      hana.toast(data.error || "加载失败", "error");
    }
  } catch(e) {
    console.error("[history] load error", e);
    hana.toast("加载失败", "error");
  }
}

async function loadModels(savedModel) {
  // Prefer inline data from server, then try fetch, then fallback
  let models = [];
  let defaultModel = null;

  if (typeof __HA_MODELS !== 'undefined' && __HA_MODELS) {
    models = __HA_MODELS.models || [];
    defaultModel = __HA_MODELS.defaultModel;
  } else {
    try {
      const resp = await fetch(apiUrl("/api/models"));
      if (resp.ok) {
        const data = await resp.json();
        models = data.models || [];
        defaultModel = data.defaultModel;
      }
    } catch {}
  }

  // Final fallback
  if (!models.length) {
    models = [
      { id: "deepseek-v4-flash", provider: "deepseek" },
      { id: "deepseek-v4-pro", provider: "deepseek" },
      { id: "glm-5", provider: "zhipu" },
      { id: "glm-5.1", provider: "zhipu" },
      { id: "glm-5-turbo", provider: "zhipu" },
      { id: "gemini-3.1-flash-image-preview", provider: "dmx" },
    ];
  }

  availableModels = models;
  selectedModelId = savedModel || defaultModel || (availableModels[0]?.id) || null;
  renderModelList();
  const btn = $("#settingsBtn");
  if (btn) btn.title = selectedModelId ? `模型: ${selectedModelId}` : "模型设置";
}

function renderModelList() {
  const list = $("#modelList");
  if (!list) return;
  if (!availableModels.length) {
    list.innerHTML = '<div style="padding:8px;color:var(--ink-s);font-size:12px">未找到可用模型</div>';
    return;
  }
  list.innerHTML = availableModels.map(m =>
    `<div class="model-item${m.id === selectedModelId ? ' active' : ''}" data-model="${m.id}">
      <span class="dot"></span>
      <span>${m.id}</span>
    </div>`
  ).join("");
  list.querySelectorAll(".model-item").forEach(el => {
    el.addEventListener("click", () => {
      selectedModelId = el.dataset.model;
      saveState({ selectedModel: selectedModelId });
      renderModelList();
      const btn = $("#settingsBtn");
      if (btn) btn.title = `模型: ${selectedModelId}`;
      $("#settingsPop").classList.remove("open");
    });
  });
}

function bindToolbar() {
  // Generate
  $("#genBtn").addEventListener("click", handleGenerate);

  // Settings / model picker
  $("#settingsBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#settingsPop").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#settingsPop") && !e.target.closest("#settingsBtn")) {
      $("#settingsPop").classList.remove("open");
    }
    if (!e.target.closest("#historyPanel") && !e.target.closest("#historyBtn")) {
      const hp = $("#historyPanel");
      if (hp) hp.classList.remove("open");
    }
  });

  // History
  $("#historyBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const hp = $("#historyPanel");
    hp.classList.toggle("open");
    if (hp.classList.contains("open")) loadHistory();
  });
  $("#historyClose").addEventListener("click", () => {
    $("#historyPanel").classList.remove("open");
  });

  // Template button
  $("#tplBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  // Refresh preview
  $("#refreshBtn").addEventListener("click", () => {
    const frame = $("#previewFrame");
    if (currentHtml) { frame.srcdoc = currentHtml; }
  });

  // Export HTML
  // Export HTML via host external.open (iframe 内 a.click() 会被安全策略拦截)
  $("#exportHtmlBtn").addEventListener("click", async () => {
    if (!currentHtml) return;
    try {
      const exportUrl = apiUrl("/api/export?mode=" + currentMode);
      const fullUrl = new URL(exportUrl, window.location.href).href;
      try {
        await hanaRequest("external.open", { url: fullUrl });
      } catch {
        window.open(fullUrl, "_blank");
      }
    } catch (e) {
      console.error("[export-html]", e);
      hana.toast("导出失败: " + e.message, "error");
    }
  });

  // Export PNG screenshot
  $("#exportPngBtn").addEventListener("click", handleExportPng);

  // Resizable divider
  const divider = $("#divider");
  const editor = $("#editor");
  if (divider) {
    let dragging = false;
    divider.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true;
      divider.classList.add("active");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Prevent iframe from stealing mouse events during drag
      const frame = $("#previewFrame");
      if (frame) frame.style.pointerEvents = "none";
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const main = $("#main");
      const rect = main.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(15, Math.min(85, pct));
      editor.style.width = clamped + "%";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const frame = $("#previewFrame");
      if (frame) frame.style.pointerEvents = "";
    });
  }
}

// ─── Editor ──────────────────────────────────────────────────────────
function bindEditor() {
  const input = $("#contentInput");
  const genBtn = $("#genBtn");

  input.addEventListener("input", () => {
    updateFormatBadge();
    saveState({ content: input.value });
    genBtn.disabled = !input.value.trim();
  });

  // Restore button state
  genBtn.disabled = !input.value.trim();
}

// ─── AI Bar ──────────────────────────────────────────────────────────
function bindAiBar() {
  const aiInput = $("#aiInput");
  const aiBtn = $("#aiBtn");
  if (!aiInput || !aiBtn) return;

  aiInput.addEventListener("input", () => {
    aiBtn.disabled = !aiInput.value.trim();
  });

  aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && aiInput.value.trim()) {
      e.preventDefault();
      handleAiGenerate();
    }
  });

  aiBtn.addEventListener("click", () => {
    if (aiInput.value.trim()) handleAiGenerate();
  });
}

async function handleAiGenerate() {
  const aiInput = $("#aiInput");
  const aiBtn = $("#aiBtn");
  const prompt = aiInput.value.trim();
  if (!prompt || generating) return;

  aiBtn.disabled = true;
  aiBtn.innerHTML = '<span class="pulse-dot"></span>思考中';
  aiInput.disabled = true;

  try {
    const contentInput = $("#contentInput");
    contentInput.value = "";
    updateFormatBadge();

    const resp = await fetch(apiUrl("/api/generate-text"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({ prompt, model: selectedModelId }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "请求失败" }));
      hana.toast(err.error || "AI 生成失败", "error");
      return;
    }

    // Switch to "writing" state
    aiBtn.innerHTML = '<span class="pulse-dot"></span>写作中';

    // Stream text directly into textarea
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data);
          if (chunk.error) {
            hana.toast(chunk.error, "error");
            return;
          }
          if (chunk.delta) {
            text += chunk.delta;
            contentInput.value = text;
            contentInput.scrollTop = contentInput.scrollHeight;
          }
          if (chunk.done) {
            saveState({ content: text });
            updateFormatBadge();
          }
        } catch {}
      }
    }

    // Final save in case done signal was missing
    if (text) {
      saveState({ content: text });
      updateFormatBadge();
    }
  } catch (err) {
    hana.toast("AI 生成失败: " + err.message, "error");
  } finally {
    aiBtn.disabled = false;
    aiBtn.textContent = "生成";
    aiInput.disabled = false;
    aiInput.value = "";
    aiInput.focus();
  }
}

// ─── Generate ────────────────────────────────────────────────────────
let generating = false;
let activeTab = "preview"; // "preview" | "code"

async function handleGenerate() {
  const content = $("#contentInput").value.trim();
  if (!content || generating) return;
  generating = true;
  var genMode = currentMode; // capture mode at generation start
  var genBtn = $("#genBtn");
  if (genBtn) genBtn.disabled = true;

  setStatus("running");
  setCurrentHtml("")
  // Reset streaming render counters so next generation starts fresh
  var pvFrame = $("#previewFrame");
  if (pvFrame) { pvFrame._haLastSize = 0; pvFrame._haLastTime = 0; }
  var lastRenderTime = 0;
  var startTime = Date.now();

  try {
    const resp = await fetch(apiUrl("/api/generate"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({
        templateId: selectedTplId,
        mode: genMode,
        pptTheme: selectedPptTheme,
        content, format: detectFormat(content),
        model: selectedModelId,
        ...(currentHtml ? { editFromHtml: currentHtml } : {}),
      }),
    });

    // Check if we got SSE stream
    var ct = resp.headers.get("content-type") || "";
    if (ct.includes("text/event-stream") && resp.body && typeof resp.body.getReader === "function") {
      // Stream mode
      var reader = resp.body.getReader();
      var decoder = new TextDecoder();
      var sseBuffer = "";
      var streamingHtml = "";

      while (true) {
        var result = await reader.read();
        if (result.done) break;
        sseBuffer += decoder.decode(result.value, { stream: true });
        var sseLines = sseBuffer.split("\n");
        sseBuffer = sseLines.pop();

        for (var i = 0; i < sseLines.length; i++) {
          var line = sseLines[i];
          if (!line.startsWith("data: ")) continue;
          var sseData;
          try { sseData = JSON.parse(line.slice(6)); } catch { continue; }

          if (sseData.error) {
            setStatus("error");
            hana.toast("生成失败: " + sseData.error, "error");
            generating = false;
            resetGenButton();
            return;
          }
          if (sseData.done) {
            // Cleanup blob URL and do final render
            var frame = $("#previewFrame");
            if (frame && frame._haBlobUrl) {
              URL.revokeObjectURL(frame._haBlobUrl);
              frame._haBlobUrl = null;
              frame._haLastSize = 0;
              frame._haLastTime = 0;
            }
            currentHtml = streamingHtml; modeHtmlStore[genMode] = streamingHtml;
            renderPreview();
            setStatus("done");
            generating = false;
            resetGenButton();
            return;
          }
          if (sseData.delta) {
            streamingHtml += sseData.delta;
            // First delta: switch from "thinking" to "generating"
            if (lastRenderTime === 0) {
              var pill = $("#statusPill");
              var genBtn = $("#genBtn");
              if (pill) pill.innerHTML = '<span class="pulse-dot"></span>生成中';
              if (genBtn) genBtn.innerHTML = '<span class="pulse-dot"></span>生成中';
            }
            var now = Date.now();
            if (now - lastRenderTime > 80) {
              lastRenderTime = now;
              renderStreamingPreview(streamingHtml, now - startTime);
            }
          }
        }
      }
      // Stream ended without done signal — render final
      currentHtml = streamingHtml; modeHtmlStore[genMode] = streamingHtml;
      renderPreview();
      setStatus("done");
    } else {
      // Fallback: sync mode (server didn't stream)
      var result = await resp.json();
      if (!result.ok) {
        setStatus("error");
        hana.toast("生成失败: " + (result.error || "未知错误"), "error");
      } else {
        var pvResp = await fetch(apiUrl("/api/preview?mode=" + genMode));
        var pvData = await pvResp.json();
        if (pvData.html) {
          currentHtml = pvData.html; modeHtmlStore[genMode] = pvData.html;
          renderPreview();
          setStatus("done");
        } else {
          setStatus("error");
        }
      }
    }
  } catch (err) {
    setStatus("error");
    hana.toast("请求失败: " + err.message, "error");
  } finally {
    generating = false;
    resetGenButton();
  }
}

// Polling removed — generate is synchronous, no polling needed

function renderStreamingPreview(raw, elapsed) {
  // Update status pill
  var pill = $("#statusPill");
  var sec = ((elapsed || 0) / 1000).toFixed(1);
  var kb = (raw.length / 1024).toFixed(1);
  pill.innerHTML = '<span class="pulse-dot"></span>' + sec + 's · ' + kb + 'KB';

  // Update code area in real time (always)
  var code = $("#codeArea");
  if (code) {
    code.value = raw;
    code.scrollTop = code.scrollHeight;
  }

  var frame = $("#previewFrame");

  if (activeTab === "code") {
    // User is viewing code — only update code area
    code.style.display = "block";
    frame.style.display = "none";
    return;
  }

  // User is viewing preview — update iframe with throttled Blob URL
  code.style.display = "none";
  var newSize = raw.length;
  var lastSize = frame._haLastSize || 0;
  var lastTime = frame._haLastTime || 0;
  var now = Date.now();
  var sizeDelta = newSize - lastSize;
  var timeDelta = now - lastTime;

  if (sizeDelta > 1024 || timeDelta > 500) {
    frame._haLastSize = newSize;
    frame._haLastTime = now;
    if (frame._haBlobUrl) URL.revokeObjectURL(frame._haBlobUrl);
    frame.removeAttribute("srcdoc"); // srcdoc takes priority over src
    var blob = new Blob([extractHtml(raw)], { type: "text/html" });
    frame._haBlobUrl = URL.createObjectURL(blob);
    frame.src = frame._haBlobUrl;
    frame.style.display = "block";
    $("#previewEmpty").style.display = "none";
  }
}

function resetGenButton() {
  var genBtn = $("#genBtn");
  if (genBtn) {
    genBtn.textContent = "生成";
    genBtn.disabled = !$("#contentInput").value.trim();
  }
}

// ─── Status ──────────────────────────────────────────────────────────
function setStatus(status) {
  const pill = $("#statusPill");
  const overlay = $("#genOverlay");
  const genBtn = $("#genBtn");

  pill.className = `pill ${status}`;
  const labels = { idle: "就绪", running: "思考中", done: "完成", error: "错误" };
  pill.innerHTML = status === "running" ? `<span class="pulse-dot"></span>${labels[status]}` : labels[status];

  overlay.style.display = status === "running" ? "block" : "none";
  genBtn.disabled = status === "running";
  if (status === "running") {
    genBtn.innerHTML = `<span class="pulse-dot"></span>思考中`;
  } else {
    genBtn.textContent = "生成";
    genBtn.disabled = !$("#contentInput").value.trim();
  }
}

// ─── Preview ─────────────────────────────────────────────────────────
function bindPreview() {
  // Tab switching
  $$(".tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

  // Deck nav
  $("#deckPrev").addEventListener("click", () => navigateDeck(-1));
  $("#deckNext").addEventListener("click", () => navigateDeck(1));

  // Code editor — allow manual editing when not running
  $("#codeArea").addEventListener("input", () => {
    setCurrentHtml($("#codeArea").value)
  });
}

function switchTab(tab) {
  activeTab = tab === "deck" ? "preview" : tab;
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  const hasHtml = !!currentHtml;

  // Show/hide panels
  const empty = $("#previewEmpty");
  const frame = $("#previewFrame");
  const deck = $("#deckViewer");
  const code = $("#codeArea");
  const refresh = $("#refreshBtn");
  const exportBtn = $("#exportHtmlBtn");

  empty.style.display = "none";
  frame.style.display = "none";
  deck.style.display = "none";
  code.style.display = "none";
  refresh.style.display = "none";

  if (tab === "preview") {
    if (hasHtml) { frame.style.display = "block"; refresh.style.display = "grid"; }
    else { empty.style.display = "flex"; }
  } else if (tab === "deck") {
    deck.style.display = "flex";
  } else if (tab === "code") {
    code.style.display = "block";
    code.value = currentHtml;
    code.readOnly = false;
  }

  exportBtn.style.display = hasHtml ? "inline-flex" : "none";
  $("#exportPngBtn").style.display = hasHtml ? "inline-flex" : "none";
}

function renderPreview() {
  if (!currentHtml) return;

  const cleaned = extractHtml(currentHtml);
  const isDeckMode = currentMode === "ppt" || detectDeck(cleaned);

  // Show export button
  $("#exportHtmlBtn").style.display = "inline-flex";
  $("#exportPngBtn").style.display = "inline-flex";

  // Hide deck tab always — deck is now integrated into preview
  const deckTab = $('[data-tab="deck"]');
  if (deckTab) deckTab.style.display = "none";

  if (isDeckMode) {
    renderDeckInPreview(cleaned);
  } else {
    // Respect user's active tab choice
    if (activeTab === "code") {
      var code = $("#codeArea");
      if (code) code.value = cleaned;
    } else {
      switchTab("preview");
      $("#previewFrame").removeAttribute("src"); // src must be cleared for srcdoc to take effect
      $("#previewFrame").srcdoc = cleaned;
    }
  }
}

function extractHtml(raw) {
  if (!raw) return "";
  let s = raw.trim();
  const m = s.match(/^```(?:html)?\s*\n?([\s\S]*?)```?\s*$/);
  if (m) s = m[1].trim();
  if (!s.startsWith("<")) { const i = s.indexOf("<"); if (i >= 0) s = s.slice(i); }
  return s;
}

const SLIDE_RE = /<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi;

function detectDeck(html) {
  if (!html) return false;
  SLIDE_RE.lastIndex = 0;
  return SLIDE_RE.test(html);
}

// ─── Deck viewer ─────────────────────────────────────────────────────
let deckSlides = [];
let deckCurrent = 0;
let deckParsed = null;

function extractAttr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + '\\s*=\\s*["\']([^"\']*)["\']', "i"));
  return m ? m[1] : "";
}

function stripTags(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDeckClient(fullHtml) {
  SLIDE_RE.lastIndex = 0;
  if (!SLIDE_RE.test(fullHtml)) return null;

  const headM = fullHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const head = headM ? headM[1] : "";
  const bodyTagM = fullHtml.match(/<body\b([^>]*)>/i);
  const bodyTag = bodyTagM ? bodyTagM[1] : "";
  const bodyClass = extractAttr(bodyTag, "class");
  const bodyStyle = extractAttr(bodyTag, "style");

  const slides = [];
  SLIDE_RE.lastIndex = 0;
  let m;
  let idx = 0;
  while ((m = SLIDE_RE.exec(fullHtml))) {
    idx++;
    const sectionHtml = m[0];
    const openTagM = sectionHtml.match(/<section\b[^>]*>/i);
    const openTag = openTagM ? openTagM[0] : "";
    const dataId = extractAttr(openTag, "data-slide-id");
    const inlineStyle = extractAttr(openTag, "style");
    const bgM = inlineStyle.match(/background(?:-color)?\s*:\s*([^;"']+)/i);
    const bg = bgM ? bgM[1].trim() : undefined;

    let notes = "";
    const slideForRender = sectionHtml.replace(
      /<aside\b[^>]*\bclass\s*=\s*["'][^"']*\bnotes\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/i,
      (_full, inner) => { notes = stripTags(inner); return ""; }
    );

    const standalone =
      "<!DOCTYPE html><html><head>" + head + "\n" +
      "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden}</style></head>" +
      '<body class="' + bodyClass + '" style="' + bodyStyle + '">' + slideForRender + "</body></html>";

    slides.push({ html: standalone, notes, id: dataId || String(idx), bg });
  }

  return { slides, head, bodyClass, bodyStyle };
}

// Render deck HTML into the standard preview iframe (PPT mode or auto-detected deck)
function renderDeckInPreview(html) {
  switchTab("preview");
  var frame = $("#previewFrame");
  // Use srcdoc for same-origin access (needed for PNG screenshot of active slide)
  frame.src = "";
  frame.srcdoc = html;
  frame.style.display = "block";
  $("#previewEmpty").style.display = "none";
  $("#codeArea").style.display = "none";
  $("#deckViewer").style.display = "none";
}

function deckKeyHandler(e) {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") navigateDeck(-1);
  if (e.key === "ArrowRight") navigateDeck(1);
  if (e.key === "f" || e.key === "F") toggleDeckFullscreen();
  if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen();
}

function navigateDeck(dir) {
  deckCurrent = Math.max(0, Math.min(deckSlides.length - 1, deckCurrent + dir));
  showDeckSlide();
}

function showDeckSlide() {
  const slide = deckSlides[deckCurrent] || "";
  const frame = $("#deckFrame");
  frame.srcdoc = "";
  requestAnimationFrame(() => { frame.srcdoc = slide; });
  $("#deckInfo").textContent = `${deckCurrent + 1} / ${deckSlides.length}`;

  // Show notes if available
  if (deckParsed && deckParsed.slides[deckCurrent]?.notes) {
    let notesEl = $("#deckNotes");
    if (!notesEl) {
      notesEl = document.createElement("div");
      notesEl.id = "deckNotes";
      notesEl.style.cssText = "padding:8px 16px;background:#1a1a1a;color:#888;font-size:12px;border-top:1px solid #333;max-height:80px;overflow-y:auto";
      const viewer = $("#deckViewer");
      if (viewer) viewer.appendChild(notesEl);
    }
    notesEl.textContent = deckParsed.slides[deckCurrent].notes;
    notesEl.style.display = "block";
  } else {
    const notesEl = $("#deckNotes");
    if (notesEl) notesEl.style.display = "none";
  }
}

function toggleDeckFullscreen() {
  const viewer = $("#deckViewer");
  if (!viewer) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    viewer.requestFullscreen().catch(() => {});
  }
}

// ─── Template picker ─────────────────────────────────────────────────
let ddOpen = false;
let ddQuery = "";
let ddFilter = "all";

function bindTemplatePicker() {
  const dd = $("#tplDropdown");
  const search = $("#ddSearch");

  // Close on outside click
  document.addEventListener("mousedown", (e) => {
    if (ddOpen && !dd.contains(e.target) && !$("#tplBtn").contains(e.target)) closeDropdown();
  });

  // ESC closes
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ddOpen) closeDropdown(); });

  // Search
  search.addEventListener("input", () => { ddQuery = search.value; renderDropdownList(); });

  // Build filter chips
  renderDropdownChips();
}

function toggleDropdown() {
  ddOpen ? closeDropdown() : openDropdown();
}

function openDropdown() {
  ddOpen = true;
  ddQuery = "";
  ddFilter = "all";
  const dd = $("#tplDropdown");
  // Position dropdown below the template button
  const btn = $("#tplBtn");
  if (btn) {
    const rect = btn.getBoundingClientRect();
    dd.style.left = rect.left + "px";
    dd.style.top = (rect.bottom + 4) + "px";
  }
  dd.style.display = "flex";
  dd.classList.add("fade-in");
  renderDropdownChips();
  renderDropdownList();
  requestAnimationFrame(() => $("#ddSearch").focus());
}

function closeDropdown() {
  ddOpen = false;
  $("#tplDropdown").style.display = "none";
  $("#hoverPreview").style.display = "none";
  hoveredTplId = null;
}

// ─── PPT Mode switching ──────────────────────────────────────────────
function switchMode(mode) {
  if (mode === currentMode) return;

  // Save current mode's HTML
  modeHtmlStore[currentMode] = currentHtml;

  currentMode = mode;
  // Update buttons
  document.querySelectorAll("#modeSwitch .mode-btn").forEach(function(b) {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  // Switch template list
  if (mode === "ppt") {
    templates = pptTemplates.map(function(t) { return Object.assign({}, t, { example: { hasHtml: true } }); });
    renderDropdownChips();
    updateThemeBar();
  } else {
    templates = originalTemplates;
    renderDropdownChips();
    hideThemeBar();
  }
  // Reset selection
  selectedTplId = null;
  updateTplButton();

  // Restore target mode's HTML and re-render
  currentHtml = modeHtmlStore[mode] || "";
  if (currentHtml) {
    var f = $("#previewFrame");
    if (f) { f._haLastSize = 0; f._haLastTime = 0; }
    renderPreview();
    setStatus("done");
  } else {
    // Try loading from server for this mode
    fetch(apiUrl("/api/preview?mode=" + mode)).then(function(r) { return r.json(); }).then(function(data) {
      if (data.html) {
        currentHtml = data.html;
        modeHtmlStore[mode] = data.html;
        var f = $("#previewFrame");
        if (f) { f._haLastSize = 0; f._haLastTime = 0; }
        renderPreview();
        setStatus("done");
      } else {
        $("#previewFrame").style.display = "none";
        $("#previewEmpty").style.display = "flex";
        $("#codeArea").value = "";
        setStatus("idle");
      }
    }).catch(function() {
      $("#previewFrame").style.display = "none";
      $("#previewEmpty").style.display = "flex";
      $("#codeArea").value = "";
      setStatus("idle");
    });
  }
}

function updateThemeBar() {
  var bar = $("#pptThemeBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "pptThemeBar";
    bar.className = "ppt-theme-bar";
    var toolbar = $("#toolbar");
    toolbar.parentNode.insertBefore(bar, toolbar.nextSibling);
  }
  if (currentMode !== "ppt") { hideThemeBar(); return; }

  // Get available themes for the current template
  var tpl = pptTemplates.find(function(t) { return t.id === selectedTplId; });
  var themeIds = tpl ? tpl.availableThemes : [];
  var themes = pptThemes.filter(function(t) { return themeIds.indexOf(t.themeId) >= 0; });
  if (themes.length === 0) themes = pptThemes.slice(0, 8);

  bar.style.display = "flex";
  bar.innerHTML = '<span class="ppt-theme-label">主题：</span><div class="ppt-theme-chips"></div>';
  var chips = bar.querySelector(".ppt-theme-chips");
  themes.forEach(function(t) {
    var chip = document.createElement("button");
    chip.className = "ppt-theme-chip" + (selectedPptTheme === t.themeId ? " active" : "");
    chip.style.background = t.accent;
    chip.title = t.name;
    chip.dataset.themeId = t.themeId;
    chip.addEventListener("click", function() {
      selectedPptTheme = t.themeId;
      bar.querySelectorAll(".ppt-theme-chip").forEach(function(c) { c.classList.remove("active"); });
      chip.classList.add("active");
    });
    chips.appendChild(chip);
  });

  // Default selection
  if (!selectedPptTheme && tpl && tpl.defaultTheme) {
    selectedPptTheme = tpl.defaultTheme;
    var defaultChip = chips.querySelector('[data-theme-id="' + tpl.defaultTheme + '"]');
    if (defaultChip) defaultChip.classList.add("active");
  }
}

function hideThemeBar() {
  var bar = $("#pptThemeBar");
  if (bar) bar.style.display = "none";
  selectedPptTheme = null;
}

function renderDropdownChips() {
  const scenarios = [...new Set(templates.map(t => t.scenario))];
  const container = $("#ddChips");
  container.innerHTML = "";

  const allChip = mkEl("button", { className: `chip ${ddFilter === "all" ? "active" : ""}`, textContent: "全部" });
  allChip.addEventListener("click", () => { ddFilter = "all"; renderDropdownChips(); renderDropdownList(); });
  container.appendChild(allChip);

  for (const s of scenarios) {
    const chip = mkEl("button", { className: `chip ${ddFilter === s ? "active" : ""}`, textContent: s });
    chip.addEventListener("click", () => { ddFilter = s; renderDropdownChips(); renderDropdownList(); });
    container.appendChild(chip);
  }
}

function renderDropdownList() {
  const list = $("#ddList");
  list.innerHTML = "";

  const filtered = templates.filter(t => {
    if (ddFilter !== "all" && t.scenario !== ddFilter) return false;
    if (ddQuery) {
      const hay = [t.zhName, t.enName, t.description, t.aspectHint, t.scenario, ...(t.tags || [])].join(" ").toLowerCase();
      return ddQuery.toLowerCase().split(/\s+/).filter(Boolean).every(tok => hay.includes(tok));
    }
    return true;
  });

  // Group by scenario when no filter
  let groups;
  if (ddFilter === "all" && !ddQuery) {
    const recommended = filtered.filter(t => typeof t.recommended === "number").sort((a, b) => a.recommended - b.recommended);
    const rest = filtered.filter(t => typeof t.recommended !== "number");
    const buckets = new Map();
    for (const d of rest) { if (!buckets.has(d.scenario)) buckets.set(d.scenario, []); buckets.get(d.scenario).push(d); }
    groups = [];
    if (recommended.length) groups.push({ label: "推荐", items: recommended });
    for (const [scenario, items] of buckets) groups.push({ label: scenario, items });
  } else {
    groups = [{ label: "", items: filtered }];
  }

  $("#ddCount").textContent = `${filtered.length} / ${templates.length}`;

  if (!filtered.length) {
    list.innerHTML = '<div style="padding:32px;text-align:center;font-size:12px;color:var(--ink-f)">没有匹配的模板</div>';
    return;
  }

  for (const group of groups) {
    if (group.label) {
      const label = mkEl("div", { className: "dd-group-label", textContent: group.label });
      list.appendChild(label);
    }
    for (const tpl of group.items) {
      const item = mkEl("div", { className: `dd-item${tpl.id === selectedTplId ? " selected" : ""}` });

      item.innerHTML = `
        <span class="dd-item-emoji">${tpl.emoji}</span>
        <div class="dd-item-info">
          <div class="dd-item-name">${esc(tpl.zhName)}</div>
          <div class="dd-item-desc">${esc(tpl.description)}</div>
        </div>
        <span class="dd-item-hint">${esc(tpl.aspectHint || "")}</span>
        ${tpl.example?.hasHtml ? '<button class="dd-item-preview" title="加载示例">▶</button>' : ""}
        ${tpl.id === selectedTplId ? '<span style="color:var(--coral);font-size:10px">●</span>' : ""}
      `;

      // Click to select
      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("dd-item-preview")) return;
        selectTemplate(tpl.id);
        closeDropdown();
      });

      // Preview button
      const previewBtn = item.querySelector(".dd-item-preview");
      if (previewBtn) {
        previewBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          loadTemplateExample(tpl.id);
        });
      }

      // Hover preview
      item.addEventListener("mouseenter", () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        if (leaveTimer) clearTimeout(leaveTimer);
        hoverTimer = setTimeout(() => showHoverPreview(tpl.id), 260);
      });
      item.addEventListener("mouseleave", () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        leaveTimer = setTimeout(() => hideHoverPreview(), 160);
      });

      list.appendChild(item);
    }
  }
}

function selectTemplate(id) {
  selectedTplId = id;
  saveState({ templateId: id });
  updateTplButton();
  if (currentMode === "ppt") updateThemeBar();
}

async function loadTemplateExample(id) {
  try {
     const resp = await fetch(apiUrl("/api/preview?templateId=" + encodeURIComponent(id)));
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.html) return;
    const html = data.html;
    setCurrentHtml(html)
    renderPreview();
    closeDropdown();
    hana.toast("已加载模板示例", "success");
  } catch {}
}

// ─── Hover preview ───────────────────────────────────────────────────
async function showHoverPreview(id) {
  hoveredTplId = id;
  const tpl = templates.find(t => t.id === id);
  if (!tpl) return;

  const popover = $("#hoverPreview");
  $("#pvEmoji").textContent = tpl.emoji;
  $("#pvName").textContent = tpl.zhName;
  $("#pvHint").textContent = tpl.aspectHint || "";

  const card = $("#pvCard");

  // Try to load example HTML into scaled iframe via URL (srcdoc blocked by Hana sandbox)
  if (tpl.example?.hasHtml) {
    card.innerHTML = '<div class="pv-card-loading" style="font-size:11px;color:var(--ink-f)">加载预览...</div>';
    try {
      const resp = await fetch(apiUrl("/api/preview?templateId=" + id));
      const data = await resp.json();
      if (data.html) {
        // Use Blob URL — works in Hana iframe sandbox
        var blob = new Blob([data.html], { type: "text/html" });
        var blobUrl = URL.createObjectURL(blob);
        var zoom = 0.36;
        var containerW = Math.round(1024 * zoom);
        var containerH = Math.round(768 * zoom);
        card.innerHTML = '<iframe sandbox="allow-scripts allow-same-origin" style="width:1024px;height:768px;border:none;zoom:' + zoom + ';display:block" src="' + blobUrl + '"></iframe>';
        card.style.cssText = "display:block;padding:0;width:" + containerW + "px;height:" + containerH + "px;overflow-y:auto;background:#fff;border-radius:0 0 8px 8px";
        // Cleanup blob when popover hides
        card._blobUrl = blobUrl;
      } else {
        renderFallbackCard(card, tpl);
      }
    } catch {
      renderFallbackCard(card, tpl);
    }
  } else {
    renderFallbackCard(card, tpl);
  }

  popover.style.display = "block";
  popover.classList.add("fade-in");

  const dd = $("#tplDropdown");
  if (dd) {
    const ddRect = dd.getBoundingClientRect();
    let left = ddRect.right + 12;
    let top = ddRect.top;
    // Keep popover within viewport
    const pw = 396; // popover width + padding
    const ph = 320; // approximate popover height
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + pw > vw) left = Math.max(8, ddRect.left - pw - 12);
    if (top + ph > vh) top = Math.max(8, vh - ph - 8);
    popover.style.left = left + "px";
    popover.style.top = top + "px";
  }

  popover.onmouseenter = () => { if (leaveTimer) clearTimeout(leaveTimer); };
  popover.onmouseleave = () => { leaveTimer = setTimeout(() => hideHoverPreview(), 160); };
}

function renderFallbackCard(card, tpl) {
  card.style.cssText = "";
  card.innerHTML = ''
    + '<div class="pv-card-emoji">' + tpl.emoji + '</div>'
    + '<div class="pv-card-desc">' + esc(tpl.description || tpl.enName) + '</div>'
    + '<div class="pv-card-tags">' + (tpl.tags || []).map(t => '<span class="pv-card-tag">' + esc(t) + '</span>').join('') + '</div>';
}

function hideHoverPreview() {
  const card = $("#pvCard");
  if (card && card._blobUrl) { URL.revokeObjectURL(card._blobUrl); card._blobUrl = null; }
  $("#hoverPreview").style.display = "none";
  hoveredTplId = null;
}

// ─── Utilities ───────────────────────────────────────────────────────
function esc(s) {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mkEl(tag, props) {
  const el = document.createElement(tag);
  return Object.assign(el, props);
}

// ─── PNG Screenshot Export ──────────────────────────────────────────
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function nextFrame() { return new Promise(function(r) { requestAnimationFrame(r); }); }

function waitForReady(doc, win) {
  return new Promise(function(resolve) {
    var checks = [];
    // Wait for fonts
    if (win.document.fonts && win.document.fonts.ready) checks.push(win.document.fonts.ready);
    // Wait for images
    var imgs = doc.querySelectorAll("img");
    imgs.forEach(function(img) {
      if (!img.complete) checks.push(new Promise(function(r) { img.onload = img.onerror = r; }));
    });
    // Wait for stylesheets
    var sheets = doc.querySelectorAll('link[rel="stylesheet"]');
    sheets.forEach(function(link) {
      if (link.sheet) return;
      checks.push(new Promise(function(r) { link.onload = link.onerror = r; }));
    });
    // Give a minimum delay for CDN scripts (Tailwind etc)
    checks.push(sleep(1500));
    Promise.all(checks).then(resolve);
  });
}

function resolveBg(doc, win) {
  // Try to get background color from the body or html
  try {
    var bg = win.getComputedStyle(doc.body).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    bg = win.getComputedStyle(doc.documentElement).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
  } catch {}
  return "#ffffff";
}

async function captureScreenshot(iframeEl) {
  var doc = iframeEl.contentDocument;
  var win = iframeEl.contentWindow;
  if (!doc || !win) throw new Error("iframe 未就绪");

  // Wait for resources to load
  await waitForReady(doc, win);

  // Expand iframe to full content height for complete capture
  var prevH = iframeEl.style.height;
  var prevOverflowDoc = doc.documentElement.style.overflow;
  var prevOverflowBody = doc.body.style.overflow;
  var fullH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
  var layoutW = doc.documentElement.clientWidth || iframeEl.clientWidth;

  iframeEl.style.height = fullH + "px";
  doc.documentElement.style.overflow = "visible";
  doc.body.style.overflow = "visible";

  await nextFrame(); await sleep(100); await nextFrame();

  try {
    var blob = await modernScreenshot.domToBlob(doc.documentElement, {
      scale: 2,
      type: "image/png",
      width: layoutW,
      height: fullH,
      backgroundColor: resolveBg(doc, win),
    });
    return blob;
  } finally {
    iframeEl.style.height = prevH;
    doc.documentElement.style.overflow = prevOverflowDoc;
    doc.body.style.overflow = prevOverflowBody;
  }
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function blobToDataUrl(blob) {
  return new Promise(function(resolve) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.readAsDataURL(blob);
  });
}

// Inject CSS to make all content visible for screenshot (deck sections etc)
// Must be comprehensive enough to override JS-set inline styles
var SCREENSHOT_FIX_CSS = '<style data-screenshot-fix>'
  + 'html, body { overflow: visible !important; height: auto !important; max-height: none !important; }'
  + 'section, .slide, [class*="slide"], [class*="frame"], article, main { display: block !important; overflow: visible !important; height: auto !important; max-height: none !important; opacity: 1 !important; visibility: visible !important; }'
  + '</style>';

// Deck-specific fix: only the active slide is visible, others stay hidden
// Deck screenshot: arrange all slides vertically for a single long screenshot
var DECK_SCREENSHOT_FIX_CSS = '<style data-screenshot-fix>'
  + 'html, body { overflow: visible !important; width: 1024px !important; height: auto !important; position: relative !important; }'
  + '.slide { display: flex !important; flex-direction: column !important; opacity: 1 !important; visibility: visible !important; position: relative !important; inset: auto !important; width: 1024px !important; min-height: 576px !important; height: auto !important; overflow: visible !important; box-sizing: border-box !important; transform: none !important; }'
  // Force all animated elements to their final visible state
  + '.anim-fade-up,.anim-fade-down,.anim-rise-in,.anim-zoom-pop,.anim-blur-in,.anim-stagger-list > *,.anim-confetti-burst::before,.anim-confetti-burst::after,.slide *:not(.slide){opacity:1 !important;transform:none !important;filter:none !important;animation:none !important;}'
  + '.card,.grid,[class*="grid"]{overflow:visible !important;}'
  // Only small UI elements get nowrap — pill buttons, labels, tags (NOT body text)
  + '.pill,.kicker,.eyebrow,.badge,.tag,.dim2,[class*="label"]{white-space:nowrap !important;}'
  + '</style>';

// Strip only inline <script> tags (no src attribute), keep CDN scripts like Tailwind
function stripInlineScripts(html) {
  return html.replace(/<script(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi, '');
}
async function handleExportPng() {
  if (!currentHtml) {
    hana.toast("没有可截图的内容", "error");
    return;
  }

  // Lazy-load modern-screenshot
  if (typeof modernScreenshot === "undefined") {
    try {
      await new Promise(function(resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.min.js";
        s.onload = resolve;
        s.onerror = function() { reject(new Error("Failed to load screenshot library")); };
        document.head.appendChild(s);
      });
    } catch (e) {
      hana.toast("截图库加载失败", "error");
      return;
    }
  }
  var btn = $("#exportPngBtn");
  btn.disabled = true;
  btn.textContent = "截图中...";
  try {
    var cleaned = extractHtml(currentHtml);
    var isDeck = detectDeck(cleaned);
    var blob;

    if (isDeck) {
      // ── Deck mode: all slides vertically arranged into one long PNG ──
      blob = await screenshotDeckLongImage(cleaned);
    } else {
      // ── Non-deck mode: original temporary iframe approach ──
      blob = await screenshotViaTempIframe(cleaned);
    }

    if (!blob || blob.size < 1000) {
      hana.toast("截图失败: 生成的图片无效", "error");
      return;
    }

    // Upload to backend and open via host API
    var filename = isDeck
      ? "deck-all-" + Date.now() + ".png"
      : "html-anything-" + Date.now() + ".png";

    var dataUrl = await blobToDataUrl(blob);
    var saveResp = await fetch(apiUrl("/api/save-screenshot"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: dataUrl, filename: filename }),
    });
    var saveResult = await saveResp.json();

    if (saveResult.ok) {
      var screenshotUrl = apiUrl("/api/screenshot/" + saveResult.filename);
      var fullUrl = new URL(screenshotUrl, window.location.href).href;
      try {
        hanaRequest("external.open", { url: fullUrl });
      } catch {
        window.open(fullUrl, "_blank");
      }
      hana.toast("截图已导出 (" + Math.round(blob.size / 1024) + "KB)", "success");
    } else {
      hana.toast("保存截图失败", "error");
    }
  } catch (err) {
    console.error("[export-png]", err);
    hana.toast("截图失败: " + err.message, "error");
    var leftover = document.querySelector('iframe[style*="-9999px"]');
    if (leftover) document.body.removeChild(leftover);
  } finally {
    btn.disabled = false;
    btn.textContent = "📷 PNG";
  }
}

// ── Non-deck: original temp-iframe screenshot ──
async function screenshotViaTempIframe(cleaned) {
  var frameW = 1024;
  var pf = $("#previewFrame");
  if (pf && pf.clientWidth > 100) frameW = pf.clientWidth;

  var screenshotHtml = stripInlineScripts(currentHtml);
  var headClose = screenshotHtml.indexOf('</head>');
  if (headClose > 0) {
    screenshotHtml = screenshotHtml.slice(0, headClose) + SCREENSHOT_FIX_CSS + screenshotHtml.slice(headClose);
  } else {
    screenshotHtml = SCREENSHOT_FIX_CSS + screenshotHtml;
  }

  var tempFrame = document.createElement("iframe");
  tempFrame.style.cssText = "position:fixed;left:-9999px;width:" + frameW + "px;height:768px;border:none;visibility:hidden";
  document.body.appendChild(tempFrame);
  tempFrame.srcdoc = screenshotHtml;

  await new Promise(function(resolve) {
    tempFrame.onload = resolve;
    setTimeout(resolve, 10000);
  });
  await sleep(800);

  var doc = tempFrame.contentDocument;
  var win = tempFrame.contentWindow;
  if (!doc || !win) {
    document.body.removeChild(tempFrame);
    throw new Error("无法访问预览内容");
  }

  await waitForReady(doc, win);
  if (modernScreenshot.waitUntilLoad) {
    try { await modernScreenshot.waitUntilLoad(doc.documentElement, { timeout: 6000 }); } catch {}
  }

  doc.documentElement.style.overflow = "visible";
  doc.body.style.overflow = "visible";
  await nextFrame(); await sleep(200); await nextFrame();

  var fullH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
  tempFrame.style.height = fullH + "px";
  tempFrame.style.visibility = "visible";
  await nextFrame(); await sleep(200); await nextFrame();

  fullH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, fullH);
  var layoutW = doc.documentElement.clientWidth || frameW;
  var maxCaptureH = Math.floor(16000 / 2);
  var captureH = Math.min(fullH, maxCaptureH);

  var blob = await modernScreenshot.domToBlob(doc.documentElement, {
    scale: 2,
    type: "image/png",
    width: layoutW,
    height: captureH,
    backgroundColor: resolveBg(doc, win),
    fetch: { requestInit: { cache: "force-cache" } },
  });

  document.body.removeChild(tempFrame);
  return blob;
}

// ── Deck: all slides as one long vertical PNG ──
async function screenshotDeckLongImage(cleaned) {
  var slideHeight = 576;
  var slideWidth = 1024;

  var screenshotHtml = stripInlineScripts(currentHtml);
  var headClose = screenshotHtml.indexOf('</head>');
  if (headClose > 0) {
    screenshotHtml = screenshotHtml.slice(0, headClose) + DECK_SCREENSHOT_FIX_CSS + screenshotHtml.slice(headClose);
  } else {
    screenshotHtml = DECK_SCREENSHOT_FIX_CSS + screenshotHtml;
  }

  var tempFrame = document.createElement("iframe");
  tempFrame.style.cssText = "position:fixed;left:-9999px;width:" + slideWidth + "px;border:none;visibility:hidden";
  document.body.appendChild(tempFrame);
  tempFrame.srcdoc = screenshotHtml;

  await new Promise(function(resolve) {
    tempFrame.onload = resolve;
    setTimeout(resolve, 10000);
  });
  await sleep(1000);

  var doc = tempFrame.contentDocument;
  var win = tempFrame.contentWindow;
  if (!doc || !win) {
    document.body.removeChild(tempFrame);
    throw new Error("无法访问预览内容");
  }

  await waitForReady(doc, win);
  if (modernScreenshot.waitUntilLoad) {
    try { await modernScreenshot.waitUntilLoad(doc.documentElement, { timeout: 8000 }); } catch {}
  }
  await sleep(500);

  // Measure total height from all slides
  var slides = doc.querySelectorAll('.slide');
  var totalH = 0;
  slides.forEach(function(s) {
    // Use scrollHeight for content-driven height, fallback to offsetHeight, then minimum
    var h = Math.max(s.scrollHeight, s.offsetHeight, slideHeight);
    totalH += h;
  });
  if (totalH === 0) totalH = slides.length * slideHeight;

  // Set iframe to full content height so everything renders
  tempFrame.style.height = totalH + "px";
  tempFrame.style.visibility = "visible";
  await nextFrame(); await sleep(300); await nextFrame();

  var layoutW = doc.documentElement.clientWidth || slideWidth;
  var blob = await modernScreenshot.domToBlob(doc.documentElement, {
    scale: 2,
    type: "image/png",
    width: layoutW,
    height: totalH,
    backgroundColor: resolveBg(doc, win),
    fetch: { requestInit: { cache: "force-cache" } },
  });

  document.body.removeChild(tempFrame);
  return blob;
}

// ─── Boot ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
