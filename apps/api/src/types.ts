export interface FactoryRow {
  id: number;
  code: string;
  name: string;
  name_bn: string | null;
  address: string | null;
  bgmea_reg: string | null;
  contact_phone: string | null;
  created_at: string;
}

export interface WorkerRow {
  id: number;
  factory_id: number;
  code: string;
  name: string;
  name_bn: string | null;
  phone: string;
  mfs_number: string | null;
  department: string;
  designation: string | null;
  monthly_gross_poisha: number;
  joined_at: string | null;
  active: number;
  created_at: string;
}

export type RunStatus = 'draft' | 'approved' | 'anchored';

export interface RunRow {
  id: number;
  code: string;
  factory_id: number;
  period_month: string;
  working_days: number;
  status: RunStatus;
  worker_count: number;
  total_net_poisha: number;
  created_at: string;
  approved_at: string | null;
  anchored_at: string | null;
}

export interface WageLineRow {
  id: number;
  run_id: number;
  worker_id: number;
  worker_code: string;
  worker_name: string;
  department: string;
  days_worked: number;
  ot_hours: number;
  basic_poisha: number;
  house_rent_poisha: number;
  medical_poisha: number;
  gross_poisha: number;
  ot_poisha: number;
  deduction_poisha: number;
  net_poisha: number;
}

export interface AnchorReceipt {
  refType: 'payroll-run' | 'shipment-event';
  refId: string;
  algorithm: 'sha256-merkle-chain-v1';
  merkleRoot: string;
  leafCount: number;
  blockIndex: number;
  blockHash: string;
  createdAt: string;
}

export interface VerificationCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ShipmentRow {
  id: number;
  code: string;
  factory_id: number;
  buyer: string;
  po_number: string | null;
  style: string | null;
  destination: string | null;
  created_at: string;
}

export interface CustodyEventRow {
  id: number;
  shipment_id: number;
  stage: string;
  location: string | null;
  actor: string | null;
  quantity: number | null;
  note: string | null;
  block_index: number | null;
  created_at: string;
}
