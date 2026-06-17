# Missing Requirements & Open Questions
## FFT Manufacturing Transparency Platform — V1 (MVP)

> These are gaps where the sources (`FFT_Manufacturing_Platform_Requirements.docx`, `PROJECT_PLAN.md`) do not define behaviour. Per `PROJECT_PLAN.md` ("If requirements are unclear or missing, ask questions before making assumptions"), **none of these have been guessed**. Each needs a decision before architecture/code.
> **Blocking** items prevent a coherent design; **Important** items affect correctness/UX; **Minor** items can be defaulted later.

---

## A. Blocking

**Q-O1 — Who creates Customers, Products and Orders, and how?** ✅ **RESOLVED (2026-06-06)**
The **Admin** creates Customers, Products and Orders (Order Quantity Admin-set). One unit → many Customers → many Products → many Orders. Master data is create-only in V1. See SRS FR-5a–5e, User Flows §0b/§7, DB §2.2–2.4.

**Q-L1 — How do engineer submissions link to a specific Customer/Product/Order?** ✅ **RESOLVED (2026-06-06)**
Engineers **select** Customer→Product→Order from cascading dropdowns (no free text); records store confirmed FKs. Order Quantity auto-populates. Satisfies C5 isolation. See SRS FR-5f–5i.

**Q-MULTI1 — Cardinality** ✅ **RESOLVED (2026-06-06)** (moved from §C): Customer 1—* Product 1—* Order, confirmed.

**Q-P1 — How is "Production Progress %" calculated?** ⛔ **STILL OPEN**
Named in Module 1 and Module 5 but no formula. Candidate: good_parts / order_quantity? produced / ordered? Per-stage or overall? Required for FR-7, FR-17.

**Q-T1 — How is each Production Timeline stage's status (✓ / In Progress / Pending) determined?**
No rule for when "Moulding" becomes Complete, when "Assembly" is In Progress, etc. Needed for FR-22.

---

## B. Important

**Q-N1 — Notification delivery channel?**
"Automatic notifications" are required, but push / SMS / email / in-app is unspecified. Android-first suggests push, but unconfirmed. Also: does Admin receive any notifications? Are notifications real-time or batched?

**Q-N2 — Notification trigger definitions?**
What event marks "Production Starts" vs "Production Completes"? What marks "QC Completes"? What distinguishes "Dispatch Scheduled" from "Goods Dispatched" — a status field, or simply record creation vs a later event? (FR-23)

**Q-DERIVE1 — Are Produced/Pending Quantity, Ready Stock, Dispatch/Delivery Status stored or derived?**
Module 5 shows them as aggregates; need to confirm whether they are computed from records or separately entered.

**Q-VIS1 — Customer-visibility of ambiguous Packing fields.**
Are "Vehicle Details" and "LR Number" shown to the customer (as part of "Dispatch Documents"/"Delivery Status") or FFT-only? Module 4 lists them as entered but not explicitly customer-visible.

**Q-M1 — Moulding "hidden" fields not in the entry list.**
"Number of Workers", "Machine Efficiency Data", "Internal Factory Information", "Production Costs" are listed as hidden-from-customer but are **not** in the Moulding entry fields. Are these to be captured at all in V1, or just documented as never-shown? Currently not modelled.

**Q-IMG1 — Image/document upload constraints & storage.**
No spec for allowed formats, max size, count per record, or storage backend. Needed for Modules 1–4 uploads and FR-24.

**Q-AUTH1 — User account lifecycle.**
How are engineer/customer accounts created? Password reset? Session/token policy? Multi-device login? Only "login with credentials" is stated.

---

## C. Minor / defaultable

**Q-UNIT1 — Units & data types** for quantities (pieces?), and whether quantities are integers only.

**Q-SHIFT1 — Shift semantics** — fixed times for A/B/C? Does a submission auto-stamp date/time?

**Q-LANG1 — Localization / language** of the engineer & customer UI (factory floor context).

**Q-OFFLINE1 — Offline capture** — should the mobile app queue submissions when connectivity drops on the floor? Not stated; impacts mobile architecture.

**Q-ADMIN1 — Admin scope of "view all"** — read-only dashboards only, or also exports/reports?

**Q-RETENTION1 — Data retention** — records are permanent in V1; any archival expectation?

---

## D. Contradictions / inconsistencies found in sources
1. **Moulding hidden fields vs entry fields** (Q-M1) — listed as hidden but never entered. ⛔ still open.
2. ~~View-only roles vs. existence of Orders~~ ✅ resolved — Admin creates master data (Q-O1).
3. ~~Free-text names vs mandatory data isolation~~ ✅ resolved — dropdown selection / FK linkage (Q-L1).

> Status: the three **Blocking** master-data questions (Q-O1, Q-L1, Q-MULTI1) are now **resolved**. Remaining before/early in architecture: derivation rules **Q-P1, Q-T1** (progress % and timeline stage status), plus the Section B items (notifications, uploads, auth lifecycle). These can be confirmed in parallel with architecture but must be locked before the affected code is built.
