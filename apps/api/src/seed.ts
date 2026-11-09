import { existsSync, rmSync } from 'node:fs';
import { config } from './config.ts';
import { openDatabase } from './db.ts';
import { verifyLedger } from './services/anchoring.ts';
import { createFactory, createWorker } from './services/org.ts';
import { anchorRun, applyAttendance, approveRun, createPayrollRun, getRun } from './services/payroll.ts';
import { addCustodyEvent, createShipment } from './services/shipments.ts';
import { CUSTODY_STAGES } from './services/shipments.ts';

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = config.dbPath + suffix;
  if (existsSync(file)) rmSync(file);
}

const db = openDatabase(config.dbPath);

const factory = createFactory(db, {
  code: 'DHAKA-APR-01',
  name: 'Dhaka Apparels Ltd',
  nameBn: 'ঢাকা অ্যাপারেলস লিমিটেড',
  address: 'Ashulia, Savar, Dhaka',
  bgmeaReg: 'BGMEA-DEMO-1234',
  contactPhone: '+8801700000000',
});

const WORKERS: Array<{
  code: string;
  name: string;
  nameBn: string;
  phone: string;
  dept: string;
  desig: string;
  gross: number;
}> = [
  { code: 'RMG-0001', name: 'Rahima Begum', nameBn: 'রহিমা বেগম', phone: '8801710000001', dept: 'Sewing', desig: 'Operator', gross: 15000 },
  { code: 'RMG-0002', name: 'Fatema Khatun', nameBn: 'ফাতেমা খাতুন', phone: '8801710000002', dept: 'Sewing', desig: 'Operator', gross: 13800 },
  { code: 'RMG-0003', name: 'Shahida Akter', nameBn: 'শাহিদা আক্তার', phone: '8801710000003', dept: 'Sewing', desig: 'Senior Operator', gross: 17500 },
  { code: 'RMG-0004', name: 'Nasrin Sultana', nameBn: 'নাসরিন সুলতানা', phone: '8801710000004', dept: 'Sewing', desig: 'Operator', gross: 12500 },
  { code: 'RMG-0005', name: 'Jahangir Alam', nameBn: 'জাহাঙ্গীর আলম', phone: '8801710000005', dept: 'Cutting', desig: 'Cutter', gross: 16200 },
  { code: 'RMG-0006', name: 'Kamal Hossain', nameBn: 'মো: কামাল হোসেন', phone: '8801710000006', dept: 'Cutting', desig: 'Supervisor', gross: 21000 },
  { code: 'RMG-0007', name: 'Abdul Karim', nameBn: 'আব্দুল করিম', phone: '8801710000007', dept: 'Finishing', desig: 'Ironman', gross: 14500 },
  { code: 'RMG-0008', name: 'Sumi Akter', nameBn: 'সুমি আক্তার', phone: '8801710000008', dept: 'Finishing', desig: 'Packer', gross: 12800 },
  { code: 'RMG-0009', name: 'Taslima Akter', nameBn: 'তাসলিমা আক্তার', phone: '8801710000009', dept: 'QC', desig: 'Inspector', gross: 15500 },
  { code: 'RMG-0010', name: 'Rubel Mia', nameBn: 'রুবেল মিয়া', phone: '8801710000010', dept: 'Sewing', desig: 'Operator', gross: 13500 },
  { code: 'RMG-0011', name: 'Salma Khatun', nameBn: 'সালমা খাতুন', phone: '8801710000011', dept: 'QC', desig: 'Inspector', gross: 16800 },
  { code: 'RMG-0012', name: 'Hasina Begum', nameBn: 'হাসিনা বেগম', phone: '8801710000012', dept: 'Finishing', desig: 'Folder', gross: 13200 },
  { code: 'RMG-0013', name: 'Rafiqul Islam', nameBn: 'মো: রফিকুল ইসলাম', phone: '8801710000013', dept: 'Cutting', desig: 'Cutter', gross: 15800 },
  { code: 'RMG-0014', name: 'Ayesha Siddika', nameBn: 'আয়েশা সিদ্দিকা', phone: '8801710000014', dept: 'Sewing', desig: 'Operator', gross: 14200 },
  { code: 'RMG-0015', name: 'Marium Begum', nameBn: 'মরিয়ম বেগম', phone: '8801710000015', dept: 'Ironing', desig: 'Ironman', gross: 13600 },
];

