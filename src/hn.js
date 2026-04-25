import { SQLiteCache } from "./cache.js";

const FIREBASE = "https://hacker-news.firebaseio.com/v0";

export const categories = ["top", "new", "best", "ask", "show"];
export const categoryLabels = { top: "Top", new: "New", best: "Best", ask: "Ask", show: "Show" };

export class HNClient {
  constructor({ maxConcurrent = Number(process.env.HN_MAX_CONCURRENT || 64) } = {}) {
    this.maxConcurrent = Math.max(1, Math.min(256, maxConcurrent || 64));
    this.persistentCache = new SQLiteCache();
    this.cache = new Map();
    this.inflight = new Map();
    this.commentCache = new Map();
    this.commentInflight = new Map();
  }

  async storyIds(category) {
    const response = await fetch(`${FIREBASE}/${category}stories.json`);
    if (!response.ok) throw new Error(`fetch ${category} stories: ${response.status} ${response.statusText}`);
    return response.json();
  }

  async item(id, { fresh = false } = {}) {
    if (!fresh && this.cache.has(id)) return this.cache.get(id);
    if (!fresh && this.inflight.has(id)) return this.inflight.get(id);
    if (!fresh) {
      const cached = await this.persistentCache.getItem(id);
      if (cached) {
        this.cache.set(id, cached);
        return cached;
      }
    }
    const promise = fetch(`${FIREBASE}/item/${id}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`fetch item ${id}: ${response.status} ${response.statusText}`);
        return response.json();
      })
      .then((item) => {
        if (item) {
          this.cache.set(id, item);
          this.persistentCache.putItem(item);
        }
        return item;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, promise);
    return promise;
  }

  async items(ids, options) {
    const fresh = options?.fresh || false;
    const out = new Array(ids.length);
    if (!fresh) {
      const cached = await this.persistentCache.getItems(ids);
      ids.forEach((id, index) => {
        const item = this.cache.get(id) || cached.get(Number(id));
        if (item) {
          this.cache.set(id, item);
          out[index] = item;
        }
      });
    }
    let next = 0;
    const workers = Array.from({ length: Math.min(this.maxConcurrent, ids.length) }, async () => {
      while (next < ids.length) {
        const index = next++;
        if (out[index]) continue;
        out[index] = await this.item(ids[index], options);
      }
    });
    await Promise.all(workers);
    return out.filter(Boolean);
  }

  async comments(item, depth = 0, limit = 250, { fresh = false } = {}) {
    const ids = item?.kids || [];
    const key = `${item?.id || "none"}:${depth}:${limit}`;
    if (!fresh && this.commentCache.has(key)) return this.commentCache.get(key);
    if (!fresh && this.commentInflight.has(key)) return this.commentInflight.get(key);

    const promise = (async () => {
      let remaining = limit;
      const walk = async (commentIds, currentDepth) => {
        if (!commentIds.length || remaining <= 0) return [];
        const loaded = await this.items(commentIds.slice(0, remaining), { fresh });
        const comments = [];
        for (const child of loaded) {
          if (!child || child.deleted || child.dead) continue;
          remaining -= 1;
          const node = { item: child, depth: currentDepth, children: [] };
          if (remaining > 0 && child.kids?.length) node.children = await walk(child.kids, currentDepth + 1);
          comments.push(node);
        }
        return comments;
      };
      const comments = await walk(ids, depth);
      this.commentCache.set(key, comments);
      return comments;
    })().finally(() => this.commentInflight.delete(key));

    this.commentInflight.set(key, promise);
    return promise;
  }
}

export function storyDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "";
  }
}

export function relativeTime(unixSeconds) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 2592000) return `${Math.round(seconds / 86400)}d`;
  if (seconds < 31536000) return `${Math.round(seconds / 2592000)}mo`;
  return `${Math.round(seconds / 31536000)}y`;
}
