import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, projects, versions } from "@/db/schema";
import { complete } from "@/server/ai";
import { buildMessages, parseGeneration } from "@/server/generation";
import {
  nextVersionNumber,
  now,
  ownedProject,
  projectDetail,
  versionHtml,
} from "@/server/projects";

export const sendMessageInput = z
  .object({
    id: z.string().uuid(),
    text: z.string().trim().min(1, "Write a message").max(4000),
  })
  .strict();

export type SendResult =
  | { status: "ok"; number: number }
  | { status: "off"; setup: string | null }
  | { status: "error"; message: string }
  | { status: "missing" };

/**
 * One turn: the request and the current version go to the model; a complete
 * app becomes the next version. Anything else leaves the current version as
 * it was and comes back as an error.
 */
export async function sendMessage(
  ownerId: string,
  { id, text }: z.infer<typeof sendMessageInput>,
): Promise<SendResult> {
  const project = await ownedProject(ownerId, id);
  if (!project) return { status: "missing" };
  const detail = await projectDetail(ownerId, id);
  const history = (detail?.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const answer = await complete(
    buildMessages({
      history,
      currentHtml: await versionHtml(id, project.currentVersion),
      currentNumber: project.currentVersion,
      request: text,
    }),
  );
  if (answer.kind === "off") return { status: "off", setup: answer.setup };

  const seq = Date.now();
  const asked = {
    id: crypto.randomUUID(),
    projectId: id,
    role: "user" as const,
    content: text,
    seq,
  };
  const parsed =
    answer.kind === "ok"
      ? parseGeneration(answer.content)
      : { ok: false as const, error: answer.message };
  if (!parsed.ok) {
    await db.insert(messages).values(asked);
    return { status: "error", message: parsed.error };
  }
  const number = await nextVersionNumber(id);
  await db.batch([
    db.insert(messages).values(asked),
    db.insert(versions).values({
      id: crypto.randomUUID(),
      projectId: id,
      number,
      html: parsed.html,
      prompt: text,
    }),
    db.insert(messages).values({
      id: crypto.randomUUID(),
      projectId: id,
      role: "assistant",
      content: parsed.reply,
      versionNumber: number,
      seq: seq + 1,
    }),
    db
      .update(projects)
      .set({ currentVersion: number, updatedAt: now() })
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId))),
  ]);
  return { status: "ok", number };
}
