import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, projects, records, versions } from "@/db/schema";

export const projectIdInput = z.object({ id: z.string().uuid() }).strict();
export const createProjectInput = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(80),
    description: z.string().trim().min(1, "Describe it in a sentence").max(500),
  })
  .strict();
export const renameProjectInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "Give it a name").max(80),
  })
  .strict();
export const versionInput = z
  .object({ id: z.string().uuid(), number: z.number().int().min(1) })
  .strict();

export const now = () => new Date().toISOString();

/** The project when this user owns it; every read and change goes through here. */
export async function ownedProject(ownerId: string, id: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
  return project ?? null;
}

export function listProjects(ownerId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      updatedAt: projects.updatedAt,
      publishedVersion: projects.publishedVersion,
      currentVersion: projects.currentVersion,
    })
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projects.updatedAt));
}

export async function createProject(
  ownerId: string,
  input: z.infer<typeof createProjectInput>,
) {
  const id = crypto.randomUUID();
  await db.insert(projects).values({
    id,
    ownerId,
    name: input.name,
    description: input.description,
    updatedAt: now(),
  });
  return { id };
}

export async function renameProject(
  ownerId: string,
  { id, name }: z.infer<typeof renameProjectInput>,
) {
  const [row] = await db
    .update(projects)
    .set({ name, updatedAt: now() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  return row ?? null;
}

/** Deletes the project with its chat, versions and stored records; its link stops answering. */
export async function deleteProject(ownerId: string, id: string) {
  const project = await ownedProject(ownerId, id);
  if (!project) return null;
  await db.batch([
    db.delete(records).where(eq(records.projectId, id)),
    db.delete(versions).where(eq(versions.projectId, id)),
    db.delete(messages).where(eq(messages.projectId, id)),
    db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId))),
  ]);
  return { id };
}

/** Everything the project page shows, or null for a project this user doesn't own. */
export async function projectDetail(ownerId: string, id: string) {
  const project = await ownedProject(ownerId, id);
  if (!project) return null;
  const [chat, history, current] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        versionNumber: messages.versionNumber,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.projectId, id))
      .orderBy(asc(messages.seq)),
    db
      .select({
        number: versions.number,
        prompt: versions.prompt,
        restoredFrom: versions.restoredFrom,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(eq(versions.projectId, id))
      .orderBy(desc(versions.number)),
    versionHtml(id, project.currentVersion),
  ]);
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    currentVersion: project.currentVersion,
    publishedVersion: project.publishedVersion,
    slug: project.slug,
    visits: project.visits,
    updatedAt: project.updatedAt,
    currentHtml: current,
    messages: chat,
    versions: history,
  };
}

export async function versionHtml(projectId: string, number: number) {
  if (number < 1) return null;
  const [row] = await db
    .select({ html: versions.html })
    .from(versions)
    .where(and(eq(versions.projectId, projectId), eq(versions.number, number)));
  return row?.html ?? null;
}

export async function nextVersionNumber(projectId: string) {
  const [row] = await db
    .select({ top: max(versions.number) })
    .from(versions)
    .where(eq(versions.projectId, projectId));
  return (row?.top ?? 0) + 1;
}

/** Makes an older version current again, as a new version; nothing is removed. */
export async function restoreVersion(
  ownerId: string,
  { id, number }: z.infer<typeof versionInput>,
) {
  const project = await ownedProject(ownerId, id);
  if (!project) return null;
  const html = await versionHtml(id, number);
  if (html === null) return null;
  const next = await nextVersionNumber(id);
  const at = now();
  await db.batch([
    db.insert(versions).values({
      id: crypto.randomUUID(),
      projectId: id,
      number: next,
      html,
      prompt: `Restored v${number}`,
      restoredFrom: number,
    }),
    db
      .update(projects)
      .set({ currentVersion: next, updatedAt: at })
      .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId))),
  ]);
  return { number: next };
}
