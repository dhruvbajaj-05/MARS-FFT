# Database Entities (Conceptual Data Model)
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Sources: `docs/FFT_Manufacturing_Platform_Requirements.docx`, `PROJECT_PLAN.md`.
> This is a **conceptual** entity model derived strictly from requirement fields — not a physical schema, and not yet approved architecture. Every attribute traces to a named requirement field. Attributes needed to make the model coherent but **not** named in the sources are marked **[INFERRED — needs approval]** and cross-referenced to `05_Missing_Requirements.md`.
> V1 constraint: all records (master data **and** production) are **insert-only / immutable** (no update, no delete). *(PROJECT_PLAN: V1 Rules)*
>
> **Clarification applied (2026-06-06):** Customer, Product and Order are **Admin-created master data**. Cardinality is **Customer 1—* Product 1—* Order**. Engineers select Customer→Product→Order via cascading dropdowns (no free text), so every production record carries **confirmed foreign keys** to Order/Product/Customer — the earlier free-text linkage risk is removed. Order Quantity is Admin-set on the Order and auto-populates downstream. (Resolves Q-O1, Q-L1, Q-MULTI1.)

---

## 1. Entity overview
| Entity | Origin | Purpose |
|---|---|---|
| User | Roles, role-based auth | Authentication & role assignment |
| Customer | "Customer Name", Module 5 | **Admin-created** buyer/brand; owns products/orders; data-isolation boundary |
| Product | "Product Name" (all modules) | **Admin-created** item manufactured for a Customer (Customer 1—* Product) |
| Order | "Order Quantity", "Order Received" (Module 5, Timeline) | **Admin-created** order under a Product (Product 1—* Order); Order Quantity Admin-set |
| MouldingRecord | Module 1 | One Moulding submission |
| AssemblyRecord | Module 2 | One Assembly submission |
| QCRecord | Module 3 | One QC inspection submission |
| PackingDispatchRecord | Module 4 | One Packing & Dispatch submission |
| MediaAsset | Image/Invoice uploads (Modules 1–4) | Stored images & dispatch documents |
| Notification | Notifications section | Customer notification events |

> **Note on linkage (RESOLVED 2026-06-06):** Engineers select from Admin-created masters via cascading dropdowns (Customer→Product→Order); no free-text names. Every production record stores confirmed FKs (order_id → product_id → customer_id). This enforces correct attribution and the mandatory customer-data isolation (C5).

---

## 2. Entities & attributes

### 2.1 User  *(Roles, auth)*
| Attribute | Notes |
|---|---|
| user_id (PK) | [INFERRED] |
| name / login credential | "Login using their credentials" |
| role | enum: Admin, MouldingEngineer, AssemblyEngineer, QCEngineer, PackingDispatchEngineer, Customer |
| customer_id (FK, nullable) | set when role = Customer, links to Customer |
| created_at | [INFERRED] |

### 2.2 Customer  *(Module 5; "Customer Name"; Admin-created)*
| Attribute | Notes |
|---|---|
| customer_id (PK) | [INFERRED] |
| customer_name | named field |
| created_by (User FK = Admin) | Admin creates Customers (Clarification) |
> Isolation boundary: all customer-facing reads filter on customer_id. *(C5)*

### 2.3 Product  *(all modules; "Product Name", "Part Name"; Admin-created)*
| Attribute | Notes |
|---|---|
| product_id (PK) | [INFERRED] |
| product_name | named field |
| part_name | Module 1 "Part Name" |
| customer_id (FK) | **confirmed** — Product belongs to a Customer (1—*) |
| created_by (User FK = Admin) | Admin creates Products (Clarification) |

### 2.4 Order  *(Module 5: Order/Produced/Pending Quantity; Timeline: "Order Received"; Admin-created)*
| Attribute | Notes |
|---|---|
| order_id (PK) | [INFERRED] |
| product_id (FK) | **confirmed** — Order belongs to a Product (1—*) |
| customer_id (FK) | **confirmed** — denormalized from Product for isolation/query convenience |
| order_quantity | "Order Quantity" — **Admin-set**; auto-populates engineer screens & dashboard |
| produced_quantity | "Produced Quantity" — likely derived from records [OPEN: derived vs stored — Q-DERIVE1] |
| pending_quantity | "Pending Quantity" — likely derived |
| production_progress_pct | "Production Progress %" — formula **[OPEN — Q-P1]** |
| current_stage | Timeline: Order Received / Moulding / Assembly / QC / Dispatch [OPEN: how set — Q-T1] |
| created_by (User FK = Admin) | Admin creates Orders (Clarification) |
> Order creation is **Admin-owned** (Resolved Q-O1) — see `03_User_Flows.md §0b/§7`.

### 2.5 MouldingRecord  *(Module 1)*
| Attribute | Source field | Customer-visible |
|---|---|---|
| moulding_record_id (PK) | [INFERRED] | — |
| order_id / product_id / customer_id (FK) | **confirmed** — set from engineer dropdown selection | — |
| product_name | ✓ | yes |
| part_name | ✓ | no |
| mold_number | "Mold Number" / "Mold Currently Running" | yes |
| machine_number | "Machine Number" / "Machine Running" | yes |
| shift | A/B/C | no |
| production_quantity | "Production Quantity" / "Production Completed" | yes |
| good_parts | "Good Parts Produced" | yes |
| rejected_parts | "Rejected Parts" | yes |
| rejection_reason | ✓ | no |
| comments | ✓ | no |
| image (MediaAsset FK) | "Image Upload" | no |
| submitted_by (User FK), submitted_at | [INFERRED] audit | no |
> Hidden items (Number of Workers, Machine Efficiency, Internal Factory Info, Production Costs) are **not** entry fields in the source — **not modelled** unless clarified (Q-M1).

