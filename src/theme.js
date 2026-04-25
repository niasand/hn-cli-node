import { color } from "./ansi.js";
import { loadConfig, saveConfig, CONFIG_PATH } from "./config.js";

export const themes = {
  hn: { accent: 208, link: 208, title: 255, success: 114, error: 204, warning: 223, info: 109, muted: 243, surface: 236, score: 208, comment: 243 },
  mocha: { accent: 183, link: 111, title: 189, success: 114, error: 204, warning: 223, info: 109, muted: 243, surface: 238, score: 208, comment: 109 },
  dracula: { accent: 141, link: 117, title: 231, success: 84, error: 210, warning: 228, info: 117, muted: 61, surface: 236, score: 208, comment: 117 },
  tokyo: { accent: 75, link: 117, title: 189, success: 108, error: 203, warning: 223, info: 73, muted: 59, surface: 236, score: 208, comment: 73 },
  nord: { accent: 110, link: 110, title: 253, success: 108, error: 174, warning: 222, info: 73, muted: 60, surface: 236, score: 208, comment: 73 },
  gruvbox: { accent: 208, link: 109, title: 223, success: 142, error: 167, warning: 214, info: 108, muted: 245, surface: 237, score: 208, comment: 108 },
};

export function themeNames() {
  return Object.keys(themes).sort();
}

export function resolveTheme() {
  const configured = process.env.HN_THEME || loadConfig().theme || "hn";
  return themes[configured] ? configured : "hn";
}

export function setTheme(name) {
  if (!themes[name]) {
    throw new Error(`unknown theme "${name}", available: ${themeNames().join(", ")}`);
  }
  const config = loadConfig();
  config.theme = name;
  saveConfig(config);
  return CONFIG_PATH;
}

export function paint(themeName) {
  const t = themes[themeName] || themes.hn;
  return {
    accent: (text) => color(t.accent, text),
    link: (text) => color(t.link, text),
    title: (text) => color(t.title, text),
    success: (text) => color(t.success, text),
    error: (text) => color(t.error, text),
    warning: (text) => color(t.warning, text),
    info: (text) => color(t.info, text),
    muted: (text) => color(t.muted, text),
    score: (text) => color(t.score, text),
    comment: (text) => color(t.comment, text),
    surface: t.surface,
  };
}
