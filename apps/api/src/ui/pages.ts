import type { LedgerBlock } from '@wageproof/ledger-core';
import type { AnchorReceipt, FactoryRow, RunRow, VerificationCheck } from '../types.ts';
import type { WorkerProofBundle } from '../services/payroll.ts';
import { badge, esc, layout, periodLabel, shortHash, statusBadge, taka } from './layout.ts';

export function errorPage(message: string): string {
  return layout(
    'Error',
    '',
    `<h1>Something went wrong</h1>
<div class="notice bad">${esc(message)}</div>
<p><a class="btn ghost" href="/">Back to dashboard</a></p>`,
  );
}

export function verificationList(checks: VerificationCheck[]): string {
  return `<ul class="checks">${checks
    .map(
      (check) =>
        `<li class="${check.ok ? 'ok' : 'bad'}"><span class="mark">${check.ok ? '&#10003;' : '&#10007;'}</span><strong>${esc(check.name)}</strong><div class="sub">${esc(check.detail)}</div></li>`,
    )
    .join('')}</ul>`;
}

export function anchorCard(anchor: AnchorReceipt): string {
  return `<div class="card">
  <div class="kv">
    <div class="k">Merkle root</div><div class="mono">${esc(anchor.merkleRoot)}</div>
    <div class="k">Ledger block</div><div>#${anchor.blockIndex}</div>
    <div class="k">Block hash</div><div class="mono">${esc(anchor.blockHash)}</div>
    <div class="k">Anchored at</div><div>${esc(anchor.createdAt)}</div>
    <div class="k">Records in anchor</div><div>${anchor.leafCount}</div>
    <div class="k">Algorithm</div><div>${esc(anchor.algorithm)}</div>
  </div>
</div>`;
}

export interface DashboardData {
  factoryCount: number;
  workerCount: number;
  runCount: number;
  anchoredTotalPoisha: number;
  ledger: { ok: boolean; height: number; reason?: string; brokenAt?: number };
  runs: Array<RunRow & { factory_name: string }>;
  anchorsCount: number;
}

export function dashboardPage(data: DashboardData): string {
  const rows = data.runs
    .map(
      (run) => `<tr>
  <td><a href="/runs/${esc(run.code)}"><span class="mono">${esc(run.code)}</span></a></td>
  <td>${esc(run.factory_name)}</td>
  <td>${esc(periodLabel(run.period_month))}</td>
  <td>${statusBadge(run.status)}</td>
  <td>${run.worker_count}</td>
  <td>&#2547; ${taka(run.total_net_poisha)}</td>
  <td><a class="btn ghost" href="/runs/${esc(run.code)}">Open</a></td>
</tr>`,
    )
    .join('');

  const ledgerNotice = data.ledger.ok
    ? `<div class="notice ok">${badge('Verified', 'ok')} Chain of ${data.ledger.height} block(s) verified end to end. ${data.anchorsCount} anchor(s) recorded.</div>`
    : `<div class="notice bad">${badge('Broken', 'bad')} ${esc(data.ledger.reason ?? 'Chain verification failed')} at block #${data.ledger.brokenAt ?? '?'}.</div>`;

  return `<h1>WageProof dashboard</h1>
<p class="sub">Tamper-evident payroll records and shipment custody events, anchored on a private hash-chain ledger. No tokens, no crypto rails - just proofs people can verify.</p>
<div class="cards">
  <div class="card"><div class="k">Factories</div><div class="v">${data.factoryCount}</div></div>
  <div class="card"><div class="k">Workers</div><div class="v">${data.workerCount}</div></div>
  <div class="card"><div class="k">Payroll runs</div><div class="v">${data.runCount}</div></div>
  <div class="card"><div class="k">Wages anchored</div><div class="v">&#2547; ${taka(data.anchoredTotalPoisha)}</div></div>
</div>
<h2>Ledger status</h2>
${ledgerNotice}
<h2>Payroll runs</h2>
<table><thead><tr><th>Run</th><th>Factory</th><th>Period</th><th>Status</th><th>Workers</th><th>Total net</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7">No runs yet - run <span class="mono">npm run seed</span>.</td></tr>'}</tbody></table>
<h2>Try it</h2>
<div class="notice">Open an anchored run, print a <strong>worker receipt</strong> with its QR code, then check it on the <strong>verification</strong> page. The independent tool at <a href="/verify/tool">/verify/tool</a> re-checks a Merkle proof with no database access.</div>`;
}

export interface LedgerPageData {
  blocks: LedgerBlock[];
  verification: { ok: boolean; height: number; reason?: string; brokenAt?: number };
}