### 2.6 AssemblyRecord  *(Module 2)*
| Attribute | Source field | Customer-visible |
|---|---|---|
| assembly_record_id (PK) | [INFERRED] | — |
| order_id / product_id / customer_id (FK) | **confirmed** — set from engineer dropdown selection | — |
| product_name | ✓ | via dashboard |
| assembly_type | "Assembly Type" | no |
| sub_assembly | "Sub Assembly" | no |
| final_assembly | "Final Assembly" | no |
| shift | ✓ | no |
| quantity_assembled | "Quantity Assembled" / "Quantity Completed" | yes |
| labour_utilized | ✓ | **no (FFT only)** |
| remarks | ✓ | no |
| images (MediaAsset FK, optional) | "Images (Optional)" | no |
| submitted_by, submitted_at | [INFERRED] | no |

### 2.7 QCRecord  *(Module 3)*
| Attribute | Source field | Customer-visible |
|---|---|---|
| qc_record_id (PK) | [INFERRED] | — |
| order_id / product_id / customer_id (FK) | **confirmed** — set from engineer dropdown selection | — |
| product_name | ✓ | yes |
| inspection_date | ✓ | yes |
| defect_category | enum: Minor/Major/Critical | yes |
| defect_quantity | ✓ | yes |
| defect_description | ✓ | yes |
| corrective_action | "Corrective Action Taken" | yes |
| defect_images (MediaAsset FK) | ✓ | yes |
| submitted_by, submitted_at | [INFERRED] | — |

### 2.8 PackingDispatchRecord  *(Module 4)*
| Attribute | Source field | Customer-visible |
|---|---|---|
| packing_dispatch_id (PK) | [INFERRED] | — |
| order_id / product_id / customer_id (FK) | **confirmed** — set from engineer dropdown selection | — |
| product_name | ✓ | yes |
| boxes_packed | "Number of Boxes Packed" | no [OPEN] |
| quantity_packed | "Quantity Packed" | no [OPEN] |
| ready_for_dispatch_qty | "Ready for Dispatch Quantity" / "Ready Stock" | yes |
| dispatch_date | "Dispatch Date" / "Expected Dispatch Date" | yes |
| vehicle_details | ✓ | partial [OPEN] |
| lr_number | "LR Number" | partial [OPEN] |
| invoice (MediaAsset FK) | "Invoice Upload" / "Dispatch Documents" | yes |
| dispatch_status / delivery_status | derived | yes [OPEN: how derived] |
| submitted_by, submitted_at | [INFERRED] | — |

### 2.9 MediaAsset  *(Image uploads, Invoice — Modules 1–4)*
| Attribute | Notes |
|---|---|
| media_id (PK) | [INFERRED] |
| type | image / invoice-document |
| storage_reference | file location [OPEN: storage strategy — Q-IMG1] |
| owner_record_type + owner_record_id | polymorphic link to the source record |
| uploaded_by, uploaded_at | [INFERRED] |

### 2.10 Notification  *(Notifications section)*
| Attribute | Notes |
|---|---|
| notification_id (PK) | [INFERRED] |
| customer_id (FK) | recipient |
| order_id (FK) | [INFERRED] context |
| event_type | enum: ProductionStarts, ProductionCompletes, QCCompletes, DispatchScheduled, GoodsDispatched |
| channel | **[OPEN — Q-N1]** push/SMS/email not specified |
| created_at / sent_at | [INFERRED] |

---

## 3. Relationships (conceptual)
```
Customer 1───* Product 1───* Order
Customer 1───* Order
Order   1───* MouldingRecord
Order   1───* AssemblyRecord
Order   1───* QCRecord
Order   1───* PackingDispatchRecord
(Moulding/Assembly/QC/PackingDispatch) 1───* MediaAsset
Customer 1───* Notification *───1 Order
User    1───* (any record)   via submitted_by
User    *───1 Customer        (when role = Customer)
```

---

## 4. Modelling notes & constraints
- **Immutability**: master-data and production-record tables are append-only in V1; no UPDATE/DELETE permissions. *(V1 Rules)*
- **Master-data ownership**: Customer, Product, Order are created only by Admin (`created_by` = Admin). Cardinality Customer 1—* Product 1—* Order is enforced by FKs. *(Clarification — resolves Q-O1, Q-MULTI1)*
- **Name-to-FK linkage (RESOLVED)**: engineers select Customer→Product→Order from dropdowns, so records store confirmed FKs rather than free-text names — satisfying mandatory customer isolation (C5). *(resolves Q-L1)*
- **Order Quantity propagation**: `order.order_quantity` is the single Admin-set source consumed (read-only) by every department screen and the dashboard.
- **Derived vs stored**: Produced/Pending quantity, Production Progress %, and timeline stage status appear to be **computed aggregates** over records, but the formulas are unspecified — see Q-P1/Q-T1. The model leaves them as either stored snapshots or computed views pending decision.
- All **[INFERRED]** attributes are structural minimums (PKs, audit timestamps) required for any working system; they are surfaced for explicit approval rather than silently assumed.
