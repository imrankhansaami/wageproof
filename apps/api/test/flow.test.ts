import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyMerkleProof } from '@wageproof/ledger-core';
import { buildServer } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';
import { createFactory, createWorker } from '../src/services/org.ts';
import { anchorRun, applyAttendance, approveRun, createPayrollRun, proofForWorker, verifyRun } from '../src/services/payroll.ts';

function setup() {
  const db = openDatabase(':memory:');
  const factory = createFactory(db, { code: 'TEST-FAC', name: 'Test Factory Ltd' });
  const workers = [
    { code: 'T-0001', name: 'Worker One', phone: '8801700000001', department: 'Sewing', monthlyGrossPoisha: 1500000 },
    { code: 'T-0002', name: 'Worker Two', phone: '8801700000002', department: 'Cutting', monthlyGrossPoisha: 1800000 },
    { code: 'T-0003', name: 'Worker Three', phone: '8801700000003', department: 'Finishing', monthlyGrossPoisha: 1200000 },
  ];
  for (const worker of workers) createWorker(db, { factoryId: factory.id, ...worker });
  const run = createPayrollRun(db, factory.id, '2026-10', 26);
  applyAttendance(db, run.id, [
    { workerCode: 'T-0001', daysWorked: 26, otHours: 10, deductionPoisha: 0 },
    { workerCode: 'T-0002', daysWorked: 24, otHours: 0, deductionPoisha: 50000 },
    { workerCode: 'T-0003', daysWorked: 25, otHours: 6, deductionPoisha: 0 },
  ]);
  approveRun(db, run.id);
  return { db, factory, run };
}

test('anchored payroll run verifies, then tampering is detected', () => {
  const { db, run } = setup();
  const receipt = anchorRun(db, run.id);
  assert.equal(receipt.leafCount, 3);

  const before = verifyRun(db, run.id);
  assert.equal(before.ok, true, JSON.stringify(before.checks));

  db.prepare('UPDATE wage_lines SET net_poisha = net_poisha + 100 WHERE run_id = ? AND worker_code = ?').run(
    run.id,
    'T-0002',
  );
  const after = verifyRun(db, run.id);
  assert.equal(after.ok, false);
  db.close();
});

test('worker Merkle proof verifies against the anchor root', () => {
  const { db, run } = setup();
  anchorRun(db, run.id);
  const bundle = proofForWorker(db, run.id, 'T-0003');
  assert.equal(verifyMerkleProof(bundle.record, bundle.proof, bundle.root), true);
  const tampered = { ...bundle.record, netPoisha: 1 };
  assert.equal(verifyMerkleProof(tampered, bundle.proof, bundle.root), false);
  db.close();
});

test('server smoke test: health, dashboard and non-public endpoints respond', async () => {
  const { db } = setup();
  const app = await buildServer(db);
  const health = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().ledger.ok, true);
  const dashboard = await app.inject({ method: 'GET', url: '/' });
  assert.equal(dashboard.statusCode, 200);
  const ledger = await app.inject({ method: 'GET', url: '/ledger' });
  assert.equal(ledger.statusCode, 200);
  await app.close();
  db.close();
});

test('full API flow: create run, attendance, approve, anchor, verify, proof', async () => {
  const { db, factory } = setup();
  const app = await buildServer(db);

  const created = await app.inject({
    method: 'POST',
    url: '/api/payroll-runs',
    payload: { factoryId: factory.id, periodMonth: '2026-11', workingDays: 26 },
  });
  assert.equal(created.statusCode, 201);
  const code = created.json().run.code as string;

  const attendance = await app.inject({
    method: 'POST',
    url: `/api/payroll-runs/${code}/attendance`,
    payload: { rows: [{ workerCode: 'T-0001', daysWorked: 26, otHours: 4 }] },
  });
  assert.equal(attendance.statusCode, 200);
  assert.equal(attendance.json().updated, 1);

  const approved = await app.inject({ method: 'POST', url: `/api/payroll-runs/${code}/approve` });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.json().run.status, 'approved');

  const anchored = await app.inject({ method: 'POST', url: `/api/payroll-runs/${code}/anchor` });
  assert.equal(anchored.statusCode, 200);
  assert.equal(anchored.json().run.status, 'anchored');

  const verified = await app.inject({ method: 'GET', url: `/api/payroll-runs/${code}/verify` });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.json().ok, true);

  const proof = await app.inject({ method: 'GET', url: `/api/payroll-runs/${code}/proof/T-0001` });
  assert.equal(proof.statusCode, 200);
  const bundle = proof.json() as { record: unknown; proof: unknown[]; root: string };

  const check = await app.inject({
    method: 'POST',
    url: '/api/verify/proof',
    payload: { record: bundle.record, proof: bundle.proof, root: bundle.root },
  });
  assert.equal(check.statusCode, 200);
  assert.equal(check.json().valid, true);

  await app.close();
  db.close();
});
