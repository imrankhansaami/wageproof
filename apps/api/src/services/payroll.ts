import { buildMerkleTree, getMerkleProof, verifyChain, type MerkleProofStep } from '@wageproof/ledger-core';
import { audit, nowIso, type Db } from '../db.ts';
import type { AnchorReceipt, FactoryRow, RunRow, VerificationCheck, WageLineRow } from '../types.ts';
import { anchorRecords, findAnchor, loadChain } from './anchoring.ts';
import { getFactory } from './org.ts';

export interface ComputedWage {
  basicPoisha: number;
  houseRentPoisha: number;
  medicalPoisha: number;
  grossPoisha: number;
  otPoisha: number;
  netPoisha: number;
}

/**
 * Transparent MVP wage formula (documented on purpose - auditors must be able
 * to recompute it):
 *   - Basic = 60% of monthly gross, House rent = 30%, Medical = remainder
 *   - Gross = (monthly gross / 30) * days worked
 *   - Overtime = (monthly gross / 30 / 8) * 2 * OT hours   (double rate)
 *   - Net = Gross + OT - deduction
 * All amounts are integer poisha (1 taka = 100 poisha) so hashes are exact.
 */
export function computeWage(
  monthlyGrossPoisha: number,
  daysWorked: number,
  otHours: number,
  deductionPoisha: number,
): ComputedWage {
  const basic = Math.round(monthlyGrossPoisha * 0.6);
  const houseRent = Math.round(monthlyGrossPoisha * 0.3);
  const medical = monthlyGrossPoisha - basic - houseRent;
  const perDay = monthlyGrossPoisha / 30;
  const gross = Math.round(perDay * daysWorked);
  const otRatePerHour = (perDay / 8) * 2;
  const ot = Math.round(otRatePerHour * otHours);
  const net = gross + ot - deductionPoisha;
  return {
    basicPoisha: basic,
    houseRentPoisha: houseRent,
    medicalPoisha: medical,
    grossPoisha: gross,
    otPoisha: ot,
    netPoisha: net,
  };
}

export function getRun(db: Db, id: number): RunRow | null {
  return (db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(id) as RunRow | undefined) ?? null;
}

export function getRunByCode(db: Db, code: string): RunRow | null {
  return (db.prepare('SELECT * FROM payroll_runs WHERE code = ?').get(code) as RunRow | undefined) ?? null;
}

export function listRuns(db: Db): Array<RunRow & { factory_name: string }> {
  return db
    .prepare(
      `SELECT r.*, f.name AS factory_name FROM payroll_runs r
       JOIN factories f ON f.id = r.factory_id
       ORDER BY r.created_at DESC, r.id DESC`,
    )
    .all() as unknown as Array<RunRow & { factory_name: string }>;
}

export function getLines(db: Db, runId: number): WageLineRow[] {
  return db.prepare('SELECT * FROM wage_lines WHERE run_id = ? ORDER BY id ASC').all(runId) as unknown as WageLineRow[];
}

export function refreshTotals(db: Db, runId: number): void {
  const agg = db
    .prepare('SELECT COUNT(*) AS c, COALESCE(SUM(net_poisha), 0) AS s FROM wage_lines WHERE run_id = ?')
    .get(runId) as { c: number; s: number };
  db.prepare('UPDATE payroll_runs SET worker_count = ?, total_net_poisha = ? WHERE id = ?').run(
    Number(agg.c),
    Number(agg.s),
    runId,
  );
}

