// API DTOs — copied from the mobile app's api/types.ts, trimmed to just what the web
// admin scope uses today. These mirror the backend response shapes exactly; add more as
// new pages are built. Keeping them here (rather than importing across projects) keeps the
// web app self-contained and avoids touching the mobile codebase.

// ---- Roles (must match backend src/utils/roles.js) ----
export const ROLES = {
  ADMIN: 'admin',
  MOULDING_ENGINEER: 'moulding_engineer',
  ASSEMBLY_ENGINEER: 'assembly_engineer',
  QC_ENGINEER: 'qc_engineer',
  PACKING_DISPATCH_ENGINEER: 'packing_dispatch_engineer',
  CUSTOMER: 'customer',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.MOULDING_ENGINEER]: 'Moulding Engineer',
  [ROLES.ASSEMBLY_ENGINEER]: 'Assembly Engineer',
  [ROLES.QC_ENGINEER]: 'QC Engineer',
  [ROLES.PACKING_DISPATCH_ENGINEER]: 'Dispatch Engineer',
  [ROLES.CUSTOMER]: 'Customer',
};

// ---- Auth ----
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  customerId: string | null;
}
export interface LoginResponse {
  token: string;
  user: AuthUser;
}
export interface MeResponse {
  user: AuthUser;
}

// ---- Standard list envelope ----
export interface Paginated<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

// ---- Admin dashboard analytics ----
export interface AdminDashboard {
  totalCustomers: number;
  totalProducts: number;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
}
export interface ProductionSummary {
  totalMouldingProduction: number;
  totalAssemblyProduction: number;
  totalQcAccepted: number;
  totalDispatchQuantity: number;
}
export interface RejectionAnalytics {
  mouldingRejections: number;
  assemblyRejections: number;
  qcRejections: number;
  totalRejections: number;
  qcDefectBreakdown: { defectType: string; quantity: number }[];
}
export interface DepartmentSummary {
  departments: {
    department: string;
    recordCount: number;
    total: number;
    throughput: number;
    rejections: number;
    hasRejections: boolean;
  }[];
}
export interface AdminOrderRow {
  id: string;
  orderCode: string | null;
  orderNumber: string;
  customer: string | null;
  product: string | null;
  itemCode: string | null;
  orderQuantity: number;
  dispatchedQuantity: number;
  progressPct: number;
  status: string;
  lifecycleStatus: 'Active' | 'Completed' | 'Archived';
  createdAt: string;
  ageDays?: number;
}

// ---- Admin production records (per item-code job, grouped by department) ----
// Item-code-centric: the internal FFT order code is intentionally NOT surfaced here.
export interface AdminMouldingRecord {
  id: string;
  itemCode: string | null;
  customer: string | null;
  product: string | null;
  moldName: string;
  partName: string;
  machineNumber: string;
  shift: 'A' | 'B' | 'C';
  cavity: number;
  shotsDone: number;
  rejectedShots: number;
  goodParts: number;
  rejectionReasons: string[];
  createdAt: string;
}
export interface AdminAssemblyRecord {
  id: string;
  itemCode: string | null;
  customer: string | null;
  product: string | null;
  assemblyLine: string;
  operatorCount: number;
  shift: 'A' | 'B' | 'C';
  inputQuantity: number;
  assembledQuantity: number;
  rejectedQuantity: number;
  rejectionReason: string | null;
  createdAt: string;
}
export interface AdminQCRecord {
  id: string;
  itemCode: string | null;
  customer: string | null;
  product: string | null;
  inspectionDate: string;
  inspectionType: string;
  sampleSize: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  defects: { defectType: string; quantity: number; remarks: string | null }[];
  remarks: string | null;
  createdAt: string;
}
export interface AdminDispatchRecord {
  id: string;
  itemCode: string | null;
  customer: string | null;
  product: string | null;
  dispatchDate: string;
  packedQuantity: number;
  cartonCount: number;
  transporterName: string;
  vehicleNumber: string;
  lrNumber: string;
  invoiceNumber: string;
  dispatchRemarks: string | null;
  createdAt: string;
}

// ---- Master data (customers / products / orders) ----
export interface Customer {
  id: string;
  name: string;
  createdAt: string;
}
export interface Product {
  id: string;
  customerId: string | null;
  name: string;
  itemCode: string | null;
  partName: string | null;
  createdAt: string;
}
export interface Order {
  id: string;
  orderCode: string | null;
  purchaseOrderId: string | null;
  customerId: string | null;
  productId: string | null;
  orderQuantity: number;
  status: 'Active' | 'Completed' | 'Archived';
  createdAt: string;
}

// ---- Purchase Orders (Company → PO → Item Code) ----
export type PurchaseOrderStatus = 'Open' | 'Completed' | 'Archived';
export interface PurchaseOrder {
  id: string;
  poNumber: string | null;
  customerId: string | null;
  customerName?: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  jobCount?: number;
  completedJobs?: number;
  totalQuantity?: number;
  createdAt: string;
}
export interface POJobMould {
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots: number;
  displayShots: number;
  surplusPieces: number;
  isComplete: boolean;
}
export interface POJob extends Order {
  itemCode: string | null;
  productName: string | null;
  partName: string | null;
  moulds?: POJobMould[];
  productionComplete?: boolean;
  progressPct?: number;
}
export interface PurchaseOrderDetail {
  purchaseOrder: PurchaseOrder;
  jobs: POJob[];
}
export interface POLineInput {
  productId: string;
  orderQuantity: number;
}

// ---- Users ----
export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  customerId: string | null;
}

// ---- Media ----
export interface Media {
  id: string;
  url: string;
  type: 'image' | 'invoice';
  mimeType: string | null;
  sizeBytes: number | null;
}

// ---- QC (Quality Management) reports ----
export type QCDepartment = 'moulding' | 'assembly';
export type QCSeverity = 'minor' | 'major' | 'critical';
export type QCStatusValue = 'open' | 'closed';
export interface QCComment {
  id?: string;
  authorId: string | null;
  authorName: string | null;
  authorRole: string | null;
  text: string;
  createdAt: string;
}
export interface QCStatusHistoryEntry {
  status: QCStatusValue;
  byId: string | null;
  byName: string | null;
  note: string | null;
  at: string;
}
export interface QCReport {
  id: string;
  department: QCDepartment;
  customerId: string;
  productId: string;
  orderId: string;
  machine: string | null;
  mould: string | null;
  part: string | null;
  shift: 'A' | 'B' | 'C' | null;
  defects: string[];
  severity: QCSeverity;
  description: string | null;
  tags: string[];
  photos: Media[];
  status: QCStatusValue;
  comments: QCComment[];
  statusHistory: QCStatusHistoryEntry[];
  submittedBy: string;
  submittedByName: string | null;
  createdAt: string;
  updatedAt: string;
  orderCode?: string | null;
  customerName?: string | null;
  productName?: string | null;
  itemCode?: string | null;
}
