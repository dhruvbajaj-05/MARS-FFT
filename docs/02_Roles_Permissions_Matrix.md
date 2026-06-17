# User Roles & Permission Matrix
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Sources: `PROJECT_PLAN.md` (User Roles, Access Rules, V1 Rules) and `docs/FFT_Manufacturing_Platform_Requirements.docx` (User Roles, Modules 1–5).
> V1 rule recap: Admin **creates master data** (Customers/Products/Orders) and **views all** production data; engineers **create + view their own department** records and **select** master data via dropdowns; Customer is **view-only** (own data); **no edit, no delete** for anyone. *(PROJECT_PLAN V1 Rules + Clarification 2026-06-06)*

---

## 1. Roles
| # | Role | Type | Core capability |
|---|------|------|------------------|
| 1 | Admin | Internal FFT | **Creates master data** (Customers, Products, Orders); **views all** production data across customers/departments. Does not author department records. *(Clarification 2026-06-06)* |
| 2 | Moulding Engineer | Internal FFT | Create Moulding records only. |
| 3 | Assembly Engineer | Internal FFT | Create Assembly records only. |
| 4 | QC Engineer | Internal FFT | Create QC records only. |
| 5 | Packing & Dispatch Engineer | Internal FFT | Create Packing/Dispatch records only. |
| 6 | Customer / Buyer | External | View only their own products, orders and status. |

---

## 2. Module-level access matrix

Legend: **C** = Create, **R** = Read, **—** = No access. (No U/Update or D/Delete exist in V1.)
"Read (own)" = restricted to the customer's own records. "Read (all)" = across all customers.

| Capability / Module | Admin | Moulding Eng. | Assembly Eng. | QC Eng. | Packing & Dispatch Eng. | Customer |
|---|---|---|---|---|---|---|
| Master data (Customer / Product / Order) | **C** + R (all) | R (dropdown select) | R (dropdown select) | R (dropdown select) | R (dropdown select) | — |
| Moulding records | R (all) | **C + R (own dept)** | — | — | — | R (own, customer-visible fields only) |
| Assembly records | R (all) | — | **C + R (own dept)** | — | — | R (own, customer-visible fields only) |
| QC records | R (all) | — | — | **C + R (own dept)** | — | R (own, customer-visible fields only) |
| Packing & Dispatch records | R (all) | — | — | — | **C + R (own dept)** | R (own, customer-visible fields only) |
| Customer Dashboard | R (all customers) | — | — | — | — | R (own only) |
| Production Timeline | R (all) | — | — | — | — | R (own only) |
| Notifications | — (n/s) | — | — | — | — | R (receives own) |
| Image / document upload | — | C (Moulding) | C (Assembly, optional) | C (QC defect images) | C (Invoice) | R (own, where customer-visible) |

> Notes
> - Engineers access **only their own department module** and cannot access other modules. *(PROJECT_PLAN: Access Rules)*
> - "n/s" = not specified by sources (e.g., whether Admin receives notifications). See `05_Missing_Requirements.md`.

---

## 3. Field-level visibility matrix (Customer vs. FFT-internal)

Only fields explicitly named in the requirements are listed. "Customer" = visible to the owning customer; "FFT only" = Admin/engineers but **not** the customer.

### Module 1 — Moulding *(Req: Module 1)*
| Field | Entered by Eng. | Customer-visible | FFT-only / Hidden |
|---|---|---|---|
| Customer Name | ✓ | (used to scope; not listed as displayed) | — |
| Product Name | ✓ | ✓ | — |
| Part Name | ✓ | — | ✓ |
| Mold Number / "Mold Currently Running" | ✓ | ✓ | — |
| Machine Number / "Machine Running" | ✓ | ✓ | — |
| Shift (A/B/C) | ✓ | — | ✓ |
| Production Quantity / "Production Completed" | ✓ | ✓ | — |
| Good Parts Produced | ✓ | ✓ | — |
| Rejected Parts | ✓ | ✓ | — |
| Rejection Reason | ✓ | — | ✓ |
| Comments | ✓ | — | ✓ |
| Image Upload | ✓ | (not stated visible) | ✓ (default hidden) |
| Production Progress % | (derived) | ✓ | — |
| Number of Workers | (not in entry list) | ✗ Hidden | ✓ |
| Machine Efficiency Data | (not in entry list) | ✗ Hidden | ✓ |
| Internal Factory Information | (not in entry list) | ✗ Hidden | ✓ |
| Production Costs | (not in entry list) | ✗ Hidden | ✓ |

### Module 2 — Assembly *(Req: Module 2)*
| Field | Entered | Customer-visible | FFT-only |
|---|---|---|---|
| Customer Name | ✓ | (scope) | — |
| Product Name | ✓ | (via dashboard) | — |
| Assembly Type / Sub Assembly / Final Assembly | ✓ | — (not listed) | ✓ |
| Shift | ✓ | — | ✓ |
| Quantity Assembled / "Quantity Completed" | ✓ | ✓ | — |
| Assembly Progress | (derived) | ✓ | — |
| Production Status | — | ✓ | — |
| Labour Utilized | ✓ | ✗ | ✓ |
| Internal Productivity Information | — | ✗ | ✓ |
| Remarks | ✓ | — | ✓ |
| Images (Optional) | ✓ (optional) | — | ✓ |

### Module 3 — QC *(Req: Module 3)*
| Field | Entered | Customer-visible | FFT-only |
|---|---|---|---|
| Product Name | ✓ | ✓ | — |
| Inspection Date | ✓ | ✓ (Daily QC Report) | — |
| Defect Category (Minor/Major/Critical) | ✓ | ✓ (Defect Summary) | — |
| Defect Quantity | ✓ | ✓ (Defect Summary) | — |
| Defect Description | ✓ | ✓ (Defect Summary) | — |
| Defect Images | ✓ | ✓ | — |
| Corrective Action Taken | ✓ | ✓ (Corrective Actions) | — |

> All QC data is customer-visible by design — "increases transparency and customer confidence." *(Req: Module 3)*

### Module 4 — Packing & Dispatch *(Req: Module 4)*
| Field | Entered | Customer-visible | FFT-only |
|---|---|---|---|
| Product Name | ✓ | ✓ | — |
| Number of Boxes Packed | ✓ | — (not listed) | ✓ |
| Quantity Packed | ✓ | — (not listed) | ✓ |
| Ready for Dispatch Quantity / "Ready Stock" | ✓ | ✓ | — |
| Dispatch Date / "Expected Dispatch Date" | ✓ | ✓ | — |
| Vehicle Details | ✓ | (via Dispatch/Delivery Status) | partial |
| LR Number | ✓ | (via Dispatch Documents) | partial |
| Invoice Upload / "Dispatch Documents" | ✓ | ✓ | — |
| Dispatch Status / Delivery Status | (derived) | ✓ | — |

> Where the requirements list an entered field but do not list it as customer-visible, the **default is FFT-only** (per C5: customer sees only explicitly-visible data). Ambiguous mappings (e.g., Vehicle Details, LR Number) are flagged in `05_Missing_Requirements.md`.

---

## 4. Cross-cutting permission rules
- **R1** — Server-side enforcement: all access checks happen on the backend, never relying on client hiding of fields. *(NFR-3)*
- **R2** — Customer scoping: every customer-facing query is filtered to the authenticated customer's identity. *(PROJECT_PLAN: Access Rules)*
- **R3** — Department scoping: every engineer write is constrained to their own module. *(PROJECT_PLAN: Access Rules)*
- **R4** — Immutability: no role exposes edit/delete in V1. *(PROJECT_PLAN: V1 Rules)*
