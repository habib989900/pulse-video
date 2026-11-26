DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  item_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX interactions_kind_item ON interactions (kind, item_key);
