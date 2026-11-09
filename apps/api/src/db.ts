import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS factories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_bn TEXT,
  address TEXT,
  bgmea_reg TEXT,
  contact_phone TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factory_id INTEGER NOT NULL REFERENCES factories(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_bn TEXT,
  phone TEXT NOT NULL,
  mfs_number TEXT,
  department TEXT NOT NULL,
  designation TEXT,
  monthly_gross_poisha INTEGER NOT NULL,
  joined_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  factory_id INTEGER NOT NULL REFERENCES factories(id),
  period_month TEXT NOT NULL,
  working_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  worker_count INTEGER NOT NULL DEFAULT 0,
  total_net_poisha INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  anchored_at TEXT
);

CREATE TABLE IF NOT EXISTS wage_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  worker_code TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  department TEXT NOT NULL,
  days_worked INTEGER NOT NULL,
  ot_hours REAL NOT NULL DEFAULT 0,
  basic_poisha INTEGER NOT NULL,
  house_rent_poisha INTEGER NOT NULL,
  medical_poisha INTEGER NOT NULL,
  gross_poisha INTEGER NOT NULL,
  ot_poisha INTEGER NOT NULL,
  deduction_poisha INTEGER NOT NULL DEFAULT 0,
  net_poisha INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  leaf_count INTEGER NOT NULL,
  block_index INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_blocks (
  block_index INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  block_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  factory_id INTEGER NOT NULL REFERENCES factories(id),
  buyer TEXT NOT NULL,
  po_number TEXT,
  style TEXT,
  destination TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custody_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  stage TEXT NOT NULL,
  location TEXT,
  actor TEXT,
  quantity INTEGER,
  note TEXT,
  block_index INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_wage_lines_run ON wage_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_custody_events_shipment ON custody_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_anchors_ref ON anchors(ref_type, ref_id);
`;

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function audit(
  db: Db,
  action: string,
  entity: string,
  entityId: string | number | null,
  details?: unknown,
  actor = 'system',
): void {
  db.prepare(
    'INSERT INTO audit_events (created_at, actor, action, entity, entity_id, details_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    nowIso(),
    actor,
    action,
    entity,
    entityId === null ? null : String(entityId),
    details === undefined ? null : JSON.stringify(details),
  );
}
