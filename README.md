# WageProof

Payroll proof and export-compliance rail for Bangladesh's RMG sector.

**WageProof** is the working name for two products that share one platform:

- **WageLedger** - tamper-evident payroll: a factory runs monthly payroll, the platform hashes every
  wage line into a Merkle tree, appends one block to a private hash-chain ledger, prints worker
  receipts with QR codes, and produces a payout CSV for MFS/bank bulk disbursement.
- **ExportPass** - shipment custody: every production stage (fabric received, cutting, sewing,
  finishing, inspection, shipped) is anchored as its own ledger block, building the audit trail
  that brand compliance teams and the EU's upcoming Digital Product Passport will demand.

No tokens, no coins, no crypto rails. Money moves through licensed channels (bank, MFS, PSP);
the ledger stores **hashes only**, never funds and never personal data.

## Quickstart

Requires **Node.js 22.5+** (uses the built-in `node:sqlite`). Tested on Node 26.

```bash
npm install
npm run seed     # builds a demo factory, 15 workers, an anchored October run, a draft run, a shipment
npm run dev      # starts at http://localhost:4000
```

Windows one-click: `scripts\setup.cmd` once, then `scripts\start.cmd`.

## Demo tour (after seeding)

| Page | What to look at |
| --- | --- |
| `http://localhost:4000/` | Dashboard: run list, ledger status, totals |
| `/runs/RUN-2026-10-001` | Anchored run: wage lines, anchor receipt, payout CSV link |
| `/receipt/RUN-2026-10-001/RMG-0001` | Worker receipt in Bangla with QR code (printable) |
| `/verify/run/RUN-2026-10-001?worker=RMG-0001` | All checks + the worker's 4-step Merkle proof |
| `/verify/tool` | Auditor tool: paste record + proof + root, recompute with no DB access |
| `/shipments/SHP-2026-0001` | ExportPass custody timeline, each event anchored |
| `/ledger` | Chain explorer - every block, hash and Merkle root |

Prove tamper detection yourself: run `npm run seed`, verify the run (passes), then edit any
`net_poisha` in `data/wageproof.db` with a SQLite tool and verify again (fails).

## Commands

```bash
npm run dev        # dev server with watch
npm run start      # plain server
npm run seed       # reset + reseed demo database
npm test           # ledger-core + API test suites
npm run typecheck  # strict TypeScript check
```

## How the trust works

1. Every wage line is serialized to a **canonical JSON record** (sorted keys, integer poisha, no floats).
2. Leaves are `SHA-256("00" + record)`, inner nodes `SHA-256("01" + left + right)` - domain-separated.
3. The 15 (or 15,000) leaves fold into one **Merkle root** (duplicate-last promotion for odd levels).
4. One block is appended: `blockHash = SHA-256(canonical(index, createdAt, prevHash, merkleRoot, dataHash))`.
5. Verification recomputes the root from the database rows and checks it against the anchor and the chain.
6. A worker's **inclusion proof** is ~log2(n) sibling hashes - an auditor can re-check it offline.

See `docs/ARCHITECTURE.md` for the full design and how to swap the local hash chain for
Hyperledger Fabric/Besu behind the same interface.

## Project layout

```
packages/ledger-core/   Pure ledger engine: canonical JSON, Merkle proofs, hash chain (tested)
apps/api/               Fastify API + server-rendered dashboard, SQLite store, seed data
  src/services/         anchoring, payroll, shipments, org
  src/routes/           JSON API (/api/*) and HTML routes
  src/ui/               pages, layout, Bangla/English receipt
docs/                   architecture and regulatory notes (read REGULATORY-NOTES.md before prod)
scripts/                setup.cmd and start.cmd for Windows
```

## Demo-grade, not production (yet)

- No login: anyone on the network can use the UI; API writes can be gated with `ADMIN_TOKEN`
  (see `.env.example`). Add real auth/roles before any pilot beyond localhost.
- `HOST=0.0.0.0` by default so you can open receipts from a phone on the same Wi-Fi -
  set `PUBLIC_URL=http://<your-ip>:4000` so QR codes point somewhere reachable.
- Payout CSV uses a generic format: adapt the header/template to your MFS aggregator's spec.
- Receipt pages are unauthenticated URLs; before a real pilot, add per-worker tokens.
- Keep **all personal data off-chain** and in-country - see `docs/REGULATORY-NOTES.md` (PDPA 2026).

Nothing here is legal advice; confirm every regulatory point with Bangladesh Bank and local counsel.
