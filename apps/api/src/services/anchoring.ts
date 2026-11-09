import { appendBlock, createGenesisBlock, verifyChain, type LedgerBlock } from '@wageproof/ledger-core';
import { audit, nowIso, type Db } from '../db.ts';
import type { AnchorReceipt } from '../types.ts';

export function loadChain(db: Db): LedgerBlock[] {
  const rows = db
    .prepare(
      'SELECT block_index, created_at, prev_hash, merkle_root, data_hash, block_hash, payload_json FROM ledger_blocks ORDER BY block_index ASC',
    )
    .all() as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    index: Number(r.block_index),
    createdAt: String(r.created_at),
    prevHash: String(r.prev_hash),
    merkleRoot: String(r.merkle_root),
    dataHash: String(r.data_hash),
    blockHash: String(r.block_hash),
    payload: JSON.parse(String(r.payload_json)),
  }));
}

function insertBlock(db: Db, block: LedgerBlock): void {
  db.prepare(
    'INSERT INTO ledger_blocks (block_index, created_at, prev_hash, merkle_root, data_hash, block_hash, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(block.index, block.createdAt, block.prevHash, block.merkleRoot, block.dataHash, block.blockHash, JSON.stringify(block.payload));
}

export function ensureGenesis(db: Db): void {
  const row = db.prepare('SELECT COUNT(*) AS c FROM ledger_blocks').get() as { c: number };
  if (Number(row.c) > 0) return;
  const genesis = createGenesisBlock(nowIso());
  insertBlock(db, genesis);
  audit(db, 'ledger.genesis', 'ledger', null, { blockHash: genesis.blockHash });
}

/**
 * Append one block holding the Merkle root of `records` and a small payload.
 * Only hashes and non-personal metadata go on the chain; source records stay
 * in the operational database.
 */
export function anchorRecords(
  db: Db,
  refType: AnchorReceipt['refType'],
  refId: string,
  records: unknown[],
  payload: Record<string, unknown>,
): AnchorReceipt {
  ensureGenesis(db);
  const chain = loadChain(db);
  const block = appendBlock(chain, records, { ...payload, type: refType, refId }, nowIso());
  insertBlock(db, block);
  db.prepare(
    'INSERT INTO anchors (ref_type, ref_id, merkle_root, leaf_count, block_index, block_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(refType, refId, block.merkleRoot, records.length, block.index, block.blockHash, block.createdAt);
  audit(db, `anchor.${refType}`, refType, refId, { blockIndex: block.index, merkleRoot: block.merkleRoot });
  return {
    refType,
    refId,
    algorithm: 'sha256-merkle-chain-v1',
    merkleRoot: block.merkleRoot,
    leafCount: records.length,
    blockIndex: block.index,
    blockHash: block.blockHash,
    createdAt: block.createdAt,
  };
}

export function findAnchor(db: Db, refType: string, refId: string): AnchorReceipt | null {
  const row = db
    .prepare('SELECT * FROM anchors WHERE ref_type = ? AND ref_id = ? ORDER BY id DESC LIMIT 1')
    .get(refType, refId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    refType: row.ref_type as AnchorReceipt['refType'],
    refId: String(row.ref_id),
    algorithm: 'sha256-merkle-chain-v1',
    merkleRoot: String(row.merkle_root),
    leafCount: Number(row.leaf_count),
    blockIndex: Number(row.block_index),
    blockHash: String(row.block_hash),
    createdAt: String(row.created_at),
  };
}

export function verifyLedger(db: Db): { ok: boolean; height: number; brokenAt?: number; reason?: string } {
  const chain = loadChain(db);
  const result = verifyChain(chain);
  return { ...result, height: chain.length };
}
