import { publishedProject } from "@/server/publishing";
import { MAX_RECORD_BYTES, validCollection } from "@/server/records";

/** Published pages run in an opaque origin, so every answer allows any origin. */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });
export const noContent = () => new Response(null, { status: 204, headers: CORS });
export const failure = (status: number, error: string) => json({ error }, status);

/** The live project behind the slug and a valid collection name, or the answer to send instead. */
export async function resolveStore(slug: string, collection: string) {
  const live = await publishedProject(slug);
  if (!live) return failure(404, "Not found");
  if (!validCollection(collection))
    return failure(400, "Collection names use letters, digits, - and _ (64 at most).");
  return live;
}

/** The request's JSON, as text to store, or the answer to send instead. */
export async function readRecordBody(request: Request): Promise<string | Response> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_RECORD_BYTES)
    return failure(413, "A record holds at most 64 KB.");
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object")
      return failure(400, "Send a JSON object or array.");
    return JSON.stringify(value);
  } catch {
    return failure(400, "Send a JSON object or array.");
  }
}
