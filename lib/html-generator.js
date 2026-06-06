import fs from "node:fs";
import path from "node:path";
import { buildPrompt } from "./prompt-builder.js";
import { buildPptPrompt } from "./ppt-prompt-builder.js";

const MAX_CONTINUATIONS = 5;
const MAX_HTML_SIZE = 2_000_000;
const TIMEOUT_MS = 900_000;

export class HtmlGenerator {
  constructor({ modelResolver, historyStore, templateStore, dataDir }) {
    this.modelResolver = modelResolver;
    this.historyStore = historyStore;
    this.templateStore = templateStore;
    this.previewDir = path.join(dataDir, "previews");
    fs.mkdirSync(this.previewDir, { recursive: true });
  }

  async generate({ templateId, content, format, editFromHtml, model: selectedModel, stream, mode, pptTheme }) {
    if (mode === "ppt") {
      return this.generatePpt({ templateId, content, format, editFromHtml, model: selectedModel, stream, pptTheme });
    }

    const tpl = this.templateStore.find(templateId);
    const tplName = tpl ? tpl.zhName : "自动";
    const skillBody = this.templateStore.getSkillBody(templateId);
    const exampleHtml = this.templateStore.getExampleHtml(templateId);

    const { systemPrompt, userPrompt } = buildPrompt({
      skillBody, exampleHtml, content, format, editFromHtml,
      templateCategory: tpl?.category || "",
    });

    const modelConfig = this.modelResolver.resolve(selectedModel);
    if (!modelConfig.apiKey) {
      throw new Error("No LLM API key found");
    }

    const baseUrl = modelConfig.baseUrl || "https://api.openai.com/v1";
    const modelName = modelConfig.model;

    return {
      systemPrompt,
      userPrompt,
      tplName,
      modelConfig: { baseUrl, modelName, apiKey: modelConfig.apiKey },
      templateId,
      content,
      selectedModel,
      stream,
    };
  }

  async generatePpt({ templateId, content, format, editFromHtml, model: selectedModel, stream, pptTheme }) {
    const tpl = this.templateStore.findPpt(templateId);
    const tplName = tpl ? tpl.zhName : "PPT";

    const { systemPrompt, userPrompt } = buildPptPrompt({
      deckType: tpl?.sourceDeck || null,
      themeId: pptTheme || tpl?.defaultTheme || null,
      layouts: tpl?.recommendedLayouts || [],
      content, format, editFromHtml,
    });

    const modelConfig = this.modelResolver.resolve(selectedModel);
    if (!modelConfig.apiKey) {
      throw new Error("No LLM API key found");
    }

    const baseUrl = modelConfig.baseUrl || "https://api.openai.com/v1";
    const modelName = modelConfig.model;

    return {
      systemPrompt,
      userPrompt,
      tplName,
      modelConfig: { baseUrl, modelName, apiKey: modelConfig.apiKey },
      templateId,
      content,
      selectedModel,
      stream,
    };
  }

  postProcess(html) {
    html = html.trim();
    html = html.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    const s1 = html.search(/<![\s]*DOCTYPE\s+html/i);
    const s2 = html.search(/<html[\s>]/i);
    const si = s1 >= 0 ? s1 : (s2 >= 0 ? s2 : -1);
    if (si > 0) html = html.slice(si);

    const le = html.lastIndexOf("</html>");
    if (le >= 0) html = html.slice(0, le + "</html>".length);
    if (html && !html.trimEnd().endsWith("</html>")) html = html.trimEnd() + "\n</body>\n</html>";

    return html;
  }

  savePreview(html, mode) {
    const name = mode === "ppt" ? "latest-ppt.html" : "latest-anything.html";
    fs.writeFileSync(path.join(this.previewDir, name), html, "utf-8");
  }

  saveHistory(html, { templateId, tplName, content, selectedModel, mode }) {
    this.historyStore.save(html, {
      templateId,
      templateName: tplName,
      model: selectedModel,
      mode: mode || "anything",
      contentPreview: content,
    });
  }

  buildMessages(systemPrompt, userPrompt) {
    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
  }

  get continuationPrompt() {
    return "你的输出被截断了。请从你停止的地方继续输出 HTML，不要重复已经输出的内容，不要加任何解释。";
  }

  get maxContinuations() { return MAX_CONTINUATIONS; }
  get maxHtmlSize() { return MAX_HTML_SIZE; }
  get timeout() { return TIMEOUT_MS; }
}
