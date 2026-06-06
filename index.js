import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ModelResolver } from "./lib/model-resolver.js";
import { HistoryStore } from "./lib/history-store.js";
import { TemplateStore } from "./lib/template-store.js";
import { HtmlGenerator } from "./lib/html-generator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(__dirname, "manifest.json"), "utf-8"));
const HANA_BUS_SKIP = Symbol.for("hana.event-bus.skip");

export default class HtmlAnythingPlugin {
  async onload() {
    try {
      const ctx = this.ctx;
      const { dataDir, log, pluginDir } = ctx;

      const hanakoHome = path.resolve(pluginDir, "..", "..");
      const modelResolver = new ModelResolver({ config: ctx.config, hanakoHome });
      const historyStore = new HistoryStore({ dataDir });
      const templateStore = new TemplateStore({ pluginDir });
      const generator = new HtmlGenerator({
        modelResolver, historyStore, templateStore, dataDir,
      });

      historyStore.init();

      this.ctx._htmlAnything = {
        modelResolver,
        historyStore,
        templateStore,
        generator,
      };

      this.register(() => {
        delete this.ctx._htmlAnything;
      });

      if (ctx.bus.handle) {
        this.register(
          ctx.bus.handle("html-anything:status", (payload) => {
            if (payload?.pluginId && payload.pluginId !== ctx.pluginId) return HANA_BUS_SKIP;
            return { ok: true, pluginId: ctx.pluginId, version: manifest.version };
          }, {
            capability: {
              title: "HTML Anything status",
              description: "Return plugin health and version info",
              inputSchema: { type: "object", properties: { pluginId: { type: "string" } } },
              outputSchema: { type: "object" },
              owner: "plugin:html-anything",
              stability: "experimental",
            },
          })
        );
      }

      log.info("HTML Anything plugin loaded");
    } catch (err) {
      this.ctx.log.error("HTML Anything plugin failed to load", err);
    }
  }

  async onunload() {
    this.ctx.log.info("HTML Anything plugin unloaded");
  }
}
