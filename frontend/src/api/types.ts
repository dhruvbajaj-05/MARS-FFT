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
  // Unique manufacturing identifier (e.g. "37500"). Referenced by every production
  // process; `name` is display only.
  itemCode: string | null;
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
  createdAt?: string;
}
// Order lifecycle (revised workflow). Overall status drives working-screen vs history;
// per-phase flags gate the Moulding / Assembly workspaces.
export type OrderLifecycle = 'Active' | 'Completed' | 'Archived';
export type OrderPhaseStatus = 'Active' | 'Completed';
export interface Order {
  id: string;
  orderCode: string | null;
  // The Purchase Order this Item Code job belongs to (null for legacy/standalone jobs).
  purchaseOrderId: string | null;
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

// ---- Purchase Orders (Company → PO → Item Code) ----
export type PurchaseOrderStatus = 'Open' | 'Completed' | 'Archived';

// A PO summary row (list view) — jobCount/totalQuantity are roll-ups over its Item Code jobs.
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
  completedAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

// One mould on an Item Code card, with its live Done/in-progress state.
export interface POJobMould {
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots: number;
  displayShots: number;
  surplusPieces: number;
  isComplete: boolean;
}

// One Item Code production job inside a PO (an Order enriched with its product identity).
export interface POJob extends Order {
  itemCode: string | null;
  productName: string | null;
  partName: string | null;
  // Present in PO detail responses: the job's moulds + derived completion.
  moulds?: POJobMould[];
  productionComplete?: boolean;
  progressPct?: number;
}

// Full PO detail: the container + its Item Code jobs.
export interface PurchaseOrderDetail {
  purchaseOrder: PurchaseOrder;
  jobs: POJob[];
}

// One line when creating a PO (an Item Code + how many sets to produce).
export interface POLineInput {
  productId: string;
  orderQuantity: number;
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
export interface RunningMould {
  moldName: string;
  partName: string | null;
  cavity: number;
}
export interface MouldingDashboardProduct {
  id: string;
  name: string;
  itemCode: string | null;
  partName: string | null;
  activeOrders: number;
  runningMoulds: RunningMould[];
}
export interface MouldingDashboardCustomer {
  id: string;
  name: string;
  products: MouldingDashboardProduct[];
}

// PO-level moulding dashboard (Active / Archived POs).
export interface MouldingPOCard {
  id: string;
  poNumber: string | null;
  customerName: string | null;
  itemCount: number;
  activeItems: number;
}
export interface MouldingPODashboard {
  active: MouldingPOCard[];
  archived: MouldingPOCard[];
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
  canEdit?: boolean;
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
  canEdit?: boolean;
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
  canEdit?: boolean;
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
  // UI-facing values, capped at the target so progress never exceeds the plan.
  displayShots: number;
  displayGoodParts: number;
  surplusShots: number;
  surplusPieces: number;
  progressPct: number;
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

// ---- Customer portal: product-first (Home → Product → Order dashboard) ----
export interface CustomerProduct {
  id: string;
  name: string;
  itemCode: string | null;
  partName: string | null;
  totalOrders: number;
  activeOrders: number;
  progressPct: number;
  status: string;
  lastUpdatedAt: string | null;
}
export interface CustomerProductsResponse {
  customer: string | null;
  products: CustomerProduct[];
}
export interface CustomerProductOrderRow {
  id: string;
  orderCode: string;
  poNumber: string | null;
  orderQuantity: number;
  dispatchedQuantity: number;
  progressPct: number;
  status: string;
  stageReached: { moulding: boolean; assembly: boolean; qc: boolean; dispatch: boolean };
  createdAt: string;
}
export interface CustomerProductOrders {
  product: { id: string; name: string; itemCode: string | null; partName: string | null };
  orders: CustomerProductOrderRow[];
}

export interface CustomerMoldRow {
  moldName: string;
  partName: string | null;
  machine: string | null;
  lastShift: string | null;
  cavity: number;
  required: number;
  produced: number;
  goodParts: number;
  pending: number;
  surplus: number;
  rejectedParts: number;
  rejectionRate: number;
  progressPct: number;
  lastUpdatedAt: string | null;
}
export interface CustomerTimelineStep {
  label: string;
  at: string | null;
  done: boolean;
}
export interface CustomerOrderDashboard {
  order: {
    id: string;
    orderCode: string;
    poNumber: string | null;
    product: string | null;
    itemCode: string | null;
    partName: string | null;
    customer: string | null;
    orderQuantity: number;
    overallProgressPct: number;
    status: string;
    createdAt: string;
  };
  moulding: {
    progressPct: number;
    requiredQuantity: number;
    producedQuantity: number;
    remainingQuantity: number;
    surplus: number;
    goodParts: number;
    rejectedParts: number;
    rejectionRate: number;
    lastUpdatedAt: string | null;
    status: string;
    molds: CustomerMoldRow[];
  };
  assembly: {
    progressPct: number;
    requiredQuantity: number;
    goodAssemblies: number;
    pending: number;
    rejected: number;
    rejectionRate: number;
    operators: number;
    status: string;
    lastUpdatedAt: string | null;
  };
  qc: {
    progressPct: number;
    passed: number;
    failed: number;
    inspected: number;
    pendingInspection: number;
    passRate: number;
    defects: { type: string; quantity: number }[];
    photos: Media[];
    status: string;
    lastUpdatedAt: string | null;
  };
  dispatch: {
    progressPct: number;
    dispatchedQuantity: number;
    remainingQuantity: number;
    cartonCount: number;
    shipmentCount: number;
    lastDispatchDate: string | null;
    status: string;
    shipments: {
      dispatchDate: string;
      quantity: number;
      cartonCount: number;
      transporter: string | null;
      vehicleNumber: string | null;
      lrNumber: string | null;
      invoiceNumber: string | null;
    }[];
  };
  defectReports: CustomerDefectReport[];
  timeline: CustomerTimelineStep[];
}

// Customer-visible defect report (image-first QC report authored by an engineer).
export interface CustomerDefectReport {
  id: string;
  department: QCDepartment;
  severity: QCSeverity;
  status: QCStatusValue;
  defects: string[];
  description: string | null;
  machine: string | null;
  mould: string | null;
  part: string | null;
  shift: 'A' | 'B' | 'C' | null;
  photos: Media[];
  comments: CustomerQCComment[];
  createdAt: string;
}

// A QC comment as exposed to the customer portal (internal author id stripped).
export interface CustomerQCComment {
  id?: string;
  authorName: string | null;
  authorRole: string | null;
  text: string;
  createdAt: string;
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
  itemCode: string | null;
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
// A mould already configured on another item-code job in the SAME purchase order — offered
// for reuse (identity + cavity + part) with a NEW required-shots target (never inherited).
export interface POMoldSuggestion {
  moldName: string;
  partName: string;
  cavity: number;
}
export interface OrderMoldsResponse {
  orderId: string;
  customerId: string;
  productId: string;
  molds: OrderMold[];
  suggestions: OrderMoldSuggestion[];
  poSuggestions?: POMoldSuggestion[];
}
// ---- Production Store (live views from moulding records; by Mould) ----
export interface ProductionStoreMould {
  moldName: string;
  partName: string;
  cavity: number;
  produced: number;
  requiredPieces: number;
  surplus: number;
}
export interface ProductionStoreItem {
  orderId: string;
  itemCode: string | null;
  productName: string | null;
  moulds: ProductionStoreMould[];
  totalProduced: number;
  totalSurplus: number;
}
export interface ProductionStorePO {
  id: string;
  poNumber: string | null;
  customerId: string;
  customerName: string | null;
}
export interface ProductionItemCodeStore {
  purchaseOrder: ProductionStorePO;
  items: ProductionStoreItem[];
}
export interface POCumulativeMould {
  moldName: string;
  cavity: number;
  totalProduced: number;
  totalSurplus: number;
  breakdown: { orderId: string; itemCode: string | null; productName: string | null; produced: number; surplus: number }[];
}
export interface ProductionCumulativeStore {
  purchaseOrder: ProductionStorePO;
  moulds: POCumulativeMould[];
}

export interface OrderMoldInput {
  orderId: string;
  customerId?: string;
  productId?: string;
  moldName: string;
  partName: string;
  cavity: number;
  requiredShots?: number;
  // When editing an existing setup row, the original mold name so the backend can rename it
  // (instead of creating a duplicate). See req #9.
  originalMoldName?: string;
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
// Inventory is transaction-based: receipts are the source of truth, all quantities below are
// DERIVED by the backend reconcile engine.
export interface OutsourcedItem {
  id: string;
  customerId: string;
  productId: string;
  orderId: string | null;
  componentName: string;
  perSet: number; // per-order BOM snapshot (parts per assembled set)
  requiredQuantity: number; // orderQuantity × perSet
  quantityOnHand: number; // allocated to this order (received + surplus drawn − consumed)
  procurementNeed: number; // still to PURCHASE after existing surplus is applied
  received: number; // total received for this order+component (Σ receipts)
  updatedAt?: string;
}
export interface OutsourcedReceipt {
  id: string;
  customerId: string;
  productId: string;
  orderId: string;
  componentName: string;
  quantityReceived: number;
  perSet: number;
  remarks: string | null;
  createdBy: string;
  createdAt: string;
  canEdit: boolean;
}
export interface OutsourcedStore {
  customerId: string;
  productId: string;
  orderId: string;
  components: OutsourcedItem[]; // this order's BOM/components (derived)
  surplus: OutsourcedItem[]; // product-level surplus (pooled across orders)
  receipts: OutsourcedReceipt[]; // received-stock transaction history for this order
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
  itemCode: string | null;
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
  itemCode: string | null;
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
  itemCode: string | null;
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
  itemCode: string | null;
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

// ---------------------------------------------------------------------------
// QC (Quality Management) module — centralized, image-first defect reports.
// One shape powers both the Moulding QC and Assembly QC tabs (via `department`).
// Mirrors backend qcReport.service `toPublicReport`.
// ---------------------------------------------------------------------------
export type QCDepartment = 'moulding' | 'assembly';
export type QCSeverity = 'minor' | 'major' | 'critical';
// Simplified QC lifecycle (2026-07): a case is either Open or Closed.
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
  // Resolved labels (attached by the list endpoint for readable Admin/QC lists).
  orderCode?: string | null;
  customerName?: string | null;
  productName?: string | null;
  itemCode?: string | null;
}
export interface QCCountBucket {
  label: string;
  count: number;
}
export interface QCOrderContext {
  order: {
    id: string;
    orderCode: string | null;
    orderQuantity: number;
    customerId: string;
    productId: string;
    customerName: string | null;
    productName: string | null;
    itemCode: string | null;
    productionStatus: string;
    assemblyStatus: string;
  };
  department: QCDepartment;
  progress: { status: string; progressPct: number; producedQuantity: number; targetQuantity: number };
  machines: string[];
  moulds: string[];
  counts: { total: number; open: number; resolved: number; critical: number };
  latest: QCReport[];
}
export interface QCSummary {
  totals: { total: number; open: number; resolved: number; rejected: number; critical: number };
  mostCommonDefects: QCCountBucket[];
  defectsByMachine: QCCountBucket[];
  defectsByMould: QCCountBucket[];
}
// One order inside a department's QC tab (req #11). Stays listed until the engineer
// presses "Done Uploading QC Photos"; production completion never removes it.
export interface QCActiveOrder {
  id: string;
  orderCode: string | null;
  purchaseOrderId: string | null;
  customerId: string;
  productId: string;
  customerName: string | null;
  productName: string | null;
  itemCode: string | null;
  orderQuantity: number;
  productionStatus: string;
  productionComplete: boolean;
  reportCount: number;
  openCount: number;
  lastReportAt: string | null;
}
export interface QCActiveOrdersResponse {
  orders: QCActiveOrder[];
}

// A Purchase Order inside a department's QC tab (PO-level active/archive, req #12).
export interface QCActivePO {
  id: string;
  poNumber: string | null;
  customerId: string;
  customerName: string | null;
  itemCount: number;
  reportCount: number;
  openCount: number;
  lastReportAt: string | null;
}
export interface QCActivePOsResponse {
  purchaseOrders: QCActivePO[];
}

export interface QCNotification {
  id: string;
  reportId: string;
  department: string;
  customerId: string;
  orderId: string;
  severity: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}
