import type { Role } from '@/types/roles';

// ---------------------------------------------------------------------------
// API DTOs — these mirror the backend response shapes exactly (see the Phase 10
// endpoint inventory). Keep in sync with backend service `toPublic*` shapers.
// ---------------------------------------------------------------------------

// Standard list envelope returned by every paginated endpoint.
export interface Paginated<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

// Standard error body: { error: <code>, message }.
export interface ApiErrorBody {
  error: string;
  message: string;
}

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

// ---- Master data ----
export interface Customer {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
}
export interface Product {
  id: string;
  customerId: string | null;
  name: string;
  partName: string | null;
  status?: 'Active' | 'Archived';
  createdBy: string | null;
  createdAt: string;
}
export type MachineCategory = 'injection' | 'blow';
export interface Machine {
  id: string;
  name: string;
  category: MachineCategory;
  status: 'Active' | 'Archived';
  createdAt?: string;
}
// Order lifecycle (revised workflow). Overall status drives working-screen vs history;
// per-phase flags gate the Moulding / Assembly workspaces.
export type OrderLifecycle = 'Active' | 'Completed' | 'Archived';
export type OrderPhaseStatus = 'Active' | 'Completed';
export interface Order {
  id: string;
  orderCode: string | null;
  customerId: string | null;
  productId: string | null;
  orderQuantity: number;
  status: OrderLifecycle;
  productionStatus: OrderPhaseStatus;
  assemblyStatus: OrderPhaseStatus;
  productionCompletedAt: string | null;
  assemblyCompletedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}
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

// ---- Moulding dashboard (companies → products → active orders) ----
export interface MouldingDashboardProduct {
  id: string;
  name: string;
  partName: string | null;
  activeOrders: number;
}
export interface MouldingDashboardCustomer {
  id: string;
  name: string;
  products: MouldingDashboardProduct[];
}

// ---- Recovery entry (rejected shots → surplus) ----
export interface RecoveryEntry {
  partName: string;
  cavity: number;
  moldName?: string;
  goodPieces: number;
}

