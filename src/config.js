import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = path.join(os.homedir(), ".config", "hn");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function loadDotEnv(cwd = process.cwd()) {
  const file = path.join(cwd, ".env");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

export function loadTranslateConfig() {
  const config = loadConfig();
  const translate = { ...(config.translate || {}) };
  const provider = process.env.HN_TRANSLATE_PROVIDER || translate.provider || "openai";
  const defaultApiUrl = provider.toLowerCase() === "deepl" ? "https://api.deepl.com/v2" : "https://api.openai.com/v1";
  return {
    provider,
    apiUrl: process.env.HN_TRANSLATE_API_URL || translate.api_url || defaultApiUrl,
    apiKey: process.env.HN_TRANSLATE_API_KEY || translate.api_key || "",
    model: process.env.HN_TRANSLATE_MODEL || translate.model || "gpt-4o-mini",
    language: process.env.HN_TRANSLATE_LANG || translate.language || "Chinese",
  };
}
