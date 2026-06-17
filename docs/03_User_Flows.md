# Complete User Flows
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Sources: `docs/FFT_Manufacturing_Platform_Requirements.docx`, `PROJECT_PLAN.md`.
> Flows describe **only** behaviour supported by the requirements. Steps that depend on unspecified rules (e.g., order creation, progress-% formula) are marked **[OPEN — see 05]**.

---

## 0. Common authentication flow (all roles)
```
Open app  →  Login with credentials  →  Backend authenticates & resolves role
          →  Route to role's home screen
                • Engineer  → their single department data-entry screen (view + create, own dept only)
                • Customer  → Customer Dashboard (own data only)
                • Admin     → Master-data management (create) + all-data view (read-only)
```
*(Req: "Login using their credentials"; PROJECT_PLAN: role-based auth, access rules)*

---

## 0b. Admin — create master data (Customers, Products, Orders)  *(Clarification 2026-06-06)*
```
Login → Admin master-data area
  → Create Customer (company/brand served by the unit)
  → Create Product under a Customer        (a Customer may have many Products)
  → Create Order under a Product, set Order Quantity   (a Product may have many Orders)
  → Master data is created-only in V1 (no edit/delete)
  → Created Customers/Products/Orders become available to engineers as dropdown options,
    and Order Quantity propagates to all department modules + the customer dashboard
```
*(Resolves Q-O1, Q-L1, Q-MULTI1. Admin does NOT create department production records.)*

---

## 1. Moulding Engineer — submit production record
```
Login → Moulding entry screen (own department only)
  → SELECT from dropdowns (no free text):
       Customer → Product → Order   (cascading, from Admin master data)
  → Order Quantity auto-populated (read-only, from the selected Order)
  → Fill department fields:
       Part Name, Mold Number, Machine Number, Shift (A/B/C),
       Production Quantity, Good Parts Produced, Rejected Parts,
       Rejection Reason, Comments
  → Upload image from phone
  → Submit  → record linked to the selected Order/Product/Customer by reference
  → Record stored as PERMANENT, create-only (no edit/delete)
  → System updates customer-visible Moulding Status & Production Progress %  [OPEN: %-formula]
  → If this is the order's first production event → trigger "Production Starts" notification  [OPEN: trigger rule]
  → Engineer can VIEW Moulding records only — not Assembly/QC/Dispatch
```
*(Req: Module 1, Notifications; PROJECT_PLAN: create-only; Clarification: dropdown selection)*

## 2. Assembly Engineer — submit assembly record
```
Login → Assembly entry screen (own department only)
  → SELECT Customer → Product → Order from dropdowns (no free text)
  → Order Quantity auto-populated (read-only)
  → Fill department fields:
       Assembly Type, Sub Assembly, Final Assembly,
       Shift, Quantity Assembled, Labour Utilized, Remarks
  → Upload images (optional)
  → Submit → PERMANENT record (linked to selected Order by reference)
  → Customer sees: Assembly Progress, Quantity Completed, Production Status
  → Labour Utilized & internal productivity stay FFT-only
  → Engineer can VIEW Assembly records only
  → Timeline stage "Assembly" reflects progress  [OPEN: stage-status rule]
```
*(Req: Module 2; Clarification: dropdown selection)*

## 3. QC Engineer — submit inspection record
```
Login → QC entry screen (own department only)
  → SELECT Customer → Product → Order from dropdowns (no free text)
  → Order Quantity auto-populated (read-only)
  → Fill department fields:
       Inspection Date, Defect Category (Minor/Major/Critical),
       Defect Quantity, Defect Description, Corrective Action Taken
  → Upload defect images
  → Submit → PERMANENT record (linked to selected Order by reference)
  → Customer sees full Daily QC Report, Defect Summary, Defect Images, Corrective Actions
  → Engineer can VIEW QC records only
  → On QC completion → trigger "QC Completes" notification  [OPEN: what marks QC "complete"]
```
*(Req: Module 3, Notifications; Clarification: dropdown selection)*

## 4. Packing & Dispatch Engineer — submit packing/dispatch record
```
Login → Packing & Dispatch entry screen (own department only)
  → SELECT Customer → Product → Order from dropdowns (no free text)
  → Order Quantity auto-populated (read-only)
  → Fill department fields:
       Number of Boxes Packed, Quantity Packed,
       Ready for Dispatch Quantity, Dispatch Date, Vehicle Details, LR Number
  → Upload Invoice document
  → Submit → PERMANENT record (linked to selected Order by reference)
  → Customer sees: Ready Stock, Dispatch Status, Delivery Status, Dispatch Documents
  → Engineer can VIEW Packing & Dispatch records only
  → Trigger "Dispatch is Scheduled" and later "Goods are Dispatched" notifications  [OPEN: triggers]
```
*(Req: Module 4, Notifications; Clarification: dropdown selection)*

## 5. Customer — view dashboard & timeline
```
Login → Customer Dashboard (scoped to own customer identity)
  → View Production Status: Order Quantity, Produced Quantity, Pending Quantity, Progress %
  → View Moulding Status: Current Mold Running, Current Production, Rejections, Good Parts
  → View Assembly Status: Quantity Assembled, Assembly Progress
  → View Quality Status: Daily QC Reports, Defects Found, Images
  → View Dispatch Status: Ready Stock, Expected Dispatch Date, Delivery Progress
  → Open Production Timeline:
       Order Received ✓ → Moulding → Assembly → QC → Dispatch
       (each: Completed ✓ / In Progress / Pending)
  → Cannot view any other customer's data (enforced server-side)
```
*(Req: Module 5, Production Timeline; PROJECT_PLAN: customer isolation)*

## 6. Customer — receive notifications
```
Production event occurs →
  System sends automatic notification to the owning customer for:
     • Production Starts
     • Production Completes
     • QC Completes
     • Dispatch is Scheduled
     • Goods are Dispatched
```
*(Req: Notifications)* — delivery channel **[OPEN: Q-N1]**

## 7. Admin — create master data & view all data
```
Login → Admin home
  → Create master data: Customers, Products, Orders (with Order Quantity)  [see flow 0b]
  → All-data view (read-only) across all customers and all departments
  → Master data: create-only in V1. Production records: view-only (Admin never authors them).
```
*(PROJECT_PLAN: Admin views all; Clarification: Admin creates master data)*

---

## 8. Flow-level invariants
- Every Submit produces a **permanent, immutable** record. *(V1 Rules)*
- Customer-facing reads are always filtered to the authenticated customer. *(Access Rules)*
- Engineer entry screens are restricted to the engineer's own module. *(Access Rules)*
- Notifications and progress indicators are **derived** from submitted records; their exact computation rules are open questions in `05_Missing_Requirements.md`.

---

## 9. Order/master-data provisioning — **[RESOLVED 2026-06-06]**
The **Admin** creates Customers, Products and Orders (flow 0b/§7). One unit → many Customers; each Customer → many Products; each Product → many Orders; Order Quantity is Admin-defined. Engineers select these via cascading dropdowns (Customer → Product → Order) and the Order Quantity auto-populates across modules. This resolves the previously-blocking Q-O1, Q-L1 and Q-MULTI1 in `05_Missing_Requirements.md`.
