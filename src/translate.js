import { loadTranslateConfig } from "./config.js";

export class Translator {
  constructor(config = loadTranslateConfig()) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.language = config.language;
  }

  get configured() {
    return Boolean(this.apiUrl && this.apiKey && this.model && this.language);
  }

  async translate(text, markdown = false) {
    if (!this.configured) throw new Error("Translation disabled. Set HN_TRANSLATE_API_KEY to enable it.");
    if (!String(text || "").trim()) return "";
    const system = markdown
      ? `Translate the following markdown text to ${this.language}. Preserve markdown formatting. Output only the translation, no explanation.`
      : `Translate the following text to ${this.language}. Output only the translation, no explanation.`;
    return this.complete(system, text);
  }

  async translateBatch(titles) {
    if (!this.configured) throw new Error("Translation disabled. Set HN_TRANSLATE_API_KEY to enable it.");
    const system = `Translate each Hacker News title to ${this.language}. Return only valid JSON: an object whose keys are the input ids and whose values are translated titles.`;
    const content = await this.complete(system, JSON.stringify(titles));
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
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
