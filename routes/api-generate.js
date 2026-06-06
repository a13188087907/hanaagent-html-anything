import { createSseProxy, completeChat } from "../lib/llm-client.js";

export default function registerGenerateRoutes(app, ctx) {
  const runtime = () => ctx._htmlAnything;
  const gen = () => runtime().generator;

  app.post("/api/generate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.content) return c.json({ error: "content is required" }, 400);

    const accept = c.req.header("Accept") || "";
    if (accept.includes("text/event-stream")) return handleStream(c, body);
    return handleSync(c, body);
  });

  async function handleSync(c, body) {
    const { templateId, content, format, editFromHtml, model: selectedModel, mode, stream, pptTheme } = body;
    const g = gen();

    try {
      const params = await g.generate({ templateId, content, format, editFromHtml, model: selectedModel, stream, mode: mode || "anything", pptTheme });
      const { systemPrompt, userPrompt, tplName, modelConfig, templateId: tplId, content: ctn, selectedModel: sm } = params;
      const { baseUrl, modelName, apiKey } = modelConfig;

      const messages = g.buildMessages(systemPrompt, userPrompt);
      const html = await completeChat({
        baseUrl, modelName, apiKey, messages,
        timeout: g.timeout,
        maxContinuations: g.maxContinuations,
        maxSize: g.maxHtmlSize,
        continuationPrompt: g.continuationPrompt,
      });

      const finalHtml = g.postProcess(html);
      g.savePreview(finalHtml, mode || "anything");
      g.saveHistory(finalHtml, { templateId: tplId, tplName, content: ctn, selectedModel: sm, mode: mode || "anything" });
      return c.json({ ok: true, size: finalHtml.length });
    } catch (err) {
      ctx.log.error("generate failed", err);
      return c.json({ error: `生成失败: ${err.message}` }, 500);
    }
  }

  async function handleStream(c, body) {
    const { templateId, content, format, editFromHtml, model: selectedModel, mode, stream, pptTheme } = body;
    const g = gen();

    let params;
    try {
      params = await g.generate({ templateId, content, format, editFromHtml, model: selectedModel, stream, mode: mode || "anything", pptTheme });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }

    const { systemPrompt, userPrompt, tplName, modelConfig, templateId: tplId, content: ctn, selectedModel: sm } = params;
    const { baseUrl, modelName, apiKey } = modelConfig;
    const messages = g.buildMessages(systemPrompt, userPrompt);

    const rs = createSseProxy(
      { baseUrl, modelName, apiKey, messages, timeout: g.timeout },
      {
        onDone(fullText) {
          const finalHtml = g.postProcess(fullText);
          g.savePreview(finalHtml, mode || "anything");
          g.saveHistory(finalHtml, { templateId: tplId, tplName, content: ctn, selectedModel: sm, mode: mode || "anything" });
        },
        onError(err) {
          ctx.log.error("stream generate failed", err);
        },
      },
    );

    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");
    return c.body(rs);
  }
}