export function createPayrollRun(db: Db, factoryId: number, periodMonth: string, workingDays: number): RunRow {
  const factory = getFactory(db, factoryId);
  if (!factory) throw new Error('Factory not found');
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) throw new Error('periodMonth must look like 2026-10');
  if (!Number.isInteger(workingDays) || workingDays < 1 || workingDays > 31) {
    throw new Error('workingDays must be an integer between 1 and 31');
  }
  const workers = db
    .prepare('SELECT * FROM workers WHERE factory_id = ? AND active = 1 ORDER BY code')
    .all(factoryId) as unknown as Array<{ id: number; code: string; name: string; department: string; monthly_gross_poisha: number }>;
  if (workers.length === 0) throw new Error('Factory has no active workers');

  const seq = db.prepare('SELECT COUNT(*) AS c FROM payroll_runs WHERE period_month = ?').get(periodMonth) as { c: number };
  const code = `RUN-${periodMonth}-${String(Number(seq.c) + 1).padStart(3, '0')}`;
  const runId = Number(
    db
      .prepare(
        'INSERT INTO payroll_runs (code, factory_id, period_month, working_days, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(code, factoryId, periodMonth, workingDays, 'draft', nowIso()).lastInsertRowid,
  );
  const insertLine = db.prepare(
    `INSERT INTO wage_lines (run_id, worker_id, worker_code, worker_name, department, days_worked, ot_hours,
      basic_poisha, house_rent_poisha, medical_poisha, gross_poisha, ot_poisha, deduction_poisha, net_poisha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const worker of workers) {
    const wage = computeWage(worker.monthly_gross_poisha, workingDays, 0, 0);
    insertLine.run(
      runId,
      worker.id,
      worker.code,
      worker.name,
      worker.department,
      workingDays,
      0,
      wage.basicPoisha,
      wage.houseRentPoisha,
      wage.medicalPoisha,
      wage.grossPoisha,
      wage.otPoisha,
      0,
      wage.netPoisha,
    );
  }
  refreshTotals(db, runId);
  audit(db, 'payroll.create', 'payroll-run', code, {
    factory: factory.code,
    periodMonth,
    workingDays,
    workers: workers.length,
  });
  return getRun(db, runId)!;
}

export interface AttendanceEntry {
  workerCode: string;
  daysWorked: number;
  otHours: number;
  deductionPoisha?: number;
}

export function applyAttendance(db: Db, runId: number, entries: AttendanceEntry[]): { updated: number; unknown: string[] } {
  const run = getRun(db, runId);
  if (!run) throw new Error('Run not found');
  if (run.status !== 'draft') throw new Error('Attendance can only be edited while the run is in draft');
  const lines = getLines(db, runId);
  const byCode = new Map(lines.map((line) => [line.worker_code, line]));
  const unknown: string[] = [];
  let updated = 0;
  for (const entry of entries) {
    const line = byCode.get(entry.workerCode);
    if (!line) {
      unknown.push(entry.workerCode);
      continue;
    }
    const worker = db
      .prepare('SELECT monthly_gross_poisha FROM workers WHERE id = ?')
      .get(line.worker_id) as { monthly_gross_poisha: number } | undefined;
    if (!worker) {
      unknown.push(entry.workerCode);
      continue;
    }
    const days = Math.max(0, Math.min(31, Number(entry.daysWorked) || 0));
    const ot = Math.max(0, Math.min(200, Number(entry.otHours) || 0));
    const deduction = Math.max(0, Math.round(Number(entry.deductionPoisha) || 0));
    const wage = computeWage(worker.monthly_gross_poisha, days, ot, deduction);
    db.prepare(
      `UPDATE wage_lines SET days_worked = ?, ot_hours = ?, basic_poisha = ?, house_rent_poisha = ?,
        medical_poisha = ?, gross_poisha = ?, ot_poisha = ?, deduction_poisha = ?, net_poisha = ?
       WHERE id = ?`,
    ).run(
      days,
      ot,
      wage.basicPoisha,
      wage.houseRentPoisha,
      wage.medicalPoisha,
      wage.grossPoisha,
      wage.otPoisha,
      deduction,
      wage.netPoisha,
      line.id,
    );
    updated++;
  }
  refreshTotals(db, runId);
  audit(db, 'payroll.attendance', 'payroll-run', run.code, { updated, unknown });
  return { updated, unknown };
}

/** Attendance CSV: worker_code,days_worked,ot_hours,deduction_taka (header optional). */
export function parseAttendanceCsv(csv: string): AttendanceEntry[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const entries: AttendanceEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map((part) => part.trim());
    if (i === 0 && /worker/i.test(parts[0])) continue;
    const [workerCode, daysRaw, otRaw, deductionRaw] = parts;
    if (!workerCode) continue;
    entries.push({
      workerCode,
      daysWorked: Number(daysRaw ?? 0),
      otHours: Number(otRaw ?? 0),
      deductionPoisha: deductionRaw ? Math.round(Number(deductionRaw) * 100) : 0,
    });
  }
  return entries;
}

export function approveRun(db: Db, runId: number): RunRow {
  const run = getRun(db, runId);
  if (!run) throw new Error('Run not found');
  if (run.status !== 'draft') throw new Error(`Run is ${run.status}; only draft runs can be approved`);
  const at = nowIso();
  db.prepare('UPDATE payroll_runs SET status = ?, approved_at = ? WHERE id = ?').run('approved', at, runId);
  audit(db, 'payroll.approve', 'payroll-run', run.code, {
    totalNetPoisha: run.total_net_poisha,
    workers: run.worker_count,
  });
  return getRun(db, runId)!;
}

/**
 * The canonical record that gets hashed into the Merkle tree. Everything the
 * worker receipt shows must come from this object, so anyone can recompute.
 */
export function wageRecord(line: WageLineRow, run: RunRow, factory: FactoryRow): Record<string, unknown> {
  return {
    recordVersion: 1,
    factoryCode: factory.code,
    periodMonth: run.period_month,
    runCode: run.code,
    workerCode: line.worker_code,
    workerName: line.worker_name,
    department: line.department,
    currency: 'BDT',
    daysWorked: line.days_worked,
    otHours: line.ot_hours,
    basicPoisha: line.basic_poisha,
    houseRentPoisha: line.house_rent_poisha,
    medicalPoisha: line.medical_poisha,
    grossPoisha: line.gross_poisha,
    otPoisha: line.ot_poisha,
    deductionPoisha: line.deduction_poisha,
    netPoisha: line.net_poisha,
  };
}

export function buildRunRecords(
  db: Db,
  run: RunRow,
): { records: Array<Record<string, unknown>>; lines: WageLineRow[]; factory: FactoryRow } {
  const factory = getFactory(db, run.factory_id);
  if (!factory) throw new Error('Factory not found for run');
  const lines = getLines(db, run.id);
  return { records: lines.map((line) => wageRecord(line, run, factory)), lines, factory };
}

export function anchorRun(db: Db, runId: number): AnchorReceipt {
  const run = getRun(db, runId);
  if (!run) throw new Error('Run not found');
  if (run.status !== 'approved') throw new Error(`Run is ${run.status}; approve it before anchoring`);
  const { records, lines, factory } = buildRunRecords(db, run);
  const receipt = anchorRecords(db, 'payroll-run', run.code, records, {
    factory: factory.code,
    periodMonth: run.period_month,
    workerCount: lines.length,
    totalNetPoisha: run.total_net_poisha,
  });
  db.prepare('UPDATE payroll_runs SET status = ?, anchored_at = ? WHERE id = ?').run('anchored', receipt.createdAt, runId);
  audit(db, 'payroll.anchor', 'payroll-run', run.code, {
    blockIndex: receipt.blockIndex,
    merkleRoot: receipt.merkleRoot,
  });
  return receipt;
}

export function getRunAnchor(db: Db, run: RunRow): AnchorReceipt | null {
  return findAnchor(db, 'payroll-run', run.code);
}

export interface RunVerification {
  ok: boolean;
  checks: VerificationCheck[];
  anchor: AnchorReceipt | null;
  computedRoot: string;
  workerCount: number;
  totalNetPoisha: number;
}

export function verifyRun(db: Db, runId: number): RunVerification {
  const run = getRun(db, runId);
  if (!run) throw new Error('Run not found');
  const { records, lines } = buildRunRecords(db, run);
  const computedRoot = buildMerkleTree(records).root;
  const anchor = findAnchor(db, 'payroll-run', run.code);
  const chain = loadChain(db);
  const checks: VerificationCheck[] = [];

  checks.push({
    name: 'Wage lines recompute to the anchored Merkle root',
    ok: anchor !== null && computedRoot === anchor.merkleRoot,
    detail: anchor
      ? `recomputed ${computedRoot.slice(0, 16)}... vs anchored ${anchor.merkleRoot.slice(0, 16)}...`
      : 'no anchor found for this run',
  });
  const block = anchor ? chain[anchor.blockIndex] : undefined;
  checks.push({
    name: 'Anchor block present and matching the receipt',
    ok: Boolean(block && anchor && block.merkleRoot === anchor.merkleRoot && block.blockHash === anchor.blockHash),
    detail: block && anchor ? `block #${block.index}` : 'anchor block missing',
  });
  const chainCheck = verifyChain(chain);
  checks.push({
    name: 'Ledger chain integrity',
    ok: chainCheck.ok,
    detail: chainCheck.ok
      ? `${chain.length} block(s) verified end to end`
      : `${chainCheck.reason ?? 'broken chain'} (block #${chainCheck.brokenAt})`,
  });
  return {
    ok: checks.every((check) => check.ok),
    checks,
    anchor,
    computedRoot,
    workerCount: lines.length,
    totalNetPoisha: run.total_net_poisha,
  };
}

