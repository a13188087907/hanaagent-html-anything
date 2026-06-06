import fs from "node:fs";
import path from "node:path";

export default function registerExportRoutes(app, ctx) {
  const runtime = () => ctx._htmlAnything;

  app.get("/api/export", (c) => {
    const rt = runtime();
    if (!rt) return c.text("Not initialized", 503);
    const mode = c.req.query("mode") || "anything";
    const name = mode === "ppt" ? "latest-ppt.html" : "latest-anything.html";
    const file = path.join(ctx.dataDir, "previews", name);
    if (!fs.existsSync(file)) return c.text("No preview to export", 404);
    const html = fs.readFileSync(file, "utf-8");
    const filename = `html-anything-${Date.now()}.html`;
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Cache-Control", "no-cache");
    return c.body(html);
  });

  app.post("/api/save-screenshot", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { dataUrl, filename } = body;
      if (!dataUrl) return c.json({ error: "missing dataUrl" }, 400);
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const buf = Buffer.from(base64, "base64");
      const outDir = path.join(ctx.dataDir, "exports");
      fs.mkdirSync(outDir, { recursive: true });
      const fname = path.basename(filename || ("screenshot-" + Date.now() + ".png"));
      fs.writeFileSync(path.join(outDir, fname), buf);
      return c.json({ ok: true, filename: fname });
    } catch (err) {
      ctx.log.error("save-screenshot failed", err);
      return c.json({ error: "保存截图失败" }, 500);
    }
  });

  app.get("/api/screenshot/:name", (c) => {
    const name = c.req.param("name");
    if (!/^[a-z0-9_.-]+$/i.test(name)) return c.text("invalid name", 400);
    const filePath = path.join(ctx.dataDir, "exports", name);
    if (!fs.existsSync(filePath)) return c.text("not found", 404);
    c.header("Content-Type", "image/png");
    c.header("Cache-Control", "public, max-age=3600");
    c.header("Content-Disposition", 'attachment; filename="' + name + '"');
    return c.body(fs.readFileSync(filePath));
  });

  app.post("/api/save-temp-html", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      if (!body.html) return c.json({ error: "missing html" }, 400);
      const outDir = path.join(ctx.dataDir, "exports");
      fs.mkdirSync(outDir, { recursive: true });
      const safeName = path.basename("temp-screenshot.html");
      fs.writeFileSync(path.join(outDir, safeName), body.html, "utf-8");
      return c.json({ ok: true });
    } catch (err) {
      ctx.log.error("save-temp-html failed", err);
      return c.json({ error: "保存临时文件失败" }, 500);
    }
  });

  app.get("/api/temp-html-page", (c) => {
    const file = path.join(ctx.dataDir, "exports", "temp-screenshot.html");
    if (!fs.existsSync(file)) return c.text("not found", 404);
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return c.body(fs.readFileSync(file));
  });
}
