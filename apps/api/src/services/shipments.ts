import { buildMerkleTree, verifyChain } from '@wageproof/ledger-core';
import { audit, nowIso, type Db } from '../db.ts';
import type { AnchorReceipt, CustodyEventRow, ShipmentRow, VerificationCheck } from '../types.ts';
import { anchorRecords, loadChain } from './anchoring.ts';
import { getFactory } from './org.ts';

export const CUSTODY_STAGES = ['fabric-received', 'cutting', 'sewing', 'finishing', 'inspection', 'shipped'] as const;

export interface NewShipmentInput {
  factoryId: number;
  buyer: string;
  poNumber?: string;
  style?: string;
  destination?: string;
}

export function createShipment(db: Db, input: NewShipmentInput): ShipmentRow {
  const factory = getFactory(db, input.factoryId);
  if (!factory) throw new Error('Factory not found');
  if (!input.buyer || !input.buyer.trim()) throw new Error('buyer is required');
  const year = new Date().getFullYear();
  const seq = db.prepare('SELECT COUNT(*) AS c FROM shipments WHERE code LIKE ?').get(`SHP-${year}-%`) as { c: number };
  const code = `SHP-${year}-${String(Number(seq.c) + 1).padStart(4, '0')}`;
  const id = Number(
    db
      .prepare(
        'INSERT INTO shipments (code, factory_id, buyer, po_number, style, destination, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        code,
        input.factoryId,
        input.buyer.trim(),
        input.poNumber ?? null,
        input.style ?? null,
        input.destination ?? null,
        nowIso(),
      ).lastInsertRowid,
  );
  audit(db, 'shipment.create', 'shipment', code, { buyer: input.buyer });
  return getShipmentById(db, id)!;
}

export function getShipmentById(db: Db, id: number): ShipmentRow | null {
  return (db.prepare('SELECT * FROM shipments WHERE id = ?').get(id) as ShipmentRow | undefined) ?? null;
}

export function getShipmentByCode(db: Db, code: string): ShipmentRow | null {
  return (db.prepare('SELECT * FROM shipments WHERE code = ?').get(code) as ShipmentRow | undefined) ?? null;
}

export function listShipments(db: Db): Array<ShipmentRow & { factory_name: string; event_count: number }> {
  return db
    .prepare(
      `SELECT s.*, f.name AS factory_name,
        (SELECT COUNT(*) FROM custody_events e WHERE e.shipment_id = s.id) AS event_count
       FROM shipments s JOIN factories f ON f.id = s.factory_id
       ORDER BY s.created_at DESC, s.id DESC`,
    )
    .all() as unknown as Array<ShipmentRow & { factory_name: string; event_count: number }>;
}

export function getEvents(db: Db, shipmentId: number): CustodyEventRow[] {
  return db
    .prepare('SELECT * FROM custody_events WHERE shipment_id = ? ORDER BY id ASC')
    .all(shipmentId) as unknown as CustodyEventRow[];
}

export function custodyRecord(event: CustodyEventRow, shipment: ShipmentRow): Record<string, unknown> {
  return {
    recordVersion: 1,
    shipmentCode: shipment.code,
    buyer: shipment.buyer,
    stage: event.stage,
    location: event.location,
    actor: event.actor,
    quantity: event.quantity,
    note: event.note,
    occurredAt: event.created_at,
  };
}

export interface NewCustodyEventInput {
  stage: string;
  location?: string;
  actor?: string;
  quantity?: number;
  note?: string;
}

export function addCustodyEvent(
  db: Db,
  shipmentCode: string,
  input: NewCustodyEventInput,
): { event: CustodyEventRow; receipt: AnchorReceipt } {
  const shipment = getShipmentByCode(db, shipmentCode);
  if (!shipment) throw new Error('Shipment not found');
  if (!(CUSTODY_STAGES as readonly string[]).includes(input.stage)) {
    throw new Error(`Unknown stage '${input.stage}'. Use one of: ${CUSTODY_STAGES.join(', ')}`);
  }
  const createdAt = nowIso();
  const eventId = Number(
    db
      .prepare(
        'INSERT INTO custody_events (shipment_id, stage, location, actor, quantity, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        shipment.id,
        input.stage,
        input.location ?? null,
        input.actor ?? null,
        input.quantity ?? null,
        input.note ?? null,
        createdAt,
      ).lastInsertRowid,
  );
  const event = db.prepare('SELECT * FROM custody_events WHERE id = ?').get(eventId) as unknown as CustodyEventRow;
  const receipt = anchorRecords(db, 'shipment-event', `${shipment.code}:${eventId}`, [custodyRecord(event, shipment)], {
    shipmentCode: shipment.code,
    stage: event.stage,
  });
  db.prepare('UPDATE custody_events SET block_index = ? WHERE id = ?').run(receipt.blockIndex, eventId);
  audit(db, 'shipment.event', 'shipment', shipment.code, { stage: event.stage, blockIndex: receipt.blockIndex });
  return { event: { ...event, block_index: receipt.blockIndex }, receipt };
}

export interface ShipmentEventVerification {
  event: CustodyEventRow;
  valid: boolean;
  blockIndex: number | null;
}

export function verifyShipment(
  db: Db,
  shipmentCode: string,
): { ok: boolean; checks: VerificationCheck[]; events: ShipmentEventVerification[] } {
  const shipment = getShipmentByCode(db, shipmentCode);
  if (!shipment) throw new Error('Shipment not found');
  const events = getEvents(db, shipment.id);
  const chain = loadChain(db);
  const checks: VerificationCheck[] = [];

  const chainCheck = verifyChain(chain);
  checks.push({
    name: 'Ledger chain integrity',
    ok: chainCheck.ok,
    detail: chainCheck.ok ? `${chain.length} block(s) verified` : `${chainCheck.reason ?? 'broken chain'}`,
  });

  const eventResults: ShipmentEventVerification[] = events.map((event) => {
    const record = custodyRecord(event, shipment);
    const leafRoot = buildMerkleTree([record]).root;
    const block = event.block_index === null ? undefined : chain[event.block_index];
    return { event, valid: Boolean(block && block.merkleRoot === leafRoot), blockIndex: event.block_index };
  });
  const validCount = eventResults.filter((result) => result.valid).length;
  checks.push({
    name: 'All custody events match their anchored records',
    ok: eventResults.length > 0 && validCount === eventResults.length,
    detail: `${validCount}/${eventResults.length} events verified`,
  });

  return { ok: checks.every((check) => check.ok), checks, events: eventResults };
}
