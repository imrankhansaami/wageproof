import { audit, nowIso, type Db } from '../db.ts';
import type { FactoryRow, WorkerRow } from '../types.ts';

export interface NewFactoryInput {
  code?: string;
  name: string;
  nameBn?: string;
  address?: string;
  bgmeaReg?: string;
  contactPhone?: string;
}

export interface NewWorkerInput {
  factoryId: number;
  code?: string;
  name: string;
  nameBn?: string;
  phone: string;
  mfsNumber?: string;
  department: string;
  designation?: string;
  monthlyGrossPoisha: number;
  joinedAt?: string;
}

export function createFactory(db: Db, input: NewFactoryInput): FactoryRow {
  const seq = db.prepare('SELECT COUNT(*) AS c FROM factories').get() as { c: number };
  const code = input.code ?? `FAC-${String(Number(seq.c) + 1).padStart(3, '0')}`;
  const id = Number(
    db
      .prepare(
        'INSERT INTO factories (code, name, name_bn, address, bgmea_reg, contact_phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        code,
        input.name,
        input.nameBn ?? null,
        input.address ?? null,
        input.bgmeaReg ?? null,
        input.contactPhone ?? null,
        nowIso(),
      ).lastInsertRowid,
  );
  audit(db, 'factory.create', 'factory', code, { name: input.name });
  return getFactory(db, id)!;
}

export function getFactory(db: Db, id: number): FactoryRow | null {
  return (db.prepare('SELECT * FROM factories WHERE id = ?').get(id) as FactoryRow | undefined) ?? null;
}

export function getFactoryByCode(db: Db, code: string): FactoryRow | null {
  return (db.prepare('SELECT * FROM factories WHERE code = ?').get(code) as FactoryRow | undefined) ?? null;
}

export function listFactories(db: Db): Array<FactoryRow & { worker_count: number }> {
  return db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM workers w WHERE w.factory_id = f.id AND w.active = 1) AS worker_count
       FROM factories f ORDER BY f.id`,
    )
    .all() as unknown as Array<FactoryRow & { worker_count: number }>;
}

export function createWorker(db: Db, input: NewWorkerInput): WorkerRow {
  const factory = getFactory(db, input.factoryId);
  if (!factory) throw new Error('Factory not found');
  const seq = db.prepare('SELECT COUNT(*) AS c FROM workers').get() as { c: number };
  const code = input.code ?? `WRK-${String(Number(seq.c) + 1).padStart(4, '0')}`;
  const id = Number(
    db
      .prepare(
        `INSERT INTO workers (factory_id, code, name, name_bn, phone, mfs_number, department, designation, monthly_gross_poisha, joined_at, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        input.factoryId,
        code,
        input.name,
        input.nameBn ?? null,
        input.phone,
        input.mfsNumber ?? null,
        input.department,
        input.designation ?? null,
        input.monthlyGrossPoisha,
        input.joinedAt ?? null,
        nowIso(),
      ).lastInsertRowid,
  );
  audit(db, 'worker.create', 'worker', code, { factory: factory.code, department: input.department });
  return db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as unknown as WorkerRow;
}

export function listWorkers(db: Db, factoryId: number): WorkerRow[] {
  return db.prepare('SELECT * FROM workers WHERE factory_id = ? ORDER BY code').all(factoryId) as unknown as WorkerRow[];
}
