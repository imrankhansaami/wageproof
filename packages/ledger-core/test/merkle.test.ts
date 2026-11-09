import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMerkleTree, getMerkleProof, verifyMerkleProof, hashLeaf } from '../src/merkle.ts';

const records = [
  { workerCode: 'W-1', netPayPoisha: 1250000 },
  { workerCode: 'W-2', netPayPoisha: 1387500 },
  { workerCode: 'W-3', netPayPoisha: 991250 },
];

test('single record: root equals leaf and proof is empty', () => {
  const tree = buildMerkleTree([records[0]]);
  assert.equal(tree.root, hashLeaf(records[0]));
  const proof = getMerkleProof(tree, 0);
  assert.deepEqual(proof, []);
  assert.equal(verifyMerkleProof(records[0], proof, tree.root), true);
});

test('every leaf has a valid proof', () => {
  const tree = buildMerkleTree(records);
  for (let i = 0; i < records.length; i++) {
    const proof = getMerkleProof(tree, i);
    assert.equal(verifyMerkleProof(records[i], proof, tree.root), true, `leaf ${i}`);
  }
});

test('tampered record fails verification', () => {
  const tree = buildMerkleTree(records);
  const proof = getMerkleProof(tree, 1);
  const tampered = { ...records[1], netPayPoisha: 9999999 };
  assert.equal(verifyMerkleProof(tampered, proof, tree.root), false);
});

test('tampered proof fails verification', () => {
  const tree = buildMerkleTree(records);
  const proof = getMerkleProof(tree, 2);
  proof[0] = { position: proof[0].position, hash: 'ab'.repeat(32) };
  assert.equal(verifyMerkleProof(records[2], proof, tree.root), false);
});

test('empty input is rejected', () => {
  assert.throws(() => buildMerkleTree([]));
});

test('odd leaf counts work at multiple levels', () => {
  const five = [1, 2, 3, 4, 5].map((n) => ({ n }));
  const tree = buildMerkleTree(five);
  for (let i = 0; i < five.length; i++) {
    assert.equal(verifyMerkleProof(five[i], getMerkleProof(tree, i), tree.root), true, `leaf ${i}`);
  }
});
