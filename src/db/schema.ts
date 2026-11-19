import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** Members the app has seen, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/** One app being built. Only its owner reads or changes it. */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** The number of the version shown in the preview; 0 before the first. */
    currentVersion: integer("current_version").notNull().default(0),
    /** Kept across unpublish, so publishing again reuses the link. */
    slug: text("slug"),
    /** The version served at /a/<slug>; null while unpublished. */
    publishedVersion: integer("published_version"),
    visits: integer("visits").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("projects_owner").on(table.ownerId, table.updatedAt),
    uniqueIndex("projects_slug").on(table.slug),
  ],
);

/** The chat: member messages and the model's short replies. */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** The version this reply produced, if any. */
    versionNumber: integer("version_number"),
    seq: integer("seq").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("messages_project").on(table.projectId, table.seq)],
);

/** Every version of a project's app, never rewritten. */
export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    number: integer("number").notNull(),
    html: text("html").notNull(),
    /** The message that produced it, or "Restored v<n>". */
    prompt: text("prompt").notNull(),
    restoredFrom: integer("restored_from"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("versions_number").on(table.projectId, table.number)],
);

/** A published app's stored JSON, by collection. */
export const records = sqliteTable(
  "records",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    collection: text("collection").notNull(),
    data: text("data").notNull(),
    seq: integer("seq").notNull(),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("records_collection").on(
      table.projectId,
      table.collection,
      table.seq,
    ),
  ],
);
