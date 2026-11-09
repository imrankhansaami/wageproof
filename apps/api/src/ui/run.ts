import type { AnchorReceipt, FactoryRow, RunRow, WageLineRow } from '../types.ts';
import { anchorCard } from './pages.ts';
import { badge, esc, layout, periodLabel, shortHash, statusBadge, taka, takaBn } from './layout.ts';

export interface RunPageData {
  run: RunRow;
  factory: FactoryRow;
  lines: WageLineRow[];
  anchor: AnchorReceipt | null;
  notice?: string;
}

export function runPage(data: RunPageData): string {
  const { run, factory, lines, anchor } = data;

  const lineRows = lines
    .map(
      (line) => `<tr>
  <td class="mono">${esc(line.worker_code)}</td>
  <td>${esc(line.worker_name)}</td>
  <td>${esc(line.department)}</td>
  <td>${line.days_worked}</td>
  <td>${line.ot_hours}</td>
  <td>${taka(line.gross_poisha)}</td>
  <td>${taka(line.ot_poisha)}</td>
  <td>${taka(line.deduction_poisha)}</td>
  <td><strong>${taka(line.net_poisha)}</strong></td>
  <td><a class="btn ghost" href="/receipt/${esc(run.code)}/${esc(line.worker_code)}">Receipt</a></td>
</tr>`,
    )
    .join('');

  let actions = '';
  if (run.status === 'draft') {
    actions = `
<h2>Attendance</h2>
<div class="card">
  <form method="post" action="/runs/${esc(run.code)}/attendance">
    <label for="attendance">Paste attendance CSV - worker_code,days_worked,ot_hours,deduction_taka (header optional)</label>
    <textarea id="attendance" name="attendance" rows="6" spellcheck="false" placeholder="RMG-0001,26,10,0&#10;RMG-0002,24,4,500"></textarea>
    <p class="sub">Workers you leave out keep their current values. Formula: gross = monthly/30 &times; days; OT = (monthly/30/8) &times; 2 &times; hours.</p>
    <button type="submit">Save attendance</button>
  </form>
</div>
<h2>Approve</h2>
<div class="card">
  <p class="sub">Approval freezes the figures. Anchoring happens after approval.</p>
  <form method="post" action="/runs/${esc(run.code)}/approve">
    <button type="submit">Approve run</button>
  </form>
</div>`;
  } else if (run.status === 'approved') {
    actions = `
<h2>Anchor on ledger</h2>
<div class="card">
  <p class="sub">This hashes every wage line into a Merkle tree and appends one block to the ledger. After this, any edit to any line breaks verification.</p>
  <form method="post" action="/runs/${esc(run.code)}/anchor">
    <button type="submit">Anchor run</button>
  </form>
</div>`;
  } else {
    actions = `
<h2>Actions</h2>
<div class="row no-print">
  <a class="btn" href="/verify/run/${esc(run.code)}">Verify now</a>
  <a class="btn sec" href="/api/payroll-runs/${esc(run.code)}/payout.csv">Download payout CSV</a>
  <a class="btn ghost" href="/ledger">Open ledger</a>
</div>`;
  }

  return `<p class="sub"><a href="/">&larr; Dashboard</a></p>
<h1>Payroll run <span class="mono">${esc(run.code)}</span> ${statusBadge(run.status)}</h1>
<p class="sub">${esc(factory.name)}${factory.name_bn ? ' (' + esc(factory.name_bn) + ')' : ''} &middot; ${esc(periodLabel(run.period_month))} &middot; ${run.working_days} working days</p>
${data.notice ? `<div class="notice ok">${esc(data.notice)}</div>` : ''}
<div class="cards">
  <div class="card"><div class="k">Workers</div><div class="v">${run.worker_count}</div></div>
  <div class="card"><div class="k">Total net pay</div><div class="v">&#2547; ${taka(run.total_net_poisha)}</div></div>
  <div class="card"><div class="k">Created</div><div class="v" style="font-size:14px">${esc(run.created_at.slice(0, 16).replace('T', ' '))}</div></div>
  <div class="card"><div class="k">Anchored</div><div class="v" style="font-size:14px">${run.anchored_at ? esc(run.anchored_at.slice(0, 16).replace('T', ' ')) : '-'}</div></div>
</div>
${actions}
${anchor ? `<h2>Anchor receipt</h2>${anchorCard(anchor)}` : ''}
<h2>Wage lines</h2>
<table>
<thead><tr><th>Code</th><th>Name</th><th>Dept</th><th>Days</th><th>OT h</th><th>Gross</th><th>OT pay</th><th>Deduction</th><th>Net</th><th></th></tr></thead>
<tbody>${lineRows}</tbody>
</table>
<p class="sub">Amounts in BDT. <span class="no-print">Receipts are QR-verifiable; the payout CSV follows a generic MFS bulk format to adapt to your aggregator.</span></p>`;
}

