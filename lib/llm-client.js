/**
 * LLM SSE client — shared streaming logic for OpenAI-compatible APIs.
 * Eliminates duplicated fetch + SSE parse code across routes.
 */

/**
 * Stream an OpenAI-compatible chat completion via SSE.
 * Returns an async generator yielding each text delta.
 *
 * @param {{ baseUrl: string, modelName: string, apiKey: string, messages: Array, timeout?: number }} opts
 * @returns {AsyncGenerator<string>}
 */
export async function* streamChat({ baseUrl, modelName, apiKey, messages, timeout = 300000 }) {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelName, messages, stream: true }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
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
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) yield delta;
      } catch {}
    }
  }
}

/**
 * Create a Hono-compatible ReadableStream that proxies SSE deltas to the client.
 *
 * @param {{ baseUrl: string, modelName: string, apiKey: string, messages: Array, timeout?: number }} opts
 * @param {{ onDone?: (fullText: string) => void, onError?: (err: Error) => void }} hooks
 * @returns {ReadableStream}
 */
export function createSseProxy({ baseUrl, modelName, apiKey, messages, timeout }, { onDone, onError } = {}) {
  const encoder = new TextEncoder();
  let fullText = "";

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of streamChat({ baseUrl, modelName, apiKey, messages, timeout })) {
          fullText += delta;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta, total: fullText.length })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, size: fullText.length })}\n\n`));
        controller.close();
        onDone?.(fullText);
      } catch (err) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } catch {}
        controller.close();
        onError?.(err);
      }
    },
  });
}

/**
 * Non-streaming completion with continuation support.
 * Keeps calling the API until finish_reason is "stop" or max iterations hit.
 *
 * @param {{ baseUrl: string, modelName: string, apiKey: string, messages: Array, timeout?: number, maxContinuations?: number, maxSize?: number, continuationPrompt?: string }} opts
 * @returns {Promise<string>} The full completion text.
 */
export async function completeChat({
  baseUrl, modelName, apiKey, messages, timeout = 300000,
  maxContinuations = 5, maxSize = 2_000_000, continuationPrompt = "",
}) {
  let text = "";
  let continueCount = 0;
  const msgs = [...messages];

  while (continueCount <= maxContinuations) {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: modelName, messages: msgs }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LLM API error (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    const chunk = choice?.message?.content || "";
    text += chunk;

    if (text.length > maxSize) break;
    const fr = choice?.finish_reason;
    if (fr === "stop" || !fr) break;
    if (fr === "length" && continuationPrompt) {
      continueCount++;
      msgs.push(
        { role: "assistant", content: chunk },
        { role: "user", content: continuationPrompt },
      );
    } else break;
  }

  return text;
}
