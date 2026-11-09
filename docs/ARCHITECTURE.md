# Architecture

## Components

```
Browser (factory admin, worker receipt, auditor)
   |
Fastify server (apps/api)
   |-- HTML pages (server-rendered, Bangla + English)      src/ui/
   |-- JSON API  /api/*                                    src/routes/api.ts
   |-- Services: payroll, shipments, anchoring, org        src/services/
   |-- SQLite (node:sqlite, data/wageproof.db)             src/db.ts
   |
Ledger core (packages/ledger-core)  - pure functions, no I/O
   |-- canonical JSON + SHA-256
   |-- Merkle tree, inclusion proofs
   |-- hash chain: buildBlock / appendBlock / verifyChain
```

The ledger core is dependency-free and separately tested. The API persists blocks into
`ledger_blocks`, anchors into `anchors`, and operational data (workers, wage lines, custody
events) in their own tables.

## Data flow - payroll (WageLedger)

1. `createPayrollRun` snapshots the active worker roster into `wage_lines` with computed default wages.
2. `applyAttendance` (CSV paste or API rows) recomputes gross/OT/net per the documented formula:
   - basic 60%, house rent 30%, medical remainder of monthly gross
   - gross = monthly gross / 30 x days worked; OT = (monthly / 30 / 8) x 2 x hours
   - net = gross + OT - deduction; all amounts integer poisha
3. `approveRun` freezes the draft (attendance edits rejected afterwards).
4. `anchorRun`:
   - builds canonical records (see `wageRecord()`),
   - Merkle root over all records,
   - appends one block `{ type: payroll-run, refId, factory, periodMonth, workerCount, totalNetPoisha }`,
   - stores an `AnchorReceipt` (root, block index, block hash, timestamp).
5. Payout CSV is generated on demand from the frozen lines (template format).
6. Worker receipt page shows the record + QR linking to `/verify/run/:code?worker=:code`.

## Data flow - shipments (ExportPass)

Each stage adds a `custody_events` row, builds a one-record Merkle leaf, and appends its own
block (`type: shipment-event`, `refId: <code>:<eventId>`). The shipment page verifies every event
against its block and the whole chain.

## Ledger design

- **Canonical JSON**: keys sorted recursively; undefined dropped; numbers must be finite.
  Same logical value => same hash, regardless of key order or source.
- **Domain separation**: leaf `H("00" || canonical(record))`, node `H("01" || l || r)`,
  so a leaf can never be mistaken for an inner node.
- **Duplicate-last Merkle**: odd level promotes the last node by hashing it with itself
  (Bitcoin-style); proofs remain well-defined for all leaf counts.
- **Block digest**: `H(canonical({index, createdAt, prevHash, merkleRoot, dataHash}))`.
  `dataHash` binds the payload, `merkleRoot` binds the records.
- **verifyChain** checks index sequence, prevHash linkage, payload integrity and block digests.
  Any edit to any persisted field is reported at the first tampered block.

## What verification proves - and does not

Proves:
- The wage figures a worker/auditor sees recompute to the anchored Merkle root.
- That root is inside a specific block, linked into a chain that verifies end to end.
- Inclusion proofs are portable: record + proof + root is enough to re-check offline.

Does not prove (add later):
- That the factory reported *truthful* attendance - use supervisor attestations, CCTV/RFID feeds,
  or worker confirmations (SMS "confirm your pay") as additional signed evidence.
- That the payout actually landed - reconcile MFS settlement files against anchored lines
  (a `payout-reconciliation` block type fits the same pattern).

## Extending to Hyperledger Fabric / Besu

`anchorRecords()` is the single seam. Interface to implement:

```ts
interface AnchorBackend {
  anchor(refType, refId, records, payload): Promise<AnchorReceipt>;  // append + return receipt
  verifyAnchor(receipt): Promise<boolean>;                           // block exists + matches
  verifyChain(): Promise<ChainVerification>;
}
```

The SQLite hash chain is `AnchorBackend` #1 (local, free, works offline). A Fabric gateway adapter
is #2 for bank/consortium pilots; records stay off-chain (PDPA: personal data never leaves the
operational DB), only roots and metadata go on the distributed ledger. Because block hashes are
computed by ledger-core in both cases, receipts remain verifiable across backends.

## Storage schema (SQLite)

`factories, workers, payroll_runs, wage_lines, anchors, ledger_blocks, shipments, custody_events, audit_events`
- `wage_lines` / `custody_events` are the source records; `ledger_blocks` holds only hashes + payload metadata.
- `anchors` maps a business reference (run code / shipment event) to its block and root.
- `audit_events` logs every action (create, attendance, approve, anchor) for ops reviews.

## Next engineering steps

1. Auth: sessions + roles (factory admin, auditor, worker), per-receipt tokens.
2. SMS gateway (localhost SMS simulator first) for worker receipt links and pay confirmations.
3. MFS aggregator adapters: real payout file formats + settlement reconciliation blocks.
4. Attendance import from existing factory systems (Excel/CSV, biometric exports).
5. DPP module: per-order batch records, fibre composition, EU ESPR data fields, public passport page.
6. Fabric adapter + hosting plan (in-country DC, PDPA-compliant), backups for the operational DB.
