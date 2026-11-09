import type { FastifyInstance, FastifyReply } from 'fastify';
import QRCode from 'qrcode';
import { verifyMerkleProof, type MerkleProofStep } from '@wageproof/ledger-core';
import { config } from '../config.ts';
import { HttpError } from '../errors.ts';
import type { Db } from '../db.ts';
import { findAnchor, loadChain, verifyLedger } from '../services/anchoring.ts';
import * as org from '../services/org.ts';
import * as payroll from '../services/payroll.ts';
import * as shipmentService from '../services/shipments.ts';
import { layout } from '../ui/layout.ts';
import { dashboardPage, ledgerPage, verifyRunPage, verifyToolPage, type VerifyRunData } from '../ui/pages.ts';
import { receiptPage, runPage } from '../ui/run.ts';
import { shipmentDetailPage, shipmentsPage } from '../ui/shipments.ts';

export function registerPageRoutes(app: FastifyInstance, db: Db): void {
  const runOr404 = (code: string) => {
    const run = payroll.getRunByCode(db, code);
    if (!run) throw new HttpError(404, `Payroll run '${code}' not found`);
    return run;
  };
  const factoryOr404 = (id: number) => {
    const factory = org.getFactory(db, id);
    if (!factory) throw new HttpError(404, 'Factory not found');
    return factory;
  };
  const html = (reply: FastifyReply, body: string) => reply.type('text/html; charset=utf-8').send(body);

  app.get('/', async (_request, reply) => {
    const count = (sql: string) => Number((db.prepare(sql).get() as { c: number }).c);
    const anchoredTotal = Number(
      (db.prepare("SELECT COALESCE(SUM(total_net_poisha), 0) AS s FROM payroll_runs WHERE status = 'anchored'").get() as { s: number }).s,
    );
    const body = dashboardPage({
      factoryCount: count('SELECT COUNT(*) AS c FROM factories'),
      workerCount: count('SELECT COUNT(*) AS c FROM workers WHERE active = 1'),
      runCount: count('SELECT COUNT(*) AS c FROM payroll_runs'),
      anchorsCount: count('SELECT COUNT(*) AS c FROM anchors'),
      anchoredTotalPoisha: anchoredTotal,
      ledger: verifyLedger(db),
      runs: payroll.listRuns(db),
    });
    return html(reply, layout('Dashboard', '/', body));
  });

  app.get('/ledger', async (_request, reply) => {
    const body = ledgerPage({ blocks: loadChain(db), verification: verifyLedger(db) });
    return html(reply, layout('Ledger', '/ledger', body));
  });

  app.get('/runs/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    const factory = factoryOr404(run.factory_id);
    const query = request.query as Record<string, string | undefined>;
    let notice: string | undefined;
    if (query.saved) notice = `Attendance saved for ${query.saved} worker(s).${query.unknown ? ` Unknown worker codes: ${query.unknown}` : ''}`;
    if (query.approved) notice = 'Run approved. You can anchor it now.';
    if (query.anchored) notice = 'Run anchored on the ledger. Receipts are live.';
    const body = runPage({
      run,
      factory,
      lines: payroll.getLines(db, run.id),
      anchor: findAnchor(db, 'payroll-run', run.code),
      notice,
    });
    return html(reply, layout(run.code, '', body));
  });

  app.post('/runs/:code/attendance', async (request, reply) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    const body = request.body as { attendance?: string };
    const entries = payroll.parseAttendanceCsv(body.attendance ?? '');
    const result = payroll.applyAttendance(db, run.id, entries);
    const unknownPart = result.unknown.length > 0 ? `&unknown=${encodeURIComponent(result.unknown.join(','))}` : '';
    return reply.redirect(`/runs/${encodeURIComponent(code)}?saved=${result.updated}${unknownPart}`);
  });

  app.post('/runs/:code/approve', async (request, reply) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    payroll.approveRun(db, run.id);
    return reply.redirect(`/runs/${encodeURIComponent(code)}?approved=1`);
  });

  app.post('/runs/:code/anchor', async (request, reply) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    payroll.anchorRun(db, run.id);
    return reply.redirect(`/runs/${encodeURIComponent(code)}?anchored=1`);
  });

  app.get('/receipt/:code/:workerCode', async (request, reply) => {
    const { code, workerCode } = request.params as { code: string; workerCode: string };
    const run = runOr404(code);
    const factory = factoryOr404(run.factory_id);
    const line = payroll.getLines(db, run.id).find((item) => item.worker_code === workerCode);
    if (!line) throw new HttpError(404, `Worker '${workerCode}' not found in this run`);
    const anchor = findAnchor(db, 'payroll-run', run.code);
    const verifyUrl = `${config.publicUrl}/verify/run/${run.code}?worker=${encodeURIComponent(workerCode)}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 1 });
    const body = receiptPage({ run, factory, line, anchor, qrDataUrl, verifyUrl });
    return html(reply, layout(`Receipt ${workerCode}`, '', body));
  });

  app.get('/verify/run/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const run = runOr404(code);
    const factory = factoryOr404(run.factory_id);
    const verification = payroll.verifyRun(db, run.id);
    const query = request.query as Record<string, string | undefined>;
    let worker: VerifyRunData['worker'];
    if (query.worker) {
      const bundle = payroll.proofForWorker(db, run.id, query.worker);
      const proofValid = verifyMerkleProof(bundle.record, bundle.proof, bundle.root);
      worker = { code: query.worker, bundle, proofValid };
    }
    const body = verifyRunPage({ run, factory, verification, worker, publicUrl: config.publicUrl });
    return html(reply, layout(`Verify ${code}`, '', body));
  });

  app.get('/verify/tool', async (_request, reply) => {
    let payload = '';
    const anchoredRun = payroll.listRuns(db).find((run) => run.status === 'anchored');
    if (anchoredRun) {
      const lines = payroll.getLines(db, anchoredRun.id);
      if (lines.length > 0) {
        const bundle = payroll.proofForWorker(db, anchoredRun.id, lines[0].worker_code);
        payload = JSON.stringify({ record: bundle.record, proof: bundle.proof, root: bundle.root }, null, 2);
      }
    }
    const body = verifyToolPage({ payload });
    return html(reply, layout('Proof check', '', body));
  });

  app.post('/verify/tool', async (request, reply) => {
    const body = request.body as { payload?: string };
    const payload = body.payload ?? '';
    let result: { valid?: boolean; error?: string };
    try {
      const parsed = JSON.parse(payload) as { record?: unknown; proof?: unknown; root?: unknown };
      if (parsed.record === undefined || !Array.isArray(parsed.proof) || typeof parsed.root !== 'string') {
        throw new Error('Expected an object with "record", "proof" and "root"');
      }
      result = { valid: verifyMerkleProof(parsed.record, parsed.proof as MerkleProofStep[], parsed.root) };
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    const pageBody = verifyToolPage({ payload, result });
    return html(reply, layout('Proof check', '', pageBody));
  });

  app.get('/shipments', async (_request, reply) => {
    const body = shipmentsPage({
      shipments: shipmentService.listShipments(db),
      factories: org.listFactories(db),
    });
    return html(reply, layout('Shipments', '/shipments', body));
  });

  app.post('/shipments', async (request, reply) => {
    const body = request.body as {
      factoryId?: string;
      buyer?: string;
      poNumber?: string;
      style?: string;
      destination?: string;
    };
    if (!body.factoryId || !body.buyer) throw new HttpError(400, 'factoryId and buyer are required');
    const shipment = shipmentService.createShipment(db, {
      factoryId: Number(body.factoryId),
      buyer: body.buyer,
      poNumber: body.poNumber || undefined,
      style: body.style || undefined,
      destination: body.destination || undefined,
    });
    return reply.redirect(`/shipments/${encodeURIComponent(shipment.code)}?created=1`);
  });

  app.get('/shipments/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const shipment = shipmentService.getShipmentByCode(db, code);
    if (!shipment) throw new HttpError(404, `Shipment '${code}' not found`);
    const factory = factoryOr404(shipment.factory_id);
    const verification = shipmentService.verifyShipment(db, code);
    const query = request.query as Record<string, string | undefined>;
    const notice = query.created ? 'Shipment created.' : query.added ? 'Custody event anchored to the ledger.' : undefined;
    const body = shipmentDetailPage({
      shipment,
      factory,
      events: verification.events,
      checks: verification.checks,
      notice,
    });
    return html(reply, layout(shipment.code, '/shipments', body));
  });

  app.post('/shipments/:code/events', async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as { stage?: string; location?: string; actor?: string; quantity?: string; note?: string };
    if (!body.stage) throw new HttpError(400, 'stage is required');
    shipmentService.addCustodyEvent(db, code, {
      stage: body.stage,
      location: body.location || undefined,
      actor: body.actor || undefined,
      quantity: body.quantity ? Number(body.quantity) : undefined,
      note: body.note || undefined,
    });
    return reply.redirect(`/shipments/${encodeURIComponent(code)}?added=1`);
  });
}
