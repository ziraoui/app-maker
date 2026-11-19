import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";

export const MAX_RECORD_BYTES = 64 * 1024;
export const MAX_RECORDS = 1000;
const COLLECTION = /^[A-Za-z0-9_-]{1,64}$/;

export const validCollection = (name: string) => COLLECTION.test(name);

export interface StoredRecord {
  id: string;
  data: unknown;
  createdAt: string;
  updatedAt: string;
}

const shown = {
  id: records.id,
  collection: records.collection,
  data: records.data,
  createdAt: records.createdAt,
  updatedAt: records.updatedAt,
};

const toRecord = (row: { id: string; data: string; createdAt: string; updatedAt: string }): StoredRecord => ({
  id: row.id,
  data: JSON.parse(row.data) as unknown,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** Every query below takes the project id the slug resolved to, so apps never see each other's data. */
export async function listRecords(projectId: string, collection: string) {
  const rows = await db
    .select(shown)
    .from(records)
    .where(and(eq(records.projectId, projectId), eq(records.collection, collection)))
    .orderBy(asc(records.seq), asc(records.id))
    .limit(MAX_RECORDS);
  return rows.map(toRecord);
}

export async function addRecord(projectId: string, collection: string, data: string) {
  const [stored] = await db
    .select({ n: count() })
    .from(records)
    .where(eq(records.projectId, projectId));
  if ((stored?.n ?? 0) >= MAX_RECORDS) return null;
  const at = new Date().toISOString();
  const [row] = await db
    .insert(records)
    .values({
      id: crypto.randomUUID(),
      projectId,
      collection,
      data,
      seq: Date.now(),
      createdAt: at,
      updatedAt: at,
    })
    .returning(shown);
  return toRecord(row!);
}

export async function updateRecord(projectId: string, collection: string, id: string, data: string) {
  const [row] = await db
    .update(records)
    .set({ data, updatedAt: new Date().toISOString() })
    .where(and(eq(records.id, id), eq(records.projectId, projectId), eq(records.collection, collection)))
    .returning(shown);
  return row ? toRecord(row) : null;
}

export async function removeRecord(projectId: string, collection: string, id: string) {
  const [row] = await db
    .delete(records)
    .where(and(eq(records.id, id), eq(records.projectId, projectId), eq(records.collection, collection)))
    .returning({ id: records.id });
  return row ?? null;
}

/** The owner's view of the store: each collection with its newest records. */
export async function storeOverview(projectId: string) {
  const rows = await db
    .select(shown)
    .from(records)
    .where(eq(records.projectId, projectId))
    .orderBy(asc(records.collection), asc(records.seq), asc(records.id))
    .limit(MAX_RECORDS);
  const collections = new Map<string, { name: string; records: { id: string; data: string; updatedAt: string }[] }>();
  for (const row of rows) {
    const entry = collections.get(row.collection) ?? { name: row.collection, records: [] };
    entry.records.push({ id: row.id, data: row.data, updatedAt: row.updatedAt });
    collections.set(row.collection, entry);
  }
  return { total: rows.length, collections: [...collections.values()] };
}

export async function clearRecords(projectId: string) {
  await db.delete(records).where(eq(records.projectId, projectId));
}
