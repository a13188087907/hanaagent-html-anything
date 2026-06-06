import fs from "node:fs";
import path from "node:path";

const MAX_ITEMS = 50;

export class HistoryStore {
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, "history");
    this.metaPath = path.join(this.dir, "history.json");
  }

  init() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  list() {
    try {
      return JSON.parse(fs.readFileSync(this.metaPath, "utf-8"));
    } catch {
      return [];
    }
  }

  get(id) {
    if (!/^\d+$/.test(id)) return null;
    const filePath = path.join(this.dir, `${id}.html`);
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  save(html, { templateId, templateName, model, contentPreview, mode }) {
    const ts = Date.now();
    fs.writeFileSync(path.join(this.dir, `${ts}.html`), html, "utf-8");

    let list = this.list();
    list.unshift({
      id: `${ts}`,
      ts,
      templateId: templateId || null,
      templateName: templateName || null,
      model: model || null,
      mode: mode || "anything",
      contentPreview: (contentPreview || "").slice(0, 120).replace(/\n/g, " "),
      size: html.length,
    });

    if (list.length > MAX_ITEMS) {
      const removed = list.splice(MAX_ITEMS);
      for (const r of removed) {
        try { fs.unlinkSync(path.join(this.dir, `${r.id}.html`)); } catch {}
      }
    }

    fs.writeFileSync(this.metaPath, JSON.stringify(list, null, 2), "utf-8");
    return `${ts}`;
  }

  remove(id) {
    if (!/^\d+$/.test(id)) return false;
    try { fs.unlinkSync(path.join(this.dir, `${id}.html`)); } catch {}
    const list = this.list().filter(item => item.id !== id);
    try { fs.writeFileSync(this.metaPath, JSON.stringify(list, null, 2), "utf-8"); } catch {}
    return true;
  }
}
