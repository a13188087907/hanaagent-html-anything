import fs from "node:fs";
import path from "node:path";

export class TemplateStore {
  constructor({ pluginDir }) {
    this.templatesPath = path.join(pluginDir, "assets", "templates.json");
    this.pptTemplatesPath = path.join(pluginDir, "assets", "templates-ppt.json");
    this.examplesDir = path.join(pluginDir, "assets", "examples");
    this.skillsDir = path.join(pluginDir, "assets", "skills");
    this._cache = null;
    this._pptCache = null;
    this._skillCache = {};
  }

  list() {
    if (this._cache) return this._cache;
    try {
      const raw = fs.readFileSync(this.templatesPath, "utf-8");
      this._cache = JSON.parse(raw);
      return this._cache;
    } catch {
      return [];
    }
  }

  find(id) {
    return this.list().find(t => t.id === id) || null;
  }

  getSkillBody(templateId) {
    if (!templateId || !/^[a-z0-9][a-z0-9_-]*$/i.test(templateId)) return "";
    if (this._skillCache[templateId] !== undefined) return this._skillCache[templateId];
    try {
      const body = fs.readFileSync(path.join(this.skillsDir, `${templateId}.md`), "utf-8");
      this._skillCache[templateId] = body;
      return body;
    } catch {
      this._skillCache[templateId] = "";
      return "";
    }
  }

  getExampleHtml(templateId) {
    if (!templateId || !/^[a-z0-9][a-z0-9_-]*$/i.test(templateId)) return "";
    try {
      return fs.readFileSync(path.join(this.examplesDir, `${templateId}.html`), "utf-8");
    } catch {
      return "";
    }
  }

  invalidateCache() {
    this._cache = null;
    this._pptCache = null;
  }

  // ─── PPT mode ───────────────────────────────────────────────────────

  listPpt() {
    if (this._pptCache) return this._pptCache;
    try {
      const raw = fs.readFileSync(this.pptTemplatesPath, "utf-8");
      this._pptCache = JSON.parse(raw);
      return this._pptCache;
    } catch {
      this._pptCache = [];
      return this._pptCache;
    }
  }

  findPpt(id) {
    return this.listPpt().find(t => t.id === id) || null;
  }

  getPptExampleHtml(templateId) {
    // PPT templates stored as ppt-<sourceDeck>.html
    try {
      return fs.readFileSync(path.join(this.examplesDir, `${templateId}.html`), "utf-8");
    } catch {
      return "";
    }
  }
}
