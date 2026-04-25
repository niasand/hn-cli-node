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

export class Translator {
  constructor(config = loadTranslateConfig()) {
    this.provider = config.provider.toLowerCase();
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.language = config.language;
  }

  get configured() {
    if (this.provider === "deepl") return Boolean(this.apiUrl && this.apiKey && this.language);
    return Boolean(this.apiUrl && this.apiKey && this.model && this.language);
  }

  async translate(text, markdown = false) {
    if (!this.configured) throw new Error("Translation disabled. Set HN_TRANSLATE_API_KEY to enable it.");
    if (!String(text || "").trim()) return "";
    if (this.provider === "deepl") return this.translateDeepL([text]).then((translations) => translations[0] || "");
    const system = markdown
      ? `Translate the following markdown text to ${this.language}. Preserve markdown formatting. Output only the translation, no explanation.`
      : `Translate the following text to ${this.language}. Output only the translation, no explanation.`;
    return this.complete(system, text);
  }

  async translateBatch(titles) {
    if (!this.configured) throw new Error("Translation disabled. Set HN_TRANSLATE_API_KEY to enable it.");
    if (this.provider === "deepl") {
      const entries = Object.entries(titles);
      const translated = await this.translateDeepL(entries.map(([, title]) => title));
      return Object.fromEntries(entries.map(([id], index) => [id, translated[index] || ""]));
    }
    const system = `Translate each Hacker News title to ${this.language}. Return only valid JSON: an object whose keys are the input ids and whose values are translated titles.`;
    const content = await this.complete(system, JSON.stringify(titles));
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  }

  deeplLanguage() {
    return DEEPL_LANGUAGES[this.language.toLowerCase()] || this.language.toUpperCase();
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
