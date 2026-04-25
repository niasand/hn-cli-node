export const CSI = "\x1b[";

export function clearScreen() {
  return `${CSI}?25l${CSI}2J${CSI}H`;
}

export function showCursor() {
  return `${CSI}?25h`;
}

export function moveHome() {
  return `${CSI}H`;
}

export function color(code, text) {
  return `\x1b[38;5;${code}m${text}\x1b[0m`;
}

export function bg(code, text) {
  return `\x1b[48;5;${code}m${text}\x1b[0m`;
}

export function bold(text) {
  return `\x1b[1m${text}\x1b[0m`;
}

export function faint(text) {
  return `\x1b[2m${text}\x1b[0m`;
}

export function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

export function visibleWidth(value) {
  return Array.from(stripAnsi(value)).reduce((width, char) => {
    const code = char.codePointAt(0);
    return width + (code > 0x1100 ? 2 : 1);
  }, 0);
}

export function truncate(value, width) {
  if (visibleWidth(value) <= width) return value;
  const raw = stripAnsi(value);
  let out = "";
  let used = 0;
  for (const char of Array.from(raw)) {
    const next = char.codePointAt(0) > 0x1100 ? 2 : 1;
    if (used + next > Math.max(0, width - 1)) break;
    out += char;
    used += next;
  }
  return `${out}…`;
}

export function padRight(value, width) {
  const pad = width - visibleWidth(value);
  return pad > 0 ? value + " ".repeat(pad) : value;
}

export function wrap(text, width) {
  const clean = htmlToText(text).replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (visibleWidth(next) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<pre><code>/gi, "\n")
    .replace(/<\/code><\/pre>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
