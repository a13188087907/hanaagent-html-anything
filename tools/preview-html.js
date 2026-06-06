import fs from "node:fs";
import path from "node:path";

export const name = "preview_html";
export const description = "将生成的 HTML 内容推送到 HTML Anything 插件的预览面板。当 Agent 完成 HTML 生成后调用此工具。";
export const parameters = {
  type: "object",
  properties: {
    html: {
      type: "string",
      description: "完整的 HTML 内容（自包含单文件）",
    },
  },
  required: ["html"],
};

export async function execute(input, toolCtx) {
  const { html } = input;
  if (!html) throw new Error("html content is required");

  const previewDir = path.join(toolCtx.dataDir, "previews");
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, "latest-anything.html"), html, "utf-8");

  return {
    content: [
      {
        type: "text",
        text: `HTML 已推送到预览面板（${(html.length / 1024).toFixed(1)} KB）。用户可以在 HTML Anything 插件页面中查看预览。`,
      },
    ],
    details: {
      card: {
        type: "iframe",
        route: "/api/preview-page",
        title: "HTML 预览",
        description: `HTML Anything 预览 (${(html.length / 1024).toFixed(1)} KB)`,
      },
    },
  };
}
