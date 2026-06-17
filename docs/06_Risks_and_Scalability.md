# Potential Risks & Future Scalability Considerations
## FFT Manufacturing Transparency Platform

> Sources: `FFT_Manufacturing_Platform_Requirements.docx`, `PROJECT_PLAN.md`.
> This document identifies risk; it does **not** propose architecture (that step awaits approval). "Future" items align with the requirements' own statement that "Future versions may add editing, approvals, analytics and advanced workflows."

---

## 1. Risks

### 1.1 Security & data-isolation risks (highest priority)
| ID | Risk | Impact | Mitigation direction |
|---|---|---|---|
| R-S1 | Cross-customer data leakage — a customer sees another customer's data. Mandatory to prevent (C5). | Severe (trust, contractual) | Enforce customer scoping server-side on every query; never rely on client-side hiding; test with negative cases. |
| R-S2 | Free-text "Customer Name"/"Product Name" misattributes a record to the wrong customer (Q-L1). | Severe — breaks isolation + corrupts dashboards | Resolve Q-L1: use selectable master records, not free text. |
| R-S3 | Over-exposure of FFT-internal fields (Labour Utilized, costs, efficiency) via API even if hidden in UI. | High | Field-level authorization at the API layer, not just the screen. |
| R-S4 | Weak auth lifecycle (no reset/session policy defined — Q-AUTH1). | High | Define token/session policy, password reset, lockout before launch. |
| R-S5 | Image/invoice uploads as an attack/leak vector (no constraints — Q-IMG1). | Medium-High | Validate type/size, scan, store with access control scoped to customer. |

### 1.2 Data-integrity risks (amplified by create-only MVP)
| ID | Risk | Impact | Mitigation direction |
|---|---|---|---|
| R-D1 | **No edit/delete** means erroneous submissions are permanent and visible to customers immediately. | High — wrong data shown to customers, no correction path | Confirm V1 correction strategy (e.g., a later "correction record"); set engineer expectations; consider confirmation step before submit. |
| R-D2 | Undefined progress-% and timeline rules (Q-P1/Q-T1) produce inconsistent or misleading status. | High | Lock formulas before build. |
| R-D3 | Derived vs stored aggregates ambiguity (Q-DERIVE1) → drift between dashboard numbers and underlying records. | Medium | Decide single source of truth; prefer computed-from-records. |
| R-D4 | No order/product provisioning path (Q-O1) → records cannot be reliably tied to orders. | Blocking | Resolve provisioning before schema. |

### 1.3 Operational / mobile risks
| ID | Risk | Impact | Mitigation direction |
|---|---|---|---|
| R-O1 | Factory-floor connectivity gaps interrupt submissions (no offline spec — Q-OFFLINE1). | Medium-High | Decide offline queue/retry strategy for the Android app. |
| R-O2 | Large image uploads over poor mobile networks fail or are slow. | Medium | Client-side compression, resumable upload, size limits. |
| R-O3 | Notification reliability/cost (channel unspecified — Q-N1). | Medium | Choose channel; plan for delivery confirmation/retry. |
| R-O4 | iOS deferred — divergence between Android-first and later iOS builds. | Low-Medium | Favour cross-platform-friendly approach to ease later iOS. |

### 1.4 Process / project risks
| ID | Risk | Impact | Mitigation direction |
|---|---|---|---|
| R-P1 | Building before Blocking questions (Section A of doc 05) are answered → rework. | High | Hold for approval; resolve blockers first (this is the mandated process). |
| R-P2 | Scope creep from "future" features (editing, approvals, analytics) into MVP. | Medium | Keep V1 strictly create-only/view-only per PROJECT_PLAN. |
| R-P3 | Requirement contradictions (doc 05 §D) carried silently into design. | Medium | Force explicit decisions on each contradiction. |

---

## 2. Future scalability considerations
> Explicitly framed as **post-V1**, consistent with "Future versions may add editing, approvals, analytics and advanced workflows."

### 2.1 Functional growth (from the requirements' own roadmap)
- **Editing & corrections** — move beyond create-only; needs versioning/audit so history of permanent records is preserved.
- **Approvals / workflow** — multi-step review of submissions before they become customer-visible.
- **Analytics** — trends on rejections, defect categories, throughput per shift/machine; the internal-only fields (efficiency, labour, costs) become analytics inputs.
- **Advanced workflows** — e.g., automatic stage transitions, SLA tracking, exception handling.

### 2.2 Platform growth
- **iOS support** after Android — choose a path that doesn't force a rewrite.
- **Web portal** for customers/admin alongside mobile.
- **Notification expansion** — multi-channel (push + email + SMS), preferences per customer.

### 2.3 Data & scale growth
- **Volume**: append-only records grow continuously; plan indexing on (customer_id, order_id, submitted_at) and an archival/retention strategy (Q-RETENTION1).
- **Media storage**: images/invoices grow fastest; offload to object storage with lifecycle policies rather than the primary DB.
- **Read-heavy dashboards**: customer dashboards and timelines are read-heavy aggregations; consider read models / caching as customers scale.
- **Multi-tenant scaling**: as customer count grows, the isolation boundary (R-S1) must scale with consistent per-tenant filtering and testing.

### 2.4 Organizational growth
- More departments/modules beyond the current five — model modules extensibly so a new module doesn't require reworking core entities.
- Role granularity — sub-roles, supervisors, multi-department engineers (V1 assumes one engineer ↔ one module).

---

## 3. Priority summary
1. Resolve **Blocking** open questions (doc 05 §A) — especially data isolation (R-S1/R-S2) and order provisioning (R-D4).
2. Lock **derivation rules** (progress %, timeline, notifications) — R-D2/R-D3/R-O3.
3. Decide **correction strategy** for the create-only constraint — R-D1.
4. Define **mobile resilience** (offline, uploads) — R-O1/R-O2.
5. Only then proceed to System Architecture and physical schema.
