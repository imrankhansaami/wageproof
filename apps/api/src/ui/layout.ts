export type Tone = 'ok' | 'warn' | 'bad' | 'neutral';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function taka(poisha: number): string {
  return (poisha / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function takaBn(poisha: number): string {
  try {
    return new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 2 }).format(poisha / 100);
  } catch {
    return taka(poisha);
  }
}

export { takaBn };

export function shortHash(hash: string | null | undefined, length = 14): string {
  if (!hash) return '';
  return hash.length <= length ? hash : hash.slice(0, length) + '...';
}

export function badge(label: string, tone: Tone): string {
  return `<span class="badge ${tone}">${esc(label)}</span>`;
}

export function statusBadge(status: string): string {
  if (status === 'anchored') return badge('Anchored', 'ok');
  if (status === 'approved') return badge('Approved', 'warn');
  if (status === 'draft') return badge('Draft', 'neutral');
  return badge(status, 'neutral');
}

export function periodLabel(period: string, locale = 'en-GB'): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  try {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return period;
  }
}

const STYLES = `
:root{--bg:#f6f7f9;--card:#ffffff;--text:#111418;--muted:#68707b;--line:#e3e6ea;--accent:#0b6b3a;--accent2:#1450a3;--good:#16a34a;--warnc:#d97706;--badc:#dc2626;}
@media (prefers-color-scheme: dark){:root{--bg:#0f1115;--card:#171a21;--text:#e8eaed;--muted:#9aa0a6;--line:#2a2f3a;--accent:#2f9e63;--accent2:#6ea8fe;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Bengali",sans-serif}
header.top{background:var(--card);border-bottom:1px solid var(--line);padding:10px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header.top nav{display:flex;gap:4px}
header.top a{color:var(--text);text-decoration:none;padding:6px 12px;border-radius:8px;font-size:14px}
header.top a.active{background:var(--accent);color:#fff}
.brand{font-weight:800;letter-spacing:.2px}
.tagline{color:var(--muted);font-size:12.5px;margin-left:auto}
main{max-width:1080px;margin:26px auto;padding:0 18px}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:16.5px;margin:26px 0 8px}
p.sub{color:var(--muted);margin:0 0 18px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card .k{color:var(--muted);font-size:12.5px}
.card .v{font-size:21px;font-weight:750;margin-top:2px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13.5px;vertical-align:top}
th{background:color-mix(in srgb, var(--card) 82%, var(--bg));font-weight:650;font-size:12.5px;color:var(--muted)}
tr:last-child td{border-bottom:none}
.badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700}
.badge.ok{background:rgba(22,163,74,.14);color:var(--good)}
.badge.warn{background:rgba(217,119,6,.14);color:var(--warnc)}
.badge.bad{background:rgba(220,38,38,.14);color:var(--badc)}
.badge.neutral{background:rgba(104,112,123,.14);color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;word-break:break-all}
button,.btn{background:var(--accent);border:0;color:#fff;padding:8px 15px;border-radius:8px;font-size:14px;font-weight:650;cursor:pointer;text-decoration:none;display:inline-block}
.btn.sec{background:var(--accent2)}
.btn.ghost{background:transparent;color:var(--accent2);border:1px solid var(--line)}
textarea,input[type=text],input[type=number],select{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
label{display:block;font-size:12.5px;color:var(--muted);margin:12px 0 4px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.notice{border-radius:10px;padding:10px 14px;margin:14px 0;font-size:14px;border:1px solid var(--line);background:var(--card)}
.notice.ok{border-color:rgba(22,163,74,.4);background:rgba(22,163,74,.07)}
.notice.bad{border-color:rgba(220,38,38,.4);background:rgba(220,38,38,.06)}
.notice.warn{border-color:rgba(217,119,6,.4);background:rgba(217,119,6,.06)}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;overflow:auto;font-size:12.5px;line-height:1.5}
ul.checks{list-style:none;padding:0;margin:10px 0}
ul.checks li{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:10px 14px;margin-bottom:8px}
ul.checks .mark{font-weight:800;margin-right:6px}
ul.checks li.ok .mark{color:var(--good)}
ul.checks li.bad .mark{color:var(--badc)}
ul.checks .sub, .sub{color:var(--muted);font-size:12.5px}
.timeline{list-style:none;margin:10px 0;padding:0}
.timeline li{border-left:3px solid var(--accent);background:var(--card);border:1px solid var(--line);border-left-width:3px;border-radius:10px;padding:10px 14px;margin-bottom:8px}
.qr{background:#fff;padding:10px;border-radius:10px;display:inline-block;border:1px solid var(--line)}
.receipt-net{font-size:30px;font-weight:800}
.receipt-grid{display:grid;grid-template-columns:220px 1fr;row-gap:6px;column-gap:14px;font-size:14.5px}
.receipt-grid .k{color:var(--muted)}
footer{max-width:1080px;margin:34px auto;padding:0 18px 44px;color:var(--muted);font-size:12.5px}
.kv{display:grid;grid-template-columns:170px 1fr;gap:6px 14px;font-size:13.5px}
.kv .k{color:var(--muted)}
@media print{header.top,.no-print,footer{display:none}main{margin:0}}
`;

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/shipments', label: 'Shipments' },
];

export function layout(title: string, active: string, body: string): string {
  const nav = NAV_ITEMS.map(
    (item) => `<a href="${item.href}" class="${item.href === active ? 'active' : ''}">${esc(item.label)}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - WageProof</title>
<style>${STYLES}</style>
</head>
<body>
<header class="top">
  <span class="brand">WageProof</span>
  <nav>${nav}</nav>
  <span class="tagline">Payroll proofs for RMG - MVP</span>
</header>
<main>${body}</main>
<footer>WageProof MVP - private permissioned ledger, no crypto rails. Amounts in BDT unless stated.</footer>
</body>
</html>`;
}
