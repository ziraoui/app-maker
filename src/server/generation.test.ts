import { describe, expect, it } from "vitest";
import { buildMessages, parseGeneration, SYSTEM_PROMPT } from "./generation";

const doc = "<!doctype html><html><body><h1>Hi</h1></body></html>";

describe("parseGeneration", () => {
  it("takes the fenced document and the reply around it", () => {
    const parsed = parseGeneration(`Made a greeting.\n\n\`\`\`html\n${doc}\n\`\`\``);
    expect(parsed).toEqual({ ok: true, html: doc, reply: "Made a greeting." });
  });
  it("takes an unfenced document", () => {
    const parsed = parseGeneration(`Sure. ${doc}`);
    expect(parsed.ok && parsed.html).toBe(doc);
  });
  it("refuses an empty or cut-off answer", () => {
    expect(parseGeneration("  ").ok).toBe(false);
    expect(parseGeneration("```html\n<!doctype html><html><body>").ok).toBe(false);
    expect(parseGeneration("No app here.").ok).toBe(false);
  });
});

describe("buildMessages", () => {
  it("tells the model about the data API and ends with the request", () => {
    const messages = buildMessages({ history: [], currentHtml: doc, currentNumber: 2, request: "Make it blue" });
    expect(messages[0]!.content).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).toContain("appData.add");
    const last = messages.at(-1)!.content;
    expect(last).toContain(doc);
    expect(last.split("\n").at(-1)).toBe("Make it blue");
  });
});
