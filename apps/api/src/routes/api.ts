import type { FastifyInstance } from 'fastify';
import { verifyMerkleProof, type MerkleProofStep } from '@wageproof/ledger-core';
import { HttpError } from '../errors.ts';
import type { Db } from '../db.ts';
import { loadChain, verifyLedger } from '../services/anchoring.ts';
import * as org from '../services/org.ts';
import * as payroll from '../services/payroll.ts';
import * as shipmentService from '../services/shipments.ts';

export function registerApiRoutes(app: FastifyInstance, db: Db): void {
  const runOr404 = (code: string) => {
    const run = payroll.getRunByCode(db, code);
    if (!run) throw new HttpError(404, `Payroll run '${code}' not found`);
    return run;
  };
  const shipmentOr404 = (code: string) => {
    const shipment = shipmentService.getShipmentByCode(db, code);
    if (!shipment) throw new HttpError(404, `Shipment '${code}' not found`);
    return shipment;
  };

  app.get('/api/health', async () => {
    const ledger = verifyLedger(db);
    return { ok: true, ledger };
  });

  app.get('/api/factories', async () => ({ factories: org.listFactories(db) }));

  app.get('/api/factories/:id/workers', async (request) => {
    const params = request.params as { id: string };
    return { workers: org.listWorkers(db, Number(params.id)) };
  });

  app.get('/api/payroll-runs', async () => ({ runs: payroll.listRuns(db) }));

  app.post('/api/payroll-runs', async (request, reply) => {
    const body = (request.body ?? {}) as { factoryId?: number; periodMonth?: string; workingDays?: number };
    if (body.factoryId === undefined || !body.periodMonth) {
      throw new HttpError(400, 'factoryId and periodMonth are required');
    }
    const run = payroll.createPayrollRun(db, Number(body.factoryId), String(body.periodMonth), Number(body.workingDays ?? 30));
    return reply.code(201).send({ run });
  });

  app.get('/api/payroll-runs/:code', async (request) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    return { run, lines: payroll.getLines(db, run.id), anchor: payroll.getRunAnchor(db, run) };
  });

  app.post('/api/payroll-runs/:code/attendance', async (request) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    const body = (request.body ?? {}) as { rows?: payroll.AttendanceEntry[]; csv?: string };
    const entries = body.csv ? payroll.parseAttendanceCsv(body.csv) : (body.rows ?? []);
    if (!Array.isArray(entries) || entries.length === 0) throw new HttpError(400, 'Provide rows[] or csv');
    return payroll.applyAttendance(db, run.id, entries);
  });

  app.post('/api/payroll-runs/:code/approve', async (request) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    return { run: payroll.approveRun(db, run.id) };
  });

  app.post('/api/payroll-runs/:code/anchor', async (request) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    return { receipt: payroll.anchorRun(db, run.id), run: payroll.getRun(db, run.id) };
  });

  app.get('/api/payroll-runs/:code/payout.csv', async (request, reply) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    const { filename, csv } = payroll.payoutCsv(db, run.id);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(csv);
  });

  app.get('/api/payroll-runs/:code/verify', async (request) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    return payroll.verifyRun(db, run.id);
  });

  app.get('/api/payroll-runs/:code/proof/:workerCode', async (request) => {
    const { code, workerCode } = request.params as { code: string; workerCode: string };
    const run = runOr404(code);
    return payroll.proofForWorker(db, run.id, workerCode);
  });

  app.post('/api/verify/proof', async (request) => {
    const body = (request.body ?? {}) as { record?: unknown; proof?: MerkleProofStep[]; root?: string };
    if (body.record === undefined || !Array.isArray(body.proof) || typeof body.root !== 'string') {
      throw new HttpError(400, 'Body must include record, proof[] and root');
    }
    return { valid: verifyMerkleProof(body.record, body.proof, body.root) };
  });

  app.get('/api/ledger', async () => ({ blocks: loadChain(db) }));

  app.get('/api/ledger/verify', async () => verifyLedger(db));

  app.get('/api/shipments', async () => ({ shipments: shipmentService.listShipments(db) }));

  app.post('/api/shipments', async (request, reply) => {
    const body = (request.body ?? {}) as {
      factoryId?: number;
      buyer?: string;
      poNumber?: string;
      style?: string;
      destination?: string;
    };
    if (body.factoryId === undefined || !body.buyer) throw new HttpError(400, 'factoryId and buyer are required');
    const shipment = shipmentService.createShipment(db, {
      factoryId: Number(body.factoryId),
      buyer: String(body.buyer),
      poNumber: body.poNumber,
      style: body.style,
      destination: body.destination,
    });
    return reply.code(201).send({ shipment });
  });

  app.get('/api/shipments/:code', async (request) => {
    const { code } = request.params as { code: string };
    const shipment = shipmentOr404(code);
    return { shipment, events: shipmentService.getEvents(db, shipment.id) };
  });

  app.post('/api/shipments/:code/events', async (request, reply) => {
    const { code } = request.params as { code: string };
    shipmentOr404(code);
    const body = (request.body ?? {}) as {
      stage?: string;
      location?: string;
      actor?: string;
      quantity?: number;
      note?: string;
    };
    if (!body.stage) throw new HttpError(400, 'stage is required');
    const result = shipmentService.addCustodyEvent(db, code, {
      stage: body.stage,
      location: body.location,
      actor: body.actor,
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      note: body.note,
    });
    return reply.code(201).send(result);
  });

  app.get('/api/shipments/:code/verify', async (request) => {
    const { code } = request.params as { code: string };
    shipmentOr404(code);
    return shipmentService.verifyShipment(db, code);
  });
}
