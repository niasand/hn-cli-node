import { bold } from "./ansi.js";
import { loadConfig, loadDotEnv } from "./config.js";
import { categories } from "./hn.js";
import { App } from "./tui.js";
import { resolveTheme, setTheme, themeNames } from "./theme.js";

const VERSION = "0.1.0";

export async function main(args) {
  loadDotEnv();
  const [command, maybeName] = args;

  if (command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return;
  }
  if (command === "-v" || command === "--version" || command === "version") {
    console.log(`hn version ${VERSION}`);
    return;
  }
  if (command === "theme") {
    if (!maybeName) {
      console.log(`Current theme: ${bold(loadConfig().theme || resolveTheme())}`);
      console.log(`Available: ${themeNames().join(", ")}`);
      return;
    }
    const saved = setTheme(maybeName.toLowerCase());
    console.log(`✓ Theme set to ${bold(maybeName.toLowerCase())}`);
    console.log(`ℹ Saved to: ${saved}`);
    return;
  }

  const category = command || "top";
  if (!categories.includes(category)) {
    throw new Error(`unknown command "${category}". Try "hn --help".`);
  }
  const app = new App(category, resolveTheme());
  await app.run();
}

function printHelp() {
  console.log(`A terminal client for Hacker News.

Usage:
  hn [top|new|best|ask|show]
  hn theme [name]
  hn version

Keys:
  Enter       open comments
  j/k, ↑/↓    move
  o           open story in browser
  t / T       translate selected title / visible titles
  ← / →       switch tabs
  r / R       refresh
  Space       fold comment
  C / E       fold / unfold all comments
  Esc         back to story list
  ?           toggle help
  q, Ctrl+C   quit

Configuration:
  ~/.config/hn/config.json and .env are supported.
  HN_TRANSLATE_PROVIDER, HN_TRANSLATE_API_URL, HN_TRANSLATE_API_KEY, HN_TRANSLATE_MODEL, HN_TRANSLATE_LANG
`);
}
