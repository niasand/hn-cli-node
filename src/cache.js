import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const DEFAULT_CACHE_DIR = path.join(os.homedir(), ".cache", "hn");
const DEFAULT_CACHE_PATH = path.join(DEFAULT_CACHE_DIR, "cache.sqlite");

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
}

export class SQLiteCache {
  constructor({ file = process.env.HN_CACHE_PATH || DEFAULT_CACHE_PATH, enabled = process.env.HN_CACHE !== "0" } = {}) {
    this.file = file;
    this.enabled = enabled;
    this.ready = this.enabled ? this.init() : Promise.resolve(false);
  }

  async init() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      await this.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS hn_items (
          id INTEGER PRIMARY KEY,
          type TEXT,
          time INTEGER,
          json TEXT NOT NULL,
          fetched_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_hn_items_type_time ON hn_items(type, time);
      `);
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  async available() {
    return this.enabled && await this.ready;
  }

  async exec(sql) {
    return new Promise((resolve, reject) => {
      const child = spawn("sqlite3", [this.file], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(stderr || `sqlite3 exited with ${code}`));
      });
      child.stdin.end(sql);
    });
  }

  async getItems(ids) {
    if (!ids.length || !await this.available()) return new Map();
    const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
    if (!unique.length) return new Map();
    try {
      const { stdout } = await this.exec(`
.mode json
SELECT id, json FROM hn_items WHERE id IN (${unique.map(sqlNumber).join(",")});
`);
      const rows = JSON.parse(stdout || "[]");
      return new Map(rows.map((row) => [Number(row.id), JSON.parse(row.json)]));
    } catch {
      return new Map();
    }
  }

  async getItem(id) {
    const items = await this.getItems([id]);
    return items.get(Number(id)) || null;
  }

  async putItems(items) {
    const valid = items.filter(Boolean);
    if (!valid.length || !await this.available()) return;
    const fetchedAt = Math.floor(Date.now() / 1000);
    const statements = valid.map((item) => {
      const json = JSON.stringify(item);
      return `INSERT INTO hn_items (id, type, time, json, fetched_at)
        VALUES (${sqlNumber(item.id)}, ${sqlString(item.type || "")}, ${sqlNumber(item.time)}, ${sqlString(json)}, ${fetchedAt})
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          time = excluded.time,
          json = excluded.json,
          fetched_at = excluded.fetched_at;`;
    });
    try {
      await this.exec(`BEGIN;\n${statements.join("\n")}\nCOMMIT;`);
    } catch {
      // Cache failures should never break browsing.
    }
  }

  async putItem(item) {
    await this.putItems([item]);
  }
}
