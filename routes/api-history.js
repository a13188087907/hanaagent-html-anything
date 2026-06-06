export default function registerHistoryRoutes(app, ctx) {
  const runtime = () => ctx._htmlAnything;

  app.get("/api/history", (c) => {
    const rt = runtime();
    if (!rt) return c.json({ items: [] });
    return c.json({ items: rt.historyStore.list() });
  });

  app.get("/api/history/:id", (c) => {
    const id = c.req.param("id");
    if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    const html = rt.historyStore.get(id);
    if (!html) return c.json({ error: "not found" }, 404);
    return c.json({ html, id });
  });

  app.delete("/api/history/:id", (c) => {
    const id = c.req.param("id");
    if (!/^\d+$/.test(id)) return c.json({ error: "invalid id" }, 400);
    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);
    rt.historyStore.remove(id);
    return c.json({ ok: true });
  });
}