// ---- Department records ----
export interface MouldingRecord {
  id: string;
  orderId: string;
  productId: string;
  customerId: string;
  moldName: string;
  partName: string;
  machineNumber: string;
  shift: 'A' | 'B' | 'C';
  cavity: number;
  shotsDone: number;
  rejectedShots: number;
  productionQuantity: number;
  goodParts: number;
  // rejectionReasons: multi-select array; legacy single-string in rejectionReason.
  rejectionReasons: string[];
  rejectionReason: string | null;
  comments: string | null;
  imageId: string | null;
  image: Media | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // canEdit: true if within the 12-hour edit/delete window (computed server-side).
  canEdit: boolean;
}
export interface AssemblyRecord {
  id: string;
  orderId: string | null;
  customerId: string;
  productId: string;
  assemblyLine: string;
  operatorCount: number;
  shift: 'A' | 'B' | 'C';
  inputQuantity: number;
  assembledSets: number;
  extraSets?: number;
  fromSurplus?: boolean;
  consumption: { partName: string; perSet: number; quantity: number; kind?: 'moulded' | 'outsourced' }[];
  assembledQuantity: number;
  rejectedQuantity: number;
  rejectionReason: string | null;
  remarks: string | null;
  photos: Media[];
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface QCDefect {
  defectType: string;
  quantity: number;
  remarks: string | null;
}
export interface QCRecord {
  id: string;
  orderId: string | null;
  customerId: string;
  productId: string;
  inspectionDate: string;
  inspectionType: string;
  sampleSize: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  defectCount: number;
  defects: QCDefect[];
  correctiveAction: string | null;
  remarks: string | null;
  photos: Media[];
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface DispatchRecord {
  id: string;
  orderId: string | null;
  customerId: string;
  productId: string;
  dispatchDate: string;
  packedQuantity: number;
  cartonCount: number;
  transporterName: string;
  vehicleNumber: string;
  lrNumber: string;
  invoiceNumber: string;
  dispatchRemarks: string | null;
  photos: Media[];
  documents: Media[];
  submittedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Computed order status (per department /status endpoints) ----
export interface OrderStatusBase {
  orderId: string;
  customerId: string;
  productId: string;
  orderQuantity: number;
  progressPct: number;
  recordCount: number;
  status: string;
}
// Per-mold production progress returned inside MouldingStatus.
export interface MoldProgress {
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots: number;
  requiredPieces: number;
  shotsDone: number;
  goodParts: number;
  isComplete: boolean;
}
export type MouldingStatus = OrderStatusBase & {
  producedQuantity: number;
  goodParts: number;
  pendingQuantity: number;
  // Per-mold breakdown — present when OrderMolds are configured for the order.
  moldProgress: MoldProgress[];
};
export type AssemblyStatus = OrderStatusBase & {
  mouldingOutput: number;
  assembledQuantity: number;
  rejectedQuantity: number;
  mouldingStatus: { orderQuantity: number; goodParts: number; status: string };
};
export type QCStatus = OrderStatusBase & {
  assemblyGoodOutput: number;
  inspectedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  defectCount: number;
  assemblyStatus: { assembledQuantity: number; mouldingOutput: number; status: string };
};
export type DispatchStatus = OrderStatusBase & {
  qcApprovedQuantity: number;
  dispatchedQuantity: number;
  cartonCount: number;
  pendingQuantity: number;
  qcStatus: { acceptedQuantity: number; rejectedQuantity: number; status: string };
};

// ---- Customer dashboard (Phase 8) ----
export interface CustomerDashboard {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  delayedOrders: number;
  delayedPolicy: { type: string; thresholdDays: number };
}
export interface CustomerOrderRow {
  id: string;
  orderNumber: string;
  product: string | null;
  partName: string | null;
  orderQuantity: number;
  dispatchedQuantity: number;
  progressPct: number;
  status: string;
  createdAt: string;
}
export interface CustomerOrderDetails {
  order: {
    id: string;
    orderNumber: string;
    customer: string | null;
    product: string | null;
    partName: string | null;
    orderQuantity: number;
    createdAt: string;
  };
  qcSummary: {
    acceptedQuantity: number;
    rejectedQuantity: number;
    inspectedQuantity: number;
    defectSummary: { defectType: string; quantity: number }[];
    correctiveActions: { inspectionDate: string; correctiveAction: string }[];
  };
  dispatchSummary: {
    shipmentCount: number;
    totalPackedQuantity: number;
    totalCartonCount: number;
    firstDispatchDate: string | null;
    lastDispatchDate: string | null;
    shipments: {
      dispatchDate: string;
      packedQuantity: number;
      cartonCount: number;
      transporter: string;
      vehicleNumber: string;
      lrNumber: string;
      invoiceNumber: string;
    }[];
  };
  photos: { moulding: Media[]; assembly: Media[]; qc: Media[]; dispatch: Media[] };
}
export interface CustomerOrderProgress {
  orderId: string;
  orderNumber: string;
  orderQuantity: number;
  overallProgressPct: number;
  progress: {
    moulding: { status: string; progressPct: number };
    assembly: { status: string; progressPct: number };
    qc: { status: string; progressPct: number };
    dispatch: { status: string; progressPct: number };
  };
}

// ---- Admin dashboard (Phase 9) ----
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
  customerId: string | null;
  product: string | null;
  productId: string | null;
  orderQuantity: number;
  dispatchedQuantity: number;
  progressPct: number;
  status: string; // customer-facing production stage (back-compat)
  lifecycleStatus: OrderLifecycle;
  productionStatus: OrderPhaseStatus;
  assemblyStatus: OrderPhaseStatus;
  mouldingCount?: number;
  assemblyCount?: number;
  qcCount?: number;
  dispatchCount?: number;
  createdAt: string;
  ageDays?: number;
}
export interface CustomerAnalyticsRow {
  customerId: string;
  customer: string;
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  performance: {
    completionRatePct: number;
    fulfillmentRatePct: number;
    totalOrderedQty: number;
    totalDispatchedQty: number;
  };
}
export interface UserAnalytics {
  totalUsers: number;
  byRole: { role: Role; count: number; activeCount: number }[];
}

// ---- Molds (updated workflow: explicitly defined, with cavity + required shots) ----
export interface LearnedMold {
  id: string;
  customerId: string;
  productId: string;
  moldName: string;
  partName: string;
  defaultPartName: string;
  cavity: number;
  requiredShots: number;
  requiredQuantity: number;
  usageCount: number;
  lastUsedAt: string;
  createdAt: string;
}
export interface MoldsResponse {
  productId: string;
  molds: LearnedMold[];
}

// ---- Per-order Mould Setup (revised workflow) ----
export interface OrderMold {
  id: string;
  orderId: string;
  customerId: string;
  productId: string;
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots: number;
  requiredQuantity: number;
  createdAt: string;
  updatedAt: string;
}
// A learned suggestion not yet set up on the order (engineer can adopt it).
export interface OrderMoldSuggestion {
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots: number;
  requiredQuantity: number;
}
export interface OrderMoldsResponse {
  orderId: string;
  customerId: string;
  productId: string;
  molds: OrderMold[];
  suggestions: OrderMoldSuggestion[];
}
export interface OrderMoldInput {
  orderId: string;
  customerId?: string;
  productId?: string;
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots?: number;
}

// ---- Assembly assortments (parts-per-set / BOM) ----
export interface AssortmentPart {
  partName: string;
  perSet: number;
  kind?: 'moulded' | 'outsourced';
}
export interface Assortment {
  id?: string;
  customerId: string | null;
  productId: string | null;
  parts: AssortmentPart[];
  exists: boolean;
  updatedAt?: string;
}

// ---- Stores (Phases 2 / 4; Component Store is order-scoped in the revised workflow) ----
export interface ComponentPart {
  partName: string;
  moldName: string;
  cavity: number;
  requiredQuantity: number;
  quantityOnHand: number;
  finishedQuantity: number;
  surplusQuantity: number;
  status: 'pending' | 'finished';
}
export interface ComponentAvailability {
  customerId: string;
  productId: string;
  orderId: string | null;
  parts: ComponentPart[];
}
// Shared bucket shape (parts split into pending / finished / surplus).
export interface ComponentBuckets {
  parts: ComponentPart[];
  pending: ComponentPart[];
  finished: ComponentPart[];
  surplus: ComponentPart[];
}
// Product-level aggregate node (cross-order rollup; powers the Customer Portal).
export interface ComponentProductNode extends ComponentBuckets {
  productId: string | null;
  product: string | null;
  totalQuantity: number;
}
export interface ComponentStoreCustomer {
  customerId: string | null;
  customer: string | null;
  totalQuantity: number;
  products: ComponentProductNode[];
}
export interface ComponentStoreTree {
  store: 'COMPONENT';
  customers: ComponentStoreCustomer[];
}

// Order-scoped Component Store: Customer → Product → OrderID → Pending/Finished.
// Pending & Finished are per-OrderID; Surplus is product-level (see node below).
export interface ComponentOrderNode {
  orderId: string | null;
  orderCode: string | null;
  totalQuantity: number;
  parts: ComponentPart[];
  pending: ComponentPart[];
  finished: ComponentPart[];
}
export interface ComponentByOrderProductNode {
  productId: string | null;
  product: string | null;
  totalQuantity: number;
  // Surplus is shared across the same customer + product (summed across all orders).
  surplus: ComponentPart[];
  orders: ComponentOrderNode[];
}
export interface ComponentByOrderCustomer {
  customerId: string | null;
  customer: string | null;
  totalQuantity: number;
  products: ComponentByOrderProductNode[];
}
export interface ComponentByOrderTree {
  store: 'COMPONENT';
  customers: ComponentByOrderCustomer[];
}

// ---- Outsourced Components (purchased/external parts; order-scoped, separate store) ----
export interface OutsourcedItem {
  id: string;
  customerId: string;
  productId: string;
  orderId: string | null;
  componentName: string;
  quantityOnHand: number;
  updatedAt?: string;
}
export interface OutsourcedStore {
  customerId: string;
  productId: string;
  orderId: string;
  components: OutsourcedItem[]; // this order's outsourced components
  surplus: OutsourcedItem[]; // product-level surplus (pooled across orders)
  suggestions: string[]; // remembered component names for the dropdown
}

export interface FinishedGoodsProductNode {
  productId: string | null;
  product: string | null;
  quantityOnHand: number;
}
export interface FinishedGoodsCustomer {
  customerId: string | null;
  customer: string | null;
  totalQuantity: number;
  products: FinishedGoodsProductNode[];
}
export interface FinishedGoodsTree {
  store: 'FINISHED_GOODS';
  customers: FinishedGoodsCustomer[];
}
export interface FinishedGoodsBalance {
  customerId: string;
  productId: string;
  quantityOnHand: number;
}

// ---- Admin department record rows (admin-only paginated record lists) ----
export interface AdminMouldingRecord {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  customerId: string | null;
  customer: string | null;
  productId: string | null;
  product: string | null;
  moldName: string;
  partName: string;
  machineNumber: string;
  shift: 'A' | 'B' | 'C';
  cavity: number;
  shotsDone: number;
  rejectedShots: number;
  goodParts: number;
  productionQuantity: number;
  rejectionReasons: string[];
  createdAt: string;
}

export interface AdminAssemblyRecord {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  customerId: string | null;
  customer: string | null;
  productId: string | null;
  product: string | null;
  assemblyLine: string;
  operatorCount: number;
  shift: 'A' | 'B' | 'C';
  inputQuantity: number;
  assembledSets: number;
  assembledQuantity: number;
  rejectedQuantity: number;
  rejectionReason: string | null;
  createdAt: string;
}

export interface AdminQCRecord {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  customerId: string | null;
  customer: string | null;
  productId: string | null;
  product: string | null;
  inspectionDate: string;
  inspectionType: string;
  sampleSize: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  defectCount: number;
  defects: { defectType: string; quantity: number; remarks: string | null }[];
  remarks: string | null;
  createdAt: string;
}

export interface AdminDispatchRecord {
  id: string;
  orderId: string | null;
  orderCode: string | null;
  customerId: string | null;
  customer: string | null;
  productId: string | null;
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

// ---- Admin order timeline ----
export interface AdminOrderTimeline extends AdminOrderRow {
  mouldingGoodParts: number;
  assembledQuantity: number;
  qcAcceptedQuantity: number;
  productionCompletedAt: string | null;
  assemblyCompletedAt: string | null;
}
