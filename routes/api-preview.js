import fs from "node:fs";
import path from "node:path";

export default function registerPreviewRoutes(app, ctx) {
  const runtime = () => ctx._htmlAnything;

  app.get("/api/preview", (c) => {
    const rt = runtime();
    if (!rt) return c.json({ html: null });

    const tplId = c.req.query("templateId");
    if (tplId && /^[a-z0-9][a-z0-9-]*$/i.test(tplId)) {
      const html = rt.templateStore.getExampleHtml(tplId);
      return c.json({ html: html || null });
    }

    const mode = c.req.query("mode") || "anything";
    const name = mode === "ppt" ? "latest-ppt.html" : "latest-anything.html";
    const file = path.join(ctx.dataDir, "previews", name);
    if (!fs.existsSync(file)) return c.json({ html: null });
    return c.json({ html: fs.readFileSync(file, "utf-8") });
  });

  app.get("/api/example-page", (c) => {
    const tplId = c.req.query("templateId");
    if (!tplId || !/^[a-z0-9][a-z0-9-]*$/i.test(tplId)) return c.text("missing/invalid templateId", 400);
    const rt = runtime();
    if (!rt) return c.text("not initialized", 503);
    const html = rt.templateStore.getExampleHtml(tplId);
    if (!html) return c.text("not found", 404);
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(html);
  });

  app.get("/api/preview-page", (c) => {
    const mode = c.req.query("mode") || "anything";
    const name = mode === "ppt" ? "latest-ppt.html" : "latest-anything.html";
    const file = path.join(ctx.dataDir, "previews", name);
    if (!fs.existsSync(file)) return c.text("not found", 404);
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return c.body(fs.readFileSync(file));
  });
}
