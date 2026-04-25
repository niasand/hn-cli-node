# hn-cli-node

A Node.js rewrite of [`heartleo/hn-cli`](https://github.com/heartleo/hn-cli).

This version keeps the same core workflow: browse Hacker News categories, open
comment threads, fold comments, open stories in a browser, set themes, and use
an OpenAI-compatible chat completions API for translation.

## Usage

```bash
npm link
hn
hn new
hn best
hn ask
hn show
hn theme nord
hn version
```

You can also run it without linking:

```bash
node ./bin/hn.js
```

## Keys

| Key | Action |
| --- | --- |
| `Enter` | Open comments |
| `j/k`, `↑/↓` | Move selection |
| `o` | Open story in browser |
| `t` / `T` | Translate selected title / visible titles |
| `←` / `→` | Switch category |
| `r` / `R` | Refresh stories / comments |
| `Space` | Fold selected comment |
| `C` / `E` | Fold / unfold all comments |
| `Esc` | Back to story list |
| `?` | Toggle help |
| `q`, `Ctrl+C` | Quit |

## Configuration

The CLI reads `~/.config/hn/config.json` and a local `.env` file. Environment
variables take precedence.

```bash
HN_TRANSLATE_API_URL=https://api.openai.com/v1
HN_TRANSLATE_API_KEY=sk-...
HN_TRANSLATE_MODEL=gpt-4o-mini
HN_TRANSLATE_LANG=Chinese
HN_THEME=hn
HN_MAX_CONCURRENT=64
```

Available themes: `hn`, `mocha`, `dracula`, `tokyo`, `nord`, `gruvbox`.
