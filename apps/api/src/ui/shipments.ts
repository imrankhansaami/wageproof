import type { FactoryRow, ShipmentRow, VerificationCheck } from '../types.ts';
import type { ShipmentEventVerification } from '../services/shipments.ts';
import { CUSTODY_STAGES } from '../services/shipments.ts';
import { badge, esc, layout, shortHash } from './layout.ts';
import { verificationList } from './pages.ts';

export interface ShipmentsPageData {
  shipments: Array<ShipmentRow & { factory_name: string; event_count: number }>;
  factories: Array<FactoryRow & { worker_count: number }>;
  notice?: string;
}

export function shipmentsPage(data: ShipmentsPageData): string {
  const factoryOptions = data.factories
    .map((factory) => `<option value="${factory.id}">${esc(factory.name)}</option>`)
    .join('');
  const rows = data.shipments
    .map(
      (shipment) => `<tr>
  <td><a href="/shipments/${esc(shipment.code)}" class="mono">${esc(shipment.code)}</a></td>
  <td>${esc(shipment.buyer)}</td>
  <td>${esc(shipment.po_number ?? '-')}</td>
  <td>${esc(shipment.destination ?? '-')}</td>
  <td>${shipment.event_count}</td>
  <td>${esc(shipment.created_at.slice(0, 10))}</td>
</tr>`,
    )
    .join('');
  return `<h1>ExportPass - shipment custody</h1>
<p class="sub">Each custody event (fabric in, cutting, sewing, finishing, inspection, shipped) is anchored to its own ledger block. Buyers and auditors can verify the trail per event; this is the seed of a Digital Product Passport data model.</p>
${data.notice ? `<div class="notice ok">${esc(data.notice)}</div>` : ''}
<h2>New shipment</h2>
<div class="card">
<form method="post" action="/shipments">
  <div class="row" style="align-items:flex-end">
    <div style="flex:1;min-width:180px"><label for="factoryId">Factory</label><select id="factoryId" name="factoryId">${factoryOptions}</select></div>
    <div style="flex:1;min-width:180px"><label for="buyer">Buyer</label><input type="text" id="buyer" name="buyer" placeholder="Nordic Fashion AB"></div>
    <div style="flex:1;min-width:140px"><label for="poNumber">PO number</label><input type="text" id="poNumber" name="poNumber" placeholder="PO-88421"></div>
    <div style="flex:1;min-width:140px"><label for="style">Style</label><input type="text" id="style" name="style" placeholder="Knit polo"></div>
    <div style="flex:1;min-width:160px"><label for="destination">Destination</label><input type="text" id="destination" name="destination" placeholder="Rotterdam, NL"></div>
    <div><button type="submit">Create</button></div>
  </div>
</form>
</div>
<h2>Shipments</h2>
<table><thead><tr><th>Code</th><th>Buyer</th><th>PO</th><th>Destination</th><th>Events</th><th>Created</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">No shipments yet.</td></tr>'}</tbody></table>`;
}

export interface ShipmentDetailData {
  shipment: ShipmentRow;
  factory: FactoryRow;
  events: ShipmentEventVerification[];
  checks: VerificationCheck[];
  notice?: string;
}

export function shipmentDetailPage(data: ShipmentDetailData): string {
  const stageOptions = CUSTODY_STAGES.map((stage) => `<option value="${stage}">${stage}</option>`).join('');
  const timeline = data.events
    .map(({ event, valid, blockIndex }) => `<li>
  <strong>${esc(event.stage)}</strong> ${valid ? badge('anchored', 'ok') : badge('unverified', 'bad')} ${blockIndex !== null ? `<span class="sub">&middot; block #${blockIndex}</span>` : ''}
  <div class="sub">${esc(event.location ?? '')}${event.actor ? ' &middot; ' + esc(event.actor) : ''}${event.quantity ? ' &middot; ' + event.quantity + ' pcs' : ''} &middot; ${esc(event.created_at)}</div>
  ${event.note ? `<div class="sub">${esc(event.note)}</div>` : ''}
</li>`)
    .join('');
  return `<p class="sub"><a href="/shipments">&larr; All shipments</a></p>
<h1><span class="mono">${esc(data.shipment.code)}</span> ${badge(data.shipment.buyer, 'neutral')}</h1>
<p class="sub">${esc(data.factory.name)} &middot; PO ${esc(data.shipment.po_number ?? '-')} &middot; ${esc(data.shipment.style ?? '-')} &middot; ${esc(data.shipment.destination ?? '-')}</p>
${data.notice ? `<div class="notice ok">${esc(data.notice)}</div>` : ''}
<h2>Custody timeline</h2>
<ul class="timeline">${timeline || '<li class="sub">No events yet - add the first custody event below.</li>'}</ul>
<h2>Verification</h2>
<div class="notice ${data.checks.every((check) => check.ok) ? 'ok' : 'bad'}">
  ${data.checks.every((check) => check.ok) ? badge('Trail verified', 'ok') : badge('Verification failed', 'bad')}
  ${data.events.length} event(s), each matched against its ledger block.
</div>
${verificationList(data.checks)}
<h2>Add custody event</h2>
<div class="card">
<form method="post" action="/shipments/${esc(data.shipment.code)}/events">
  <div class="row" style="align-items:flex-end">
    <div style="flex:1;min-width:160px"><label for="stage">Stage</label><select id="stage" name="stage">${stageOptions}</select></div>
    <div style="flex:1;min-width:160px"><label for="location">Location</label><input type="text" id="location" name="location" placeholder="Sewing Line 4"></div>
    <div style="flex:1;min-width:160px"><label for="actor">Actor</label><input type="text" id="actor" name="actor" placeholder="Line chief"></div>
    <div style="flex:1;min-width:110px"><label for="quantity">Quantity</label><input type="number" id="quantity" name="quantity" placeholder="1200"></div>
    <div style="flex:2;min-width:180px"><label for="note">Note</label><input type="text" id="note" name="note" placeholder="Optional"></div>
    <div><button type="submit">Add &amp; anchor</button></div>
  </div>
</form>
</div>`;
}
