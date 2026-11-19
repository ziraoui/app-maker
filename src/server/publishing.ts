import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, versions } from "@/db/schema";
import { now, ownedProject } from "@/server/projects";

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function newSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

/** Puts the current version live; the link stays the same across publishes. */
export async function publishProject(ownerId: string, id: string) {
  const project = await ownedProject(ownerId, id);
  if (!project || project.currentVersion < 1) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = project.slug ?? newSlug();
    try {
      await db
        .update(projects)
        .set({ slug, publishedVersion: project.currentVersion, updatedAt: now() })
        .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)));
      return { slug };
    } catch (error) {
      if (project.slug) throw error;
    }
  }
  throw new Error("Couldn't pick a free link. Try again.");
}

export async function unpublishProject(ownerId: string, id: string) {
  const [row] = await db
    .update(projects)
    .set({ publishedVersion: null, updatedAt: now() })
    .where(and(eq(projects.id, id), eq(projects.ownerId, ownerId)))
    .returning({ id: projects.id });
  return row ?? null;
}

/** The live project behind a slug, or null when there is none or it is unpublished. */
export async function publishedProject(slug: string) {
  if (!/^[a-z0-9]{4,32}$/.test(slug)) return null;
  const [row] = await db
    .select({ id: projects.id, publishedVersion: projects.publishedVersion })
    .from(projects)
    .where(eq(projects.slug, slug));
  if (!row || row.publishedVersion === null) return null;
  return { id: row.id, version: row.publishedVersion };
}

/** The published page, counting the visit. */
export async function openPublished(slug: string) {
  const live = await publishedProject(slug);
  if (!live) return null;
  const [page] = await db.batch([
    db
      .select({ html: versions.html })
      .from(versions)
      .where(
        and(eq(versions.projectId, live.id), eq(versions.number, live.version)),
      ),
    db
      .update(projects)
      .set({ visits: sql`${projects.visits} + 1` })
      .where(eq(projects.id, live.id)),
  ]);
  return page[0]?.html ?? null;
}
