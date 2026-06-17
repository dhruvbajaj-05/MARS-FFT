# Software Requirements Specification (SRS)
## FFT Manufacturing Transparency Platform — Version 1 (MVP)

> **Sources of truth:** `docs/FFT_Manufacturing_Platform_Requirements.docx` and `PROJECT_PLAN.md`.
> No business logic or data field appears in this document unless it traces to one of those sources. Items not covered by the sources are **not** specified here — they are listed in `05_Missing_Requirements.md` as open questions.

---

## 1. Introduction

### 1.1 Purpose
Provide real-time visibility of manufacturing activities to FFT management and to customers, so customers can view the live status of their products from production to dispatch without repeated phone calls or update requests. *(Req: Project Objective)*

### 1.2 Scope (V1 / MVP)
- A **mobile-first** application (Android first, iOS later) used by factory engineers to submit production data directly from the floor, including image uploads. *(Req: Mobile Application Requirement; PROJECT_PLAN Application Requirements)*
- An **Admin who creates and owns the master data** — Customers, Products and Orders — for the manufacturing unit. Engineers and customers consume this master data; they never create it. *(Clarification, 2026-06-06)*
- A customer-facing dashboard showing only the requesting customer's own products and order status. *(Req: Module 5)*
- **Create-only MVP**: users can create records only — no editing, no deletion. Every submission is a permanent record. *(PROJECT_PLAN: Version 1 Rules)*

> **V1 master-data & flow model (clarified 2026-06-06):**
> - The Admin creates **Customers**, **Products** and **Orders** for the factory.
> - Cardinality: one manufacturing unit → **many Customers**; each Customer → **many Products**; each Product → **many Orders**. The **Order Quantity** is defined by the Admin per order.
> - Engineers **never type** customer or product names. They **select** an existing Customer → Product → Order from dropdowns; the Order Quantity (set by Admin) is **auto-populated** and flows into every department module and the customer dashboard.
> - Each engineering department (Moulding, Assembly, QC, Packing & Dispatch) creates permanent records **for its own department only**, and can **view only its own department's** data — not other departments'.
> - The Admin can **view all** factory data across customers and departments.
> - Each Customer sees a dashboard for **only their own brand/company** — never another customer's data.

### 1.3 Definitions
| Term | Meaning (per sources) |
|------|------------------------|
| Engineer | An internal FFT user who submits data for exactly one department module. |
| Customer / Buyer | External user who views only their own products, orders and production status. |
| Admin | Internal user who views all data across all customers and departments. |
| Module | A department-scoped data-entry + visibility unit (Moulding, Assembly, QC, Packing & Dispatch). |
| Shift | Production shift labelled A, B or C. *(Req: Module 1)* |
| Permanent record | A submitted record that cannot be edited or deleted in V1. |

---

## 2. Overall Description

### 2.1 User classes
*(PROJECT_PLAN: User Roles; Req: User Roles)*
1. Admin
2. Moulding Engineer
3. Assembly Engineer
4. QC Engineer
5. Packing & Dispatch Engineer
6. Customer / Buyer

### 2.2 Operating environment
- Mobile-first; Android first, iOS support later. *(PROJECT_PLAN)*
- Engineers operate from smartphones on the factory floor and upload images from the phone. *(Req: Mobile Application Requirement)*

### 2.3 Design and implementation constraints (MVP)
*(PROJECT_PLAN: Version 1 Rules)*
- C1. Records can be **created only**; no edit, no delete.
- C2. Engineers **only submit** department records (and view their own department); Customers **only view** (own data); Admin **creates master data** (Customers/Products/Orders) and **views all** production data — Admin does not create or edit department production records. *(Clarification 2026-06-06)*
- C3. Every submission is stored as a **permanent record**.
- C4. Role-based authentication is **required**.
- C5. **Secure customer data separation is mandatory** — a customer must never see another customer's data.
- C6. No field may exist that is not supported by requirements; no invented business logic. *(PROJECT_PLAN: Source of Truth)*

---

## 3. Functional Requirements

> Notation: **FR-x** = functional requirement. Each lists the exact data fields named in the requirements document. Optionality is marked only where the source marks it.

### 3.1 Authentication & Authorization
- **FR-1** The system shall authenticate users via credentials and enforce role-based access. *(Req: Mobile App — "Login using their credentials"; PROJECT_PLAN: "Role-based authentication is required")*
- **FR-2** The system shall restrict each user to data relevant to their role only. *(Req: "Each user will only be able to access the information relevant to their role")*
- **FR-3** An Engineer shall access **only their own department module** and no other. *(PROJECT_PLAN: Access Rules)*
- **FR-4** A Customer shall access **only their own** products, orders and production status, and shall not access any other customer's data. *(PROJECT_PLAN: Access Rules; Req: Module 5)*
- **FR-5** Admin shall be able to view **all** data across all customers and departments. *(PROJECT_PLAN: Access Rules)*
- **FR-3a** An Engineer shall be able to **view** the records of **their own department only**, in addition to creating them. *(Clarification 2026-06-06)*

### 3.1a Master Data Management (Admin) *(Clarification 2026-06-06)*
- **FR-5a** Admin shall create **Customer** records (the companies/brands the unit serves).
- **FR-5b** Admin shall create **Product** records, each belonging to a Customer.
- **FR-5c** Admin shall create **Order** records, each belonging to a Product (and thereby a Customer), with the **Order Quantity** defined by the Admin.
- **FR-5d** The system shall support **many Customers**, each with **many Products**, each with **many Orders** (1-to-many at every level).
- **FR-5e** In V1, master data is **created only** (consistent with no-edit/no-delete); only the Admin role may create master data.

