import { hashObject, type Hex } from './canonical.ts';
import { buildMerkleTree } from './merkle.ts';

export const GENESIS_PREV_HASH: Hex = '0'.repeat(64);

export interface LedgerBlock {
  index: number;
  createdAt: string;
  prevHash: Hex;
  merkleRoot: Hex;
  dataHash: Hex;
  blockHash: Hex;
  payload: unknown;
}

export interface ChainVerification {
  ok: boolean;
  brokenAt?: number;
  reason?: string;
}

function blockDigest(block: Pick<LedgerBlock, 'index' | 'createdAt' | 'prevHash' | 'merkleRoot' | 'dataHash'>): Hex {
  return hashObject({
    index: block.index,
    createdAt: block.createdAt,
    prevHash: block.prevHash,
    merkleRoot: block.merkleRoot,
    dataHash: block.dataHash,
  });
}

export function buildBlock(
  index: number,
  prevHash: Hex,
  records: unknown[],
  payload: unknown,
  createdAt: string = new Date().toISOString(),
): LedgerBlock {
  const merkleRoot = records.length > 0 ? buildMerkleTree(records).root : hashObject({ empty: true, count: 0 });
  const normalizedPayload = payload === undefined ? null : payload;
  const dataHash = hashObject(normalizedPayload);
  const block: LedgerBlock = {
    index,
    createdAt,
    prevHash,
    merkleRoot,
    dataHash,
    blockHash: '0'.repeat(64),
    payload: normalizedPayload,
  };
  block.blockHash = blockDigest(block);
  return block;
}

export function createGenesisBlock(createdAt: string = new Date().toISOString()): LedgerBlock {
  return buildBlock(0, GENESIS_PREV_HASH, [], { type: 'genesis', note: 'WageProof ledger genesis block' }, createdAt);
}

export function appendBlock(
  chain: LedgerBlock[],
  records: unknown[],
  payload: unknown,
  createdAt?: string,
): LedgerBlock {
  if (chain.length === 0) throw new Error('Chain is empty - create a genesis block first');
  const prev = chain[chain.length - 1];
  return buildBlock(prev.index + 1, prev.blockHash, records, payload, createdAt);
}

/**
 * Verify a whole chain: index sequence, prev-hash linkage, block digests and
 * payload integrity. Any edit to any stored field breaks verification at the
 * first tampered block.
 */
export function verifyChain(chain: LedgerBlock[]): ChainVerification {
  if (chain.length === 0) return { ok: false, reason: 'Empty chain' };
  for (let i = 0; i < chain.length; i++) {
    const block = chain[i];
    if (block.index !== i) {
      return { ok: false, brokenAt: i, reason: `Block index ${block.index} does not match position ${i}` };
    }
    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : chain[i - 1].blockHash;
    if (block.prevHash !== expectedPrev) {
      return { ok: false, brokenAt: i, reason: 'prevHash does not match the previous block' };
    }
    const expectedDataHash = hashObject(block.payload === undefined ? null : block.payload);
    if (expectedDataHash !== block.dataHash) {
      return { ok: false, brokenAt: i, reason: 'dataHash mismatch - payload was altered' };
    }
    if (blockDigest(block) !== block.blockHash) {
      return { ok: false, brokenAt: i, reason: 'blockHash mismatch - block header was altered' };
    }
  }
  return { ok: true };
}
