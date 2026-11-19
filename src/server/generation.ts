/** What the model is told: the shape of its answer and the data API. */
export const SYSTEM_PROMPT = `You build small single-file web apps for people who describe them in plain words.

Answer with one or two short sentences saying what you made or changed, then the complete app as one HTML document in a single \`\`\`html fenced block. The document must be whole and self-contained: inline <style> and <script>, no build step, starting with <!doctype html> and ending with </html>. Always return the entire file, never a diff or a fragment. Make it responsive and pleasant on phones.

The page runs in a sandbox with no cookies or local storage you can rely on. To keep data, use the global \`appData\` object that is already on the page:
- await appData.list(collection) returns an array of { id, data, createdAt, updatedAt }, oldest first.
- await appData.add(collection, data) stores a JSON object and returns the new record.
- await appData.update(collection, id, data) replaces a record's data and returns it.
- await appData.remove(collection, id) deletes a record.
Collections are named with letters, digits, "-" or "_". Each record holds at most 64 KB of JSON and an app holds at most ${1000} records. Everyone who opens the app shares the same data. Handle a rejected promise by showing a short message.`;

export const MAX_HTML_BYTES = 512 * 1024;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** The messages sent for one turn: the instructions, recent conversation, then the current app and the request. */
export function buildMessages(input: {
  history: ChatTurn[];
  currentHtml: string | null;
  currentNumber: number;
  request: string;
}) {
  const last =
    input.currentHtml === null
      ? `There is no app yet. What to build:\n${input.request}`
      : `The current app (version ${input.currentNumber}):\n\`\`\`html\n${input.currentHtml}\n\`\`\`\n\nWhat to change:\n${input.request}`;
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...input.history.slice(-10),
    { role: "user" as const, content: last },
  ];
}

export type Generation =
  | { ok: true; html: string; reply: string }
  | { ok: false; error: string };

/** Reads the model's answer: the HTML document and the words around it. */
export function parseGeneration(content: string): Generation {
  const text = content.trim();
  if (!text) return { ok: false, error: "The model sent back nothing." };
  let html: string | null = null;
  let rest = text;
  const fenced = /```(?:html)?[^\S\n]*\n([\s\S]*?)```/i.exec(text);
  if (fenced && /<html[\s>]|<!doctype html/i.test(fenced[1]!)) {
    html = fenced[1]!.trim();
    rest = text.replace(fenced[0], " ");
  } else {
    const start = text.search(/<!doctype html|<html[\s>]/i);
    const end = text.toLowerCase().lastIndexOf("</html>");
    if (start >= 0 && end > start) {
      html = text.slice(start, end + "</html>".length);
      rest = text.slice(0, start) + " " + text.slice(end + "</html>".length);
    }
  }
  if (!html || !/<\/html>\s*$/i.test(html)) {
    return {
      ok: false,
      error: "The model didn't send back a complete app.",
    };
  }
  if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
    return { ok: false, error: "The app came back larger than 512 KB." };
  }
  const reply =
    rest.replace(/```\w*/g, "").replace(/\s+/g, " ").trim().slice(0, 600) ||
    "Here is the new version.";
  return { ok: true, html, reply };
}
