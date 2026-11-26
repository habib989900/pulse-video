import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const interactions = sqliteTable("interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["like", "save", "follow", "history"] }).notNull(),
  itemKey: text("item_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/* Single-row store for everything the admin panel manages: site texts,
   button labels/links, SEO, admin-added videos, catalog overrides/deletes
   and taxonomy changes — serialized as one JSON payload. */
export const adminState = sqliteTable("admin_state", {
  id: integer("id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
