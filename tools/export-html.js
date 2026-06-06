import fs from "node:fs";
import path from "node:path";

export const name = "export_html";
export const description = "将 HTML Anything 预览面板中的 HTML 导出为可下载文件。";
export const parameters = {
  type: "object",
  properties: {
    filename: {
      type: "string",
      description: "导出文件名（可选，默认 html-anything-export.html）",
    },
  },
};

export async function execute(input, toolCtx) {
  const previewFile = path.join(toolCtx.dataDir, "previews", "latest-anything.html");

  if (!fs.existsSync(previewFile)) {
    return {
      content: [{ type: "text", text: "预览面板中没有可导出的 HTML 内容。请先生成内容。" }],
    };
  }

  const html = fs.readFileSync(previewFile, "utf-8");
  const rawFilename = input.filename || "html-anything-export.html";
  const filename = path.basename(rawFilename);

  const outputDir = path.join(toolCtx.dataDir, "exports");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, filename);
  fs.writeFileSync(outputPath, html, "utf-8");

  const staged = toolCtx.stageFile({
    sessionPath: toolCtx.sessionPath,
    filePath: outputPath,
    label: filename,
  });

  return {
    content: [{ type: "text", text: `HTML 已导出为 ${filename}` }],
    details: {
      media: {
        items: [staged.mediaItem],
      },
    },
  };
}
