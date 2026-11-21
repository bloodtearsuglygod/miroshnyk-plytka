CREATE TABLE leads (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  comment TEXT NOT NULL,
  tile_name TEXT NOT NULL,
  area REAL NOT NULL,
  reserve INTEGER NOT NULL,
  billed_area REAL NOT NULL,
  price INTEGER NOT NULL,
  total INTEGER NOT NULL,
  payload_key TEXT NOT NULL
);

CREATE INDEX leads_created_at ON leads (created_at DESC);