for (const worker of WORKERS) {
  createWorker(db, {
    factoryId: factory.id,
    code: worker.code,
    name: worker.name,
    nameBn: worker.nameBn,
    phone: worker.phone,
    mfsNumber: worker.phone,
    department: worker.dept,
    designation: worker.desig,
    monthlyGrossPoisha: worker.gross * 100,
    joinedAt: '2023-01-15',
  });
}

// October run: full workflow - create, attendance, approve, anchor.
const run = createPayrollRun(db, factory.id, '2026-10', 26);
applyAttendance(db, run.id, [
  { workerCode: 'RMG-0001', daysWorked: 26, otHours: 12, deductionPoisha: 0 },
  { workerCode: 'RMG-0002', daysWorked: 26, otHours: 8, deductionPoisha: 0 },
  { workerCode: 'RMG-0003', daysWorked: 25, otHours: 16, deductionPoisha: 0 },
  { workerCode: 'RMG-0004', daysWorked: 24, otHours: 0, deductionPoisha: 0 },
  { workerCode: 'RMG-0005', daysWorked: 26, otHours: 10, deductionPoisha: 0 },
  { workerCode: 'RMG-0006', daysWorked: 26, otHours: 4, deductionPoisha: 0 },
  { workerCode: 'RMG-0007', daysWorked: 25, otHours: 8, deductionPoisha: 50000 },
  { workerCode: 'RMG-0008', daysWorked: 26, otHours: 14, deductionPoisha: 0 },
  { workerCode: 'RMG-0009', daysWorked: 26, otHours: 6, deductionPoisha: 0 },
  { workerCode: 'RMG-0010', daysWorked: 23, otHours: 0, deductionPoisha: 0 },
  { workerCode: 'RMG-0011', daysWorked: 26, otHours: 12, deductionPoisha: 0 },
  { workerCode: 'RMG-0012', daysWorked: 26, otHours: 9, deductionPoisha: 0 },
  { workerCode: 'RMG-0013', daysWorked: 25, otHours: 7, deductionPoisha: 0 },
  { workerCode: 'RMG-0014', daysWorked: 24, otHours: 5, deductionPoisha: 30000 },
  { workerCode: 'RMG-0015', daysWorked: 26, otHours: 11, deductionPoisha: 0 },
]);
approveRun(db, run.id);
const receipt = anchorRun(db, run.id);
const anchoredRun = getRun(db, run.id)!;

// November run stays in draft so the UI workflow can be demonstrated.
const draftRun = createPayrollRun(db, factory.id, '2026-11', 26);

const shipment = createShipment(db, {
  factoryId: factory.id,
  buyer: 'Nordic Fashion AB',
  poNumber: 'PO-88421',
  style: "Men's Knit Polo",
  destination: 'Rotterdam, Netherlands',
});
const events: Array<{ stage: (typeof CUSTODY_STAGES)[number]; location: string; actor: string; quantity: number; note?: string }> = [
  { stage: 'fabric-received', location: 'Gazipur fabric mill', actor: 'Mill QC team', quantity: 12000, note: 'Grey fabric lot FT-118' },
  { stage: 'cutting', location: 'Cutting Floor 2', actor: 'Cutting Master Kamal', quantity: 11850 },
  { stage: 'sewing', location: 'Sewing Line 4', actor: 'Line Chief Rafiq', quantity: 11700 },
  { stage: 'finishing', location: 'Finishing Unit', actor: 'QC Lead Taslima', quantity: 11640 },
];
for (const event of events) addCustodyEvent(db, shipment.code, event);

const ledger = verifyLedger(db);
db.close();

console.log('Seed complete.');
console.log(`  Ledger: ${ledger.height} block(s), verified: ${ledger.ok}`);
console.log(`  Anchored run: ${anchoredRun.code} (block #${receipt.blockIndex}), total net BDT ${(anchoredRun.total_net_poisha / 100).toFixed(2)}`);
console.log(`  Draft run:    ${draftRun.code}`);
console.log(`  Shipment:     ${shipment.code} (${events.length} custody events)`);
console.log('');
console.log(`  Dashboard:      ${config.publicUrl}/`);
console.log(`  Anchored run:   ${config.publicUrl}/runs/${run.code}`);
console.log(`  Worker receipt: ${config.publicUrl}/receipt/${run.code}/RMG-0001`);
console.log(`  Verify run:     ${config.publicUrl}/verify/run/${run.code}`);
console.log(`  Proof tool:     ${config.publicUrl}/verify/tool`);
console.log(`  Shipment:       ${config.publicUrl}/shipments/${shipment.code}`);
console.log(`  Ledger:         ${config.publicUrl}/ledger`);