### 3.1b Dropdown Selection for Engineers *(Clarification 2026-06-06)*
- **FR-5f** Engineers shall **not** type Customer Name or Product Name as free text.
- **FR-5g** Engineer entry screens shall provide **dropdown selection** of an existing Customer, then Product, then Order (cascading), drawn from Admin-created master data.
- **FR-5h** Upon Order selection, the **Order Quantity** (set by Admin) shall be **auto-populated** and used consistently across all department modules and the customer dashboard.
- **FR-5i** Every department record shall be linked to the selected Order (and its Product and Customer) by reference, guaranteeing correct attribution and customer-data isolation. *(supersedes free-text linkage; satisfies C5)*

### 3.2 Module 1 — Moulding Department *(Req: Module 1)*
- **FR-6** A Moulding Engineer shall create a Moulding production record with fields:
  Customer Name, Product Name, Part Name, Mold Number, Machine Number, Shift (A/B/C), Production Quantity, Good Parts Produced, Rejected Parts, Rejection Reason, Comments, Image Upload.
- **FR-7** The Moulding record shall expose to the Customer only: Product Name, Mold Currently Running, Machine Running, Production Completed, Good Parts Produced, Rejected Parts, Production Progress Percentage.
- **FR-8** The following shall be **hidden** from the Customer: Number of Workers, Machine Efficiency Data, Internal Factory Information, Production Costs.
  > Note: these "hidden" items are listed in the requirements as not-visible but are **not** in the FR-6 entry field list. See `05_Missing_Requirements.md` Q-M1.

### 3.3 Module 2 — Assembly Department *(Req: Module 2)*
- **FR-9** An Assembly Engineer shall create an Assembly record with fields:
  Customer Name, Product Name, Assembly Type, Sub Assembly, Final Assembly, Shift, Quantity Assembled, Labour Utilized, Remarks, Images (Optional).
- **FR-10** The Assembly record shall expose to the Customer only: Assembly Progress, Quantity Completed, Production Status.
- **FR-11** Labour Utilized and Internal Productivity Information shall be visible **only to FFT** (not to Customer).

### 3.4 Module 3 — Quality Control *(Req: Module 3)*
- **FR-12** A QC Engineer shall create a QC record with fields:
  Product Name, Inspection Date, Defect Category (Minor / Major / Critical), Defect Quantity, Defect Description, Defect Images, Corrective Action Taken.
- **FR-13** The QC record shall expose to the Customer: Daily QC Report, Defect Summary, Defect Images, Corrective Actions.

### 3.5 Module 4 — Packing & Dispatch *(Req: Module 4)*
- **FR-14** A Packing & Dispatch Engineer shall create a Packing/Dispatch record with fields:
  Product Name, Number of Boxes Packed, Quantity Packed, Ready for Dispatch Quantity, Dispatch Date, Vehicle Details, LR Number, Invoice Upload.
- **FR-15** The Packing/Dispatch record shall expose to the Customer: Ready Stock, Dispatch Status, Delivery Status, Dispatch Documents.

### 3.6 Module 5 — Customer Dashboard *(Req: Module 5)*
- **FR-16** The dashboard shall be the customer's main screen and show only that customer's products and orders. *(Req: Module 5)*
- **FR-17** The dashboard shall present aggregated **Production Status**: Order Quantity, Produced Quantity, Pending Quantity, Production Progress %.
- **FR-18** The dashboard shall present **Moulding Status**: Current Mold Running, Current Production, Rejections, Good Parts.
- **FR-19** The dashboard shall present **Assembly Status**: Quantity Assembled, Assembly Progress.
- **FR-20** The dashboard shall present **Quality Status**: Daily QC Reports, Defects Found, Images.
- **FR-21** The dashboard shall present **Dispatch Status**: Ready Stock, Expected Dispatch Date, Delivery Progress.

### 3.7 Production Timeline *(Req: Production Timeline)*
- **FR-22** The system shall display an order's progress as an ordered, simple-to-understand timeline with stages: **Order Received → Moulding → Assembly → QC → Dispatch**, each shown as Completed (✓), In Progress, or Pending.

### 3.8 Notifications *(Req: Notifications)*
- **FR-23** The system shall send the customer an automatic notification on each of these events:
  Production Starts, Production Completes, QC Completes, Dispatch is Scheduled, Goods are Dispatched.
  > Delivery channel (push/SMS/email) is not specified by the sources — see `05_Missing_Requirements.md` Q-N1.

### 3.9 Image / Document Upload *(Req: Modules 1–4, Mobile App)*
- **FR-24** Engineers shall be able to upload images directly from their phones in Moulding (required), Assembly (optional), QC (defect images), and an Invoice document in Packing & Dispatch.

---

## 4. Non-Functional Requirements

- **NFR-1 Platform**: Mobile-first; Android first, iOS later. *(PROJECT_PLAN)*
- **NFR-2 Real-time visibility**: Status shown to customers shall reflect submitted production data ("live status"). *(Req: Project Objective)*
- **NFR-3 Security / data isolation**: Customer data separation is mandatory and enforced server-side. *(PROJECT_PLAN: C5)*
- **NFR-4 Immutability**: Submitted records are permanent in V1 (no edit/delete). *(PROJECT_PLAN)*
- **NFR-5 Usability**: Engineers must be able to enter data and upload images quickly from the floor without returning to a computer. *(Req: Mobile App Requirement)*
- **NFR-6 Auditability**: Because records are permanent and create-only, the store inherently serves as an audit log of submissions.

---

## 5. Traceability summary
Every FR above cites its originating requirement. Fields not derivable from the sources (e.g., order creation, progress-% formula, notification channel, units) are **deliberately absent** here and captured as open questions in `05_Missing_Requirements.md`.
