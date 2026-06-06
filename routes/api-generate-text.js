import { createSseProxy } from "../lib/llm-client.js";

const SYSTEM_PROMPT = `你是一个专业的内容撰写助手。根据用户的描述生成高质量的中文内容。
规则：
1. 直接输出内容，不要加任何解释、前言、标题标记（如"以下是..."）
2. 使用 Markdown 格式
3. 内容要真实、具体、有细节，不要空话套话
4. 如果用户指定了格式（如表格、列表），严格遵循`;

export default function registerGenerateTextRoutes(app, ctx) {
  const runtime = () => ctx._htmlAnything;

  app.post("/api/generate-text", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt;
    if (!prompt) return c.json({ error: "prompt is required" }, 400);

    const rt = runtime();
    if (!rt) return c.json({ error: "not initialized" }, 503);

    const modelConfig = rt.modelResolver.resolve(body.model);
    if (!modelConfig.apiKey) return c.json({ error: "No API key" }, 400);

    const baseUrl = modelConfig.baseUrl || "https://api.openai.com/v1";
    const modelName = modelConfig.model;

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const rs = createSseProxy(
      { baseUrl, modelName, apiKey: modelConfig.apiKey, messages, timeout: 300000 },
      { onError(err) { ctx.log.error("generate-text failed", err); } },
    );

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");
    return c.body(rs);
  });
}
