import fs from "node:fs";
import path from "node:path";

export class ModelResolver {
  constructor({ config, hanakoHome }) {
    this.config = config;
    this.yamlPath = path.join(hanakoHome, "added-models.yaml");
  }

  listModels() {
    // 优先从插件配置读取
    const modelName = this.config.get("modelName") || "";
    const apiKey = this.config.get("apiKey") || "";
    const baseUrl = this.config.get("baseUrl") || "";

    if (modelName && apiKey) {
      return {
        models: [{ id: modelName, provider: "custom", baseUrl, hasKey: true }],
        defaultModel: modelName,
      };
    }

    // 回退到 Hana 全局模型配置
    return this._listFromYaml();
  }

  resolve(targetModel) {
    // 优先从插件配置读取
    const cfgKey = this.config.get("apiKey");
    if (cfgKey) {
      const baseUrl = this.config.get("baseUrl") || "https://api.openai.com/v1";
      const modelName = targetModel || this.config.get("modelName") || "gpt-4o";
      return { apiKey: cfgKey, baseUrl, model: modelName };
    }

    // 回退到 Hana 全局模型配置
    return this._resolveFromYaml(targetModel);
  }

  // ─── Hana 全局配置回退 ───────────────────────────────────────────

  _readYaml() {
    try {
      return fs.readFileSync(this.yamlPath, "utf-8");
    } catch {
      return null;
    }
  }

  _parseProviders(content) {
    const configs = {};
    let curProvider = null;

    for (const line of content.split("\n")) {
      const provMatch = line.match(/^\s{2}(\w+):\s*$/);
      if (provMatch) {
        curProvider = provMatch[1];
        configs[curProvider] = { apiKey: null, baseUrl: null, models: [] };
        continue;
      }
      if (!curProvider || !configs[curProvider]) continue;

      const baseM = line.match(/^\s{4}base_url:\s*(.+)$/);
      if (baseM) { configs[curProvider].baseUrl = baseM[1].trim(); continue; }

      const keyM = line.match(/^\s{4}api_key:\s*(.+)$/);
      if (keyM) { configs[curProvider].apiKey = keyM[1].trim(); continue; }

      const modelStr = line.match(/^\s{6}-\s+([a-zA-Z0-9_.-]+)\s*$/);
      if (modelStr) { configs[curProvider].models.push(modelStr[1]); }
    }

    return configs;
  }

  _listFromYaml() {
    const content = this._readYaml();
    if (!content) return { models: [], defaultModel: null };

    const models = [];
    const providerConfigs = this._parseProviders(content);

    for (const [prov, cfg] of Object.entries(providerConfigs)) {
      for (const id of cfg.models) {
        models.push({ id, provider: prov, baseUrl: cfg.baseUrl, hasKey: !!cfg.apiKey });
      }
    }

    const defaultMatch = content.match(/default_model:\s*"?([^"\s\n]+)"?/);
    return { models, defaultModel: defaultMatch ? defaultMatch[1] : null };
  }

  _resolveFromYaml(targetModel) {
    const content = this._readYaml();
    if (!content) return { apiKey: null, baseUrl: null, model: null };

    const providerConfigs = this._parseProviders(content);

    for (const [, cfg] of Object.entries(providerConfigs)) {
      if (cfg.models.includes(targetModel)) {
        return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: targetModel };
      }
    }

    for (const [, cfg] of Object.entries(providerConfigs)) {
      if (cfg.apiKey && cfg.models.length) {
        return { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.models[0] };
      }
    }

    return { apiKey: null, baseUrl: null, model: null };
  }
}