export function ledgerPage(data: LedgerPageData): string {
  const rows = data.blocks
    .map((block) => {
      const payload = block.payload as Record<string, unknown> | null;
      const type = payload && typeof payload.type === 'string' ? payload.type : '-';
      const refId = payload && typeof payload.refId === 'string' ? payload.refId : '';
      return `<tr>
  <td>#${block.index}</td>
  <td>${esc(block.createdAt)}</td>
  <td>${esc(type)}</td>
  <td class="mono">${esc(refId)}</td>
  <td class="mono">${esc(shortHash(block.merkleRoot))}</td>
  <td class="mono">${esc(shortHash(block.blockHash))}</td>
</tr>`;
    })
    .join('');
  const notice = data.verification.ok
    ? `<div class="notice ok">${badge('Verified', 'ok')} All ${data.verification.height} block(s) verified.</div>`
    : `<div class="notice bad">${badge('Broken', 'bad')} ${esc(data.verification.reason ?? 'verification failed')}</div>`;
  return `<h1>Ledger explorer</h1>
<p class="sub">Each block stores a Merkle root of wage or custody records plus a link to the previous block. Editing any stored record breaks the chain from that point on.</p>
${notice}
<table><thead><tr><th>#</th><th>Created</th><th>Type</th><th>Reference</th><th>Merkle root</th><th>Block hash</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export interface VerifyRunData {
  run: RunRow;
  factory: FactoryRow;
  verification: {
    ok: boolean;
    checks: VerificationCheck[];
    anchor: AnchorReceipt | null;
    computedRoot: string;
    workerCount: number;
    totalNetPoisha: number;
  };
  worker?: { code: string; bundle: WorkerProofBundle; proofValid: boolean };
  publicUrl: string;
}

export function verifyRunPage(data: VerifyRunData): string {
  const notice = data.verification.ok
    ? `<div class="notice ok">${badge('All checks passed', 'ok')} This run's wage records match the anchored Merkle root and the ledger is intact.</div>`
    : `<div class="notice bad">${badge('Verification failed', 'bad')} One or more checks failed - investigate before relying on this run.</div>`;

  const workerSection = data.worker
    ? `<h2>Worker inclusion proof - ${esc(data.worker.code)}</h2>
<div class="notice ${data.worker.proofValid ? 'ok' : 'bad'}">
  ${data.worker.proofValid ? badge('Proof valid', 'ok') : badge('Proof invalid', 'bad')}
  The ${data.worker.bundle.proof.length}-step Merkle proof folds this worker's record up to root
  <span class="mono">${esc(shortHash(data.worker.bundle.root, 20))}</span>. Anyone can repeat this with the record, the proof and the root - see <a href="/verify/tool">/verify/tool</a>.
</div>
<div class="cards">
  <div class="card"><div class="k">Record (hashed input)</div><pre>${esc(JSON.stringify(data.worker.bundle.record, null, 2))}</pre></div>
  <div class="card"><div class="k">Merkle proof</div><pre>${esc(JSON.stringify(data.worker.bundle.proof, null, 2))}</pre></div>
</div>`
    : '';

  return `<p class="sub"><a href="/runs/${esc(data.run.code)}">&larr; Back to run</a></p>
<h1>Verification - <span class="mono">${esc(data.run.code)}</span></h1>
<p class="sub">${esc(data.factory.name)} &middot; ${esc(periodLabel(data.run.period_month))} &middot; ${data.verification.workerCount} workers &middot; &#2547; ${taka(data.verification.totalNetPoisha)} net</p>
${notice}
${verificationList(data.verification.checks)}
<h2>Anchor receipt</h2>
${data.verification.anchor ? anchorCard(data.verification.anchor) : '<div class="notice warn">This run is not anchored yet.</div>'}
${workerSection}`;
}

export interface VerifyToolData {
  payload?: string;
  result?: { valid?: boolean; error?: string };
}

export function verifyToolPage(data: VerifyToolData): string {
  const resultNotice = data.result
    ? data.result.error
      ? `<div class="notice bad">Could not check: ${esc(data.result.error)}</div>`
      : data.result.valid
        ? `<div class="notice ok">${badge('Valid', 'ok')} The record folds to exactly the published root. The proof holds.</div>`
        : `<div class="notice bad">${badge('Invalid', 'bad')} The record does NOT fold to the published root. Either the record or proof was altered.</div>`
    : '';
  return `<h1>Independent proof check</h1>
<p class="sub">Auditor tool: paste a JSON bundle with a <span class="mono">record</span>, its <span class="mono">proof</span> and the published <span class="mono">root</span>. This page recomputes SHA-256 hashes with no database access.</p>
${resultNotice}
<form method="post" action="/verify/tool">
  <label for="payload">JSON bundle</label>
  <textarea id="payload" name="payload" rows="14" spellcheck="false">${esc(data.payload ?? '')}</textarea>
  <p><button type="submit">Verify proof</button></p>
</form>`;
}
