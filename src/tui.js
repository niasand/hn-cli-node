import readline from "node:readline";
import { bg, clearScreen, htmlToText, moveHome, padRight, showCursor, truncate, visibleWidth, wrap } from "./ansi.js";
import { openUrl } from "./browser.js";
import { categories, categoryLabels, HNClient, relativeTime, storyDomain } from "./hn.js";
import { paint } from "./theme.js";
import { Translator } from "./translate.js";

const INITIAL_LOAD = 20;
const PAGE_SIZE = 20;
const PREFETCH_COMMENTS = 4;

export class App {
  constructor(category, themeName) {
    this.client = new HNClient();
    this.translator = new Translator();
    this.theme = paint(themeName);
    this.category = category;
    this.ids = {};
    this.stories = {};
    this.selected = 0;
    this.offset = 0;
    this.mode = "list";
    this.status = "Loading stories...";
    this.help = false;
    this.detail = null;
    this.comments = [];
    this.flatComments = [];
    this.commentCursor = 0;
    this.commentOffset = 0;
    this.collapsed = new Set();
    this.translations = new Map();
    this.commentTranslations = new Map();
    this.prefetchingComments = new Set();
  }

  async run() {
    this.bindTerminal();
    await this.loadStories(this.category);
    this.render();
  }

  bindTerminal() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdout.write(clearScreen());
    process.stdin.on("keypress", (_str, key) => this.onKey(key));
    process.on("SIGINT", () => this.exit());
    process.on("exit", () => process.stdout.write(showCursor()));
  }

  async loadStories(category, fresh = false) {
    this.status = `Loading ${categoryLabels[category]}...`;
    this.render();
    if (fresh || !this.ids[category]) this.ids[category] = await this.client.storyIds(category);
    const loaded = this.stories[category]?.length || 0;
    const take = Math.max(INITIAL_LOAD, loaded || 0);
    const items = await this.client.items(this.ids[category].slice(0, take), { fresh });
    this.stories[category] = items.map((item, index) => ({ ...item, rank: index + 1, domain: storyDomain(item.url) }));
    this.status = `${this.stories[category].length}/${this.ids[category].length} stories`;
    this.prefetchCommentThreads();
  }

  async loadMoreStories() {
    const ids = this.ids[this.category] || [];
    const stories = this.stories[this.category] || [];
    if (stories.length >= ids.length) return;
    this.status = "Loading more stories...";
    this.render();
    const start = stories.length;
    const items = await this.client.items(ids.slice(start, start + PAGE_SIZE));
    this.stories[this.category] = stories.concat(items.map((item, index) => ({ ...item, rank: start + index + 1, domain: storyDomain(item.url) })));
    this.status = `${this.stories[this.category].length}/${ids.length} stories`;
    this.prefetchCommentThreads();
    this.render();
  }

  async switchCategory(delta) {
    const next = (categories.indexOf(this.category) + delta + categories.length) % categories.length;
    this.category = categories[next];
    this.selected = 0;
    this.offset = 0;
    this.mode = "list";
    if (!this.stories[this.category]) await this.loadStories(this.category);
    this.prefetchCommentThreads();
    this.render();
  }

  currentStory() {
    return (this.stories[this.category] || [])[this.selected];
  }

  async openComments() {
    const story = this.currentStory();
    if (!story) return;
    this.detail = story;
    this.mode = "detail";
    this.status = "Loading comments...";
    this.comments = [];
    this.flatComments = [];
    this.commentCursor = 0;
    this.commentOffset = 0;
    this.render();
    if (!story.kids?.length) {
      this.status = "No comments yet";
      this.render();
      return;
    }
    this.comments = await this.client.comments(story, 0);
    this.rebuildFlatComments();
    this.status = `${story.descendants || this.flatComments.length || 0} comments`;
    this.render();
  }

  rebuildFlatComments() {
    const flat = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        flat.push(node);
        if (!this.collapsed.has(node.item.id)) walk(node.children);
      }
    };
    walk(this.comments);
    this.flatComments = flat;
    if (this.commentCursor >= flat.length) this.commentCursor = Math.max(0, flat.length - 1);
  }

  async refresh() {
    if (this.mode === "list") {
      await this.loadStories(this.category, true);
    } else if (this.detail) {
      this.client.cache.delete(this.detail.id);
      const fresh = await this.client.item(this.detail.id, { fresh: true });
      this.detail = fresh;
      this.comments = await this.client.comments(fresh, 0, 250, { fresh: true });
      this.rebuildFlatComments();
      this.status = "Comments refreshed";
    }
    this.render();
  }

  async translateCurrent(batch = false) {
    try {
      if (this.mode === "list") {
        if (batch) {
          const visible = this.visibleStories();
          const titles = Object.fromEntries(visible.map((story) => [story.id, story.title]));
          const translated = await this.translator.translateBatch(titles);
          for (const [id, value] of Object.entries(translated)) this.translations.set(Number(id), value);
          this.status = "Visible titles translated";
        } else {
          const story = this.currentStory();
          if (!story) return;
          if (this.translations.has(story.id)) {
            this.translations.delete(story.id);
            this.status = "Translation hidden";
          } else {
            this.status = "Translating title...";
            this.render();
            this.translations.set(story.id, await this.translator.translate(story.title));
            this.status = "Title translated";
          }
        }
      } else {
        const node = this.flatComments[this.commentCursor];
        if (!node) return;
        if (this.commentTranslations.has(node.item.id)) {
          this.commentTranslations.delete(node.item.id);
          this.status = "Translation hidden";
        } else {
          this.status = "Translating comment...";
          this.render();
          this.commentTranslations.set(node.item.id, await this.translator.translate(htmlToText(node.item.text), true));
          this.status = "Comment translated";
        }
      }
    } catch (error) {
      this.status = error.message;
    }
    this.render();
  }

  onKey(key) {
    const name = key?.name;
    const seq = key?.sequence;
    Promise.resolve().then(async () => {
      if ((key?.ctrl && name === "c") || seq === "q" || seq === "Q") return this.exit();
      if (seq === "?") {
        this.help = !this.help;
        return this.render();
      }
      if (this.mode === "list") await this.onListKey(name, seq);
      else await this.onDetailKey(name, seq);
    }).catch((error) => {
      this.status = error.message;
      this.render();
    });
  }

  async onListKey(name, seq) {
    const stories = this.stories[this.category] || [];
    if (name === "down" || seq === "j") this.selected = Math.min(stories.length - 1, this.selected + 1);
    else if (name === "up" || seq === "k") this.selected = Math.max(0, this.selected - 1);
    else if (name === "right") return this.switchCategory(1);
    else if (name === "left") return this.switchCategory(-1);
    else if (name === "return") return this.openComments();
    else if (seq === "o") openUrl(this.currentStory()?.url || `https://news.ycombinator.com/item?id=${this.currentStory()?.id}`);
    else if (seq === "r") return this.refresh();
    else if (seq === "t") return this.translateCurrent(false);
    else if (seq === "T") return this.translateCurrent(true);
    if (this.selected >= stories.length - 5) await this.loadMoreStories();
    this.prefetchCommentThreads();
    this.render();
  }

  async onDetailKey(name, seq) {
    if (name === "escape") {
      this.mode = "list";
      this.prefetchCommentThreads();
      return this.render();
    }
    if (name === "down" || seq === "j") this.commentCursor = Math.min(this.flatComments.length - 1, this.commentCursor + 1);
    else if (name === "up" || seq === "k") this.commentCursor = Math.max(0, this.commentCursor - 1);
    else if (seq === "g") this.commentCursor = 0;
    else if (seq === "r" || seq === "R") return this.refresh();
    else if (seq === "o") openUrl(this.detail?.url || `https://news.ycombinator.com/item?id=${this.detail?.id}`);
    else if (seq === "t") return this.translateCurrent(false);
    else if (seq === "C") {
      this.flatComments.forEach((node) => this.collapsed.add(node.item.id));
      this.rebuildFlatComments();
    } else if (seq === "E") {
      this.collapsed.clear();
      this.rebuildFlatComments();
    } else if (name === "space" || name === "return") {
      const node = this.flatComments[this.commentCursor];
      if (node) {
        if (this.collapsed.has(node.item.id)) this.collapsed.delete(node.item.id);
        else this.collapsed.add(node.item.id);
        this.rebuildFlatComments();
      }
    }
    this.render();
  }

  terminalSize() {
    return { width: process.stdout.columns || 100, height: process.stdout.rows || 30 };
  }

  visibleStoryCount() {
    const { height } = this.terminalSize();
    return Math.max(1, Math.floor((height - 3) / 2));
  }

  visibleStories() {
    return (this.stories[this.category] || []).slice(this.offset, this.offset + this.visibleStoryCount());
  }

  prefetchCommentThreads() {
    if (this.mode !== "list") return;
    const stories = this.stories[this.category] || [];
    const candidates = stories.slice(this.selected, this.selected + PREFETCH_COMMENTS).filter((story) => story?.kids?.length);
    for (const story of candidates) {
      if (this.prefetchingComments.has(story.id)) continue;
      this.prefetchingComments.add(story.id);
      this.client.comments(story, 0).catch(() => {}).finally(() => this.prefetchingComments.delete(story.id));
    }
  }

  ensureListWindow() {
    const rows = this.visibleStoryCount();
    if (this.selected < this.offset) this.offset = this.selected;
    if (this.selected >= this.offset + rows) this.offset = this.selected - rows + 1;
  }

  ensureCommentWindow(lines) {
    const { height } = this.terminalSize();
    const rows = Math.max(1, height - 5);
    const cursorLine = lines.findIndex((line) => line.selected);
    if (cursorLine < 0) return;
    if (cursorLine < this.commentOffset) this.commentOffset = cursorLine;
    if (cursorLine >= this.commentOffset + rows) this.commentOffset = cursorLine - rows + 1;
  }

  render() {
    if (!process.stdout.isTTY) return;
    const view = this.mode === "list" ? this.renderList() : this.renderDetail();
    process.stdout.write(moveHome() + view);
  }

  renderHeader(width) {
    const tabs = categories.map((cat) => cat === this.category ? this.theme.accent(`[${categoryLabels[cat]}]`) : this.theme.muted(` ${categoryLabels[cat]} `)).join(" ");
    return padRight(`hn ${tabs}`, width);
  }

  renderList() {
    this.ensureListWindow();
    const { width, height } = this.terminalSize();
    const rows = this.visibleStoryCount();
    const stories = this.stories[this.category] || [];
    const out = [this.renderHeader(width), this.theme.muted("Enter comments  o open  t/T translate  ←/→ tabs  r refresh  ? help  q quit")];
    for (let i = this.offset; i < Math.min(stories.length, this.offset + rows); i++) {
      const story = stories[i];
      const meta = `${story.score || 0} pts · ${story.by || "?"} · ${relativeTime(story.time)} · ${story.descendants || 0} comments${story.domain ? ` · ${story.domain}` : ""}`;
      const marker = i === this.selected ? this.theme.accent("▎") : " ";
      const title = this.translations.get(story.id) || story.title || "(untitled)";
      const line = `${marker} ${String(story.rank).padStart(3)}. ${truncate(title, width - 8)}`;
      out.push(i === this.selected ? bg(this.theme.surface, padRight(line, width)) : padRight(line, width));
      out.push(`     ${this.theme.muted(truncate(meta, width - 5))}`);
    }
    while (out.length < height - 1) out.push("");
    out.push(this.footer(width));
    return out.join("\n");
  }

  renderDetail() {
    const { width, height } = this.terminalSize();
    const title = this.detail?.title || "(untitled)";
    const meta = `${this.detail?.score || 0} pts · ${this.detail?.by || "?"} · ${this.detail ? relativeTime(this.detail.time) : ""} · Esc back`;
    const header = [
      this.renderHeader(width),
      this.theme.title(truncate(title, width)),
      this.theme.muted(truncate(meta, width)),
    ];
    const lines = [];
    if (this.detail?.text) {
      for (const line of wrap(this.detail.text, width - 2)) lines.push({ text: `  ${this.theme.muted(line)}` });
    }
    if (!this.flatComments.length) {
      lines.push({ text: this.theme.muted("  No comments yet. Press Esc to go back or o to open the story.") });
    }
    for (let i = 0; i < this.flatComments.length; i++) {
      const node = this.flatComments[i];
      const selected = i === this.commentCursor;
      const indent = " ".repeat(Math.min(node.depth, 5) * 3);
      const collapsed = this.collapsed.has(node.item.id);
      const head = `${indent}${selected ? this.theme.accent("▎") : " "} ${collapsed ? "▶" : "▼"} ${this.theme.accent(node.item.by || "?")} ${this.theme.muted("· " + relativeTime(node.item.time))}`;
      lines.push({ text: selected ? bg(this.theme.surface, padRight(head, width)) : head, selected });
      if (!collapsed) {
        for (const line of wrap(node.item.text, width - visibleWidth(indent) - 5)) lines.push({ text: `${indent}    ${line}` });
        const translated = this.commentTranslations.get(node.item.id);
        if (translated) for (const line of wrap(translated, width - visibleWidth(indent) - 7)) lines.push({ text: `${indent}    ${this.theme.muted("│")} ${line}` });
      }
    }
    this.ensureCommentWindow(lines);
    const bodyRows = Math.max(1, height - header.length - 1);
    const out = header.concat(lines.slice(this.commentOffset, this.commentOffset + bodyRows).map((line) => padRight(line.text, width)));
    while (out.length < height - 1) out.push("");
    out.push(this.footer(width));
    return out.join("\n");
  }

  footer(width) {
    const help = this.help
      ? "list: j/k move Enter comments o open t/T translate r refresh | comments: Space fold C/E all R refresh Esc back"
      : this.status;
    return this.theme.muted(truncate(help, width));
  }

  exit() {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(showCursor() + "\n");
    process.exit(0);
  }
}
