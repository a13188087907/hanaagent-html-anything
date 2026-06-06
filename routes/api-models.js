export default function registerModelRoutes(app, ctx) {
  const runtime = () => ctx._htmlAnything;

  app.get("/api/models", (c) => {
    const rt = runtime();
    if (!rt) return c.json({ models: [], defaultModel: null });
    return c.json(rt.modelResolver.listModels());
  });
}