export interface ReceiptPageData {
  run: RunRow;
  factory: FactoryRow;
  line: WageLineRow;
  anchor: AnchorReceipt | null;
  qrDataUrl: string;
  verifyUrl: string;
}

export function receiptPage(data: ReceiptPageData): string {
  const { run, factory, line, anchor } = data;
  const periodEn = periodLabel(run.period_month);
  const periodBn = periodLabel(run.period_month, 'bn-BD');
  return `<div class="card" style="max-width:640px;margin:0 auto">
<h1 style="margin-bottom:2px">&#2478;&#2460;&#2497;&#2480;&#2495; &#2480;&#2488;&#2495;&#2470; / Wage receipt</h1>
<p class="sub">${esc(factory.name_bn ?? factory.name)} &middot; ${esc(periodBn)} / ${esc(periodEn)}</p>
<div class="receipt-grid">
  <div class="k">&#2453;&#2480;&#2509;&#2478;&#2496; / Worker</div><div><strong>${esc(line.worker_name)}</strong> <span class="mono">(${esc(line.worker_code)})</span></div>
  <div class="k">&#2476;&#2495;&#2477;&#2494;&#2455; / Department</div><div>${esc(line.department)}</div>
  <div class="k">&#2453;&#2494;&#2460;&#2503;&#2480; &#2470;&#2495;&#2472; / Days worked</div><div>${line.days_worked}</div>
  <div class="k">&#2451;&#2477;&#2494;&#2480;&#2463;&#2494;&#2439;&#2478; / OT hours</div><div>${line.ot_hours}</div>
  <div class="k">&#2478;&#2498;&#2482; &#2476;&#2503;&#2468;&#2472; / Basic</div><div>&#2547; ${taka(line.basic_poisha)}</div>
  <div class="k">&#2476;&#2494;&#2488;&#2494; &#2477;&#2494;&#2524;&#2494; / House rent</div><div>&#2547; ${taka(line.house_rent_poisha)}</div>
  <div class="k">&#2455;&#2509;&#2480;&#2488; &#2474;&#2503; / Gross pay</div><div>&#2547; ${taka(line.gross_poisha)}</div>
  <div class="k">&#2451;&#2477;&#2494;&#2480;&#2463;&#2494;&#2439;&#2478; / OT pay</div><div>&#2547; ${taka(line.ot_poisha)}</div>
  <div class="k">&#2453;&#2480;&#2509;&#2468;&#2472; / Deduction</div><div>&#2547; ${taka(line.deduction_poisha)}</div>
</div>
<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
<div class="receipt-grid">
  <div class="k">&#2478;&#2507;&#2463; / Total</div><div class="receipt-net">&#2547; ${takaBn(line.net_poisha)}</div>
</div>
<div class="row" style="margin-top:14px;align-items:flex-start;gap:18px">
  <div class="qr"><img alt="Verification QR" src="${esc(data.qrDataUrl)}" width="150" height="150"></div>
  <div style="flex:1;min-width:220px">
    ${anchor ? badge('Anchored on ledger - block #' + anchor.blockIndex, 'ok') : badge('Not anchored yet', 'warn')}
    <p class="sub" style="margin-top:8px">Scan the QR or open <span class="mono">${esc(data.verifyUrl)}</span> to check this receipt against the ledger. If any amount here is changed, the check fails.</p>
    ${anchor ? `<p class="sub">Merkle root <span class="mono">${esc(shortHash(anchor.merkleRoot, 20))}</span></p>` : ''}
  </div>
</div>
</div>`;
}
