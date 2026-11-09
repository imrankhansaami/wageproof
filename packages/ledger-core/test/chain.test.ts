import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGenesisBlock, appendBlock, verifyChain, GENESIS_PREV_HASH } from '../src/chain.ts';

function buildDemoChain() {
  const chain = [createGenesisBlock('2026-01-01T00:00:00.000Z')];
  chain.push(
    appendBlock(
      chain,
      [{ runId: 'RUN-1', workerCode: 'W-1', netPayPoisha: 100 }],
      { type: 'payroll-run', refId: 'RUN-1' },
      '2026-01-02T00:00:00.000Z',
    ),
  );
  chain.push(
    appendBlock(
      chain,
      [{ shipmentId: 'SHP-1', stage: 'sewing' }],
      { type: 'shipment-event', refId: 'SHP-1:1' },
      '2026-01-03T00:00:00.000Z',
    ),
  );
  return chain;
}

test('chain builds and verifies', () => {
  const chain = buildDemoChain();
  assert.equal(chain.length, 3);
  assert.equal(chain[0].prevHash, GENESIS_PREV_HASH);
  assert.equal(verifyChain(chain).ok, true);
});

test('tampering a block payload is detected', () => {
  const chain = buildDemoChain();
  chain[1].payload = { type: 'payroll-run', refId: 'RUN-1', altered: true };
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
});

test('tampering a merkle root is detected', () => {
  const chain = buildDemoChain();
  chain[1].merkleRoot = 'aa'.repeat(32);
  const result = verifyChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 1);
});

test('reordering blocks is detected', () => {
  const chain = buildDemoChain();
  const first = chain[1];
  chain[1] = chain[2];
  chain[2] = first;
  assert.equal(verifyChain(chain).ok, false);
});
