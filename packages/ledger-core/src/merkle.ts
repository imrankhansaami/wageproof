import { canonicalize, sha256Hex, type Hex } from './canonical.ts';

export interface MerkleProofStep {
  /** Where the sibling hash sits relative to the current node while folding upward. */
  position: 'left' | 'right';
  hash: Hex;
}

export interface MerkleTree {
  root: Hex;
  leaves: Hex[];
  /** layers[0] is the leaf layer; the last layer holds the root. */
  layers: Hex[][];
}

// Domain separation: leaves and inner nodes are hashed with different prefixes,
// so a leaf hash can never be confused with an inner node hash.
const LEAF_PREFIX = '00';
const NODE_PREFIX = '01';

export function hashLeaf(record: unknown): Hex {
  return sha256Hex(LEAF_PREFIX + canonicalize(record));
}

export function hashNode(left: Hex, right: Hex): Hex {
  return sha256Hex(NODE_PREFIX + left + right);
}

/**
 * Bitcoin-style Merkle tree with "duplicate the last node" promotion for odd
 * levels. Deterministic for a given ordered list of records.
 */
export function buildMerkleTree(records: unknown[]): MerkleTree {
  if (records.length === 0) throw new Error('Cannot build a Merkle tree with zero records');
  const leaves = records.map(hashLeaf);
  const layers: Hex[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : left;
      next.push(hashNode(left, right));
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], leaves, layers };
}

export function getMerkleProof(tree: MerkleTree, leafIndex: number): MerkleProofStep[] {
  if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
    throw new Error('leafIndex out of range');
  }
  const proof: MerkleProofStep[] = [];
  let idx = leafIndex;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level];
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const sibling = siblingIdx < layer.length ? layer[siblingIdx] : layer[idx];
    proof.push({ position: idx % 2 === 0 ? 'right' : 'left', hash: sibling });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/**
 * Recompute a record's inclusion proof from scratch. An auditor needs only the
 * record, the proof and the published root - no database access.
 */
export function verifyMerkleProof(record: unknown, proof: MerkleProofStep[], root: Hex): boolean {
  let hash = hashLeaf(record);
  for (const step of proof) {
    hash = step.position === 'left' ? hashNode(step.hash, hash) : hashNode(hash, step.hash);
  }
  return hash === root;
}
