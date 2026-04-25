import crypto from "node:crypto";

import { loadTranslateConfig } from "./config.js";

const DEEPL_LANGUAGES = {
  chinese: "ZH",
  zh: "ZH",
  "zh-cn": "ZH",
  english: "EN-US",
  en: "EN-US",
  "en-us": "EN-US",
  japanese: "JA",
  ja: "JA",
  korean: "KO",
  ko: "KO",
  french: "FR",
  fr: "FR",
  german: "DE",
  de: "DE",
  spanish: "ES",
  es: "ES",
  portuguese: "PT-PT",
  pt: "PT-PT",
  italian: "IT",
  it: "IT",
};

const YOUDAO_LANGUAGES = {
  chinese: "zh-CHS",
  zh: "zh-CHS",
  "zh-cn": "zh-CHS",
  "zh-chs": "zh-CHS",
  "traditional chinese": "zh-CHT",
  "zh-tw": "zh-CHT",
  "zh-cht": "zh-CHT",
  english: "en",
  en: "en",
  "en-us": "en",
  japanese: "ja",
  ja: "ja",
  korean: "ko",
  ko: "ko",
  french: "fr",
  fr: "fr",
  german: "de",
  de: "de",
  spanish: "es",
  es: "es",
  portuguese: "pt",
  pt: "pt",
  italian: "it",
  it: "it",
  russian: "ru",
  ru: "ru",
};

export class Translator {
  constructor(config = loadTranslateConfig()) {
    this.provider = config.provider.toLowerCase();
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.model = config.model;
    this.language = config.language;
  }

  get configured() {
    if (this.provider === "deepl") return Boolean(this.apiUrl && this.apiKey && this.language);
    if (this.provider === "youdao") return Boolean(this.apiUrl && this.apiKey && this.apiSecret && this.language);
    return Boolean(this.apiUrl && this.apiKey && this.model && this.language);
  }

  async translate(text, markdown = false) {
    if (!this.configured) throw new Error(this.missingConfigMessage());
    if (!String(text || "").trim()) return "";
    if (this.provider === "deepl") return this.translateDeepL([text]).then((translations) => translations[0] || "");
    if (this.provider === "youdao") return this.translateYoudao(text);
    const system = markdown
      ? `Translate the following markdown text to ${this.language}. Preserve markdown formatting. Output only the translation, no explanation.`
      : `Translate the following text to ${this.language}. Output only the translation, no explanation.`;
    return this.complete(system, text);
  }

  async translateBatch(titles) {
    if (!this.configured) throw new Error(this.missingConfigMessage());
    if (this.provider === "deepl") {
      const entries = Object.entries(titles);
      const translated = await this.translateDeepL(entries.map(([, title]) => title));
      return Object.fromEntries(entries.map(([id], index) => [id, translated[index] || ""]));
    }
    if (this.provider === "youdao") {
      const entries = Object.entries(titles);
      const translated = await Promise.all(entries.map(([, title]) => this.translateYoudao(title)));
      return Object.fromEntries(entries.map(([id], index) => [id, translated[index] || ""]));
    }
    const system = `Translate each Hacker News title to ${this.language}. Return only valid JSON: an object whose keys are the input ids and whose values are translated titles.`;
    const content = await this.complete(system, JSON.stringify(titles));
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  }

  missingConfigMessage() {
    if (this.provider === "youdao") return "Translation disabled. Set HN_TRANSLATE_API_KEY and HN_TRANSLATE_API_SECRET to enable it.";
    return "Translation disabled. Set HN_TRANSLATE_API_KEY to enable it.";
  }

  deeplLanguage() {
    return DEEPL_LANGUAGES[this.language.toLowerCase()] || this.language.toUpperCase();
  }

  youdaoLanguage() {
    return YOUDAO_LANGUAGES[this.language.toLowerCase()] || this.language;
  }

  truncateForYoudao(text) {
    const chars = Array.from(text);
    if (chars.length <= 20) return text;
    return `${chars.slice(0, 10).join("")}${chars.length}${chars.slice(-10).join("")}`;
  }

  signYoudao(text, salt, curtime) {
    const input = this.truncateForYoudao(text);
    return crypto.createHash("sha256").update(`${this.apiKey}${input}${salt}${curtime}${this.apiSecret}`).digest("hex");
  }

  async translateDeepL(texts) {
    const response = await fetch(`${this.apiUrl}/translate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `DeepL-Auth-Key ${this.apiKey}`,
      },
      body: JSON.stringify({
        text: texts,
        target_lang: this.deeplLanguage(),
      }),
    });
    if (!response.ok) throw new Error(`translate request failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    const translations = data?.translations?.map((item) => item?.text?.trim() || "");
    if (!translations?.length) throw new Error("translate response is empty");
    return translations;
  }

  async translateYoudao(text) {
    const salt = crypto.randomUUID();
    const curtime = String(Math.floor(Date.now() / 1000));
    const body = new URLSearchParams({
      q: text,
      from: "auto",
      to: this.youdaoLanguage(),
      appKey: this.apiKey,
      salt,
      sign: this.signYoudao(text, salt, curtime),
      signType: "v3",
      curtime,
    });
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) throw new Error(`translate request failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    if (data?.errorCode && data.errorCode !== "0") throw new Error(`translate request failed: youdao error ${data.errorCode}`);
    const content = data?.translation?.[0]?.trim();
    if (!content) throw new Error("translate response is empty");
    return content;
  }

  async complete(system, user) {
    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) throw new Error(`translate request failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("translate response is empty");
    return content;
  }
}