export interface WorkerProofBundle {
  record: Record<string, unknown>;
  proof: MerkleProofStep[];
  root: string;
  anchor: AnchorReceipt | null;
  lineIndex: number;
}

export function proofForWorker(db: Db, runId: number, workerCode: string): WorkerProofBundle {
  const run = getRun(db, runId);
  if (!run) throw new Error('Run not found');
  const { records } = buildRunRecords(db, run);
  const index = records.findIndex((record) => record['workerCode'] === workerCode);
  if (index === -1) throw new Error(`Worker '${workerCode}' not found in this run`);
  const tree = buildMerkleTree(records);
  return {
    record: records[index],
    proof: getMerkleProof(tree, index),
    root: tree.root,
    anchor: findAnchor(db, 'payroll-run', run.code),
    lineIndex: index,
  };
}

/** Payout file for MFS bulk disbursement (template format - adapt to your aggregator). */
export function payoutCsv(db: Db, runId: number): { filename: string; csv: string } {
  const run = getRun(db, runId);
  if (!run) throw new Error('Run not found');
  const rows = db
    .prepare(
      `SELECT l.*, w.mfs_number, w.phone FROM wage_lines l
       JOIN workers w ON w.id = l.worker_id
       WHERE l.run_id = ? ORDER BY l.id`,
    )
    .all(runId) as unknown as Array<WageLineRow & { mfs_number: string | null; phone: string }>;
  const lines = rows.map((line) => {
    const number = line.mfs_number ?? line.phone;
    const amount = (line.net_poisha / 100).toFixed(2);
    return `${line.worker_code},${line.worker_name},${number},${amount},WAGE-${run.period_month}-${line.worker_code}`;
  });
  const csv = '\uFEFF' + ['WorkerCode,RecipientName,MobileNumber,AmountBDT,Reference', ...lines].join('\r\n') + '\r\n';
  return { filename: `payout-${run.code}.csv`, csv };
}
