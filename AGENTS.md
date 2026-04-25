# Repository Guidelines

## Project Structure & Module Organization

This is a small Node.js ESM CLI for browsing Hacker News in the terminal.

- `bin/hn.js` is the executable entry point used by the `hn` bin.
- `src/cli.js` parses commands and starts the app.
- `src/tui.js` contains terminal UI state, key handling, and rendering.
- `src/hn.js` wraps the Hacker News Firebase API.
- `src/config.js`, `src/theme.js`, `src/translate.js`, `src/browser.js`, and `src/ansi.js` provide helpers.
- There is currently no `test/` directory and no bundled assets.

Keep new modules under `src/` with narrow responsibilities. Avoid runtime dependencies unless they clearly simplify the CLI.

## Build, Test, and Development Commands

- `npm start` runs the CLI through `node ./bin/hn.js`.
- `node ./bin/hn.js [top|new|best|ask|show]` runs a category without linking.
- `npm link` installs the local `hn` command globally for manual testing.
- `npm run check` runs `node --check` over the entry point and all source files.

There is no build step; source files run directly on Node `>=18`.

## Coding Style & Naming Conventions

Use JavaScript ESM with explicit `.js` imports. Follow the existing style:

- Two-space indentation.
- Double quotes for strings.
- Semicolons at statement ends.
- `camelCase` for variables, functions, and methods.
- `PascalCase` for classes such as `App`, `HNClient`, and `Translator`.
- Keep rendering helpers deterministic where possible.

No formatter or linter is configured. Match surrounding style.

## Testing Guidelines

No test framework is configured yet. At minimum, run:

```bash
npm run check
```

For TUI changes, also test manually in a real terminal with:

```bash
node ./bin/hn.js
```

Exercise navigation, category switching, comments, refresh, folding, links, and translation errors when relevant.

## Commit & Pull Request Guidelines

The history uses short commit messages, but there is no formal convention. Prefer concise imperative messages:

- `fix list viewport sizing`
- `add translation config docs`
- `handle empty comment threads`

Pull requests should include a short description, user-visible behavior changes, and verification steps such as `npm run check` plus manual terminal testing. Link related issues when available. Screenshots are useful for visual TUI changes.

## Security & Configuration Tips

Do not commit `.env` files or API keys. Translation settings come from environment variables or `~/.config/hn/config.json`; environment variables take precedence. Document new configuration keys in `README.md`.
