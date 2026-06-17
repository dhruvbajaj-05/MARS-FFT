# System Architecture
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Built on the approved requirements (`01`–`06`). This is a **mobile app** (not a website): a React Native + Expo client talking to a Node.js + Express REST API backed by MongoDB Atlas, secured with JWT + role-based access control (RBAC).

---

## 1. High-level picture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         MOBILE APP (the product)                       │
│                React Native + Expo  (Android first, iOS later)         │
│                                                                        │
│   Login → role-based home:                                             │
│     • Admin     → create Customers/Products/Orders + view all          │
│     • Engineer  → own department: create + view records (dropdowns)    │
│     • Customer  → own dashboard + timeline + notifications             │
└───────────────────────────────┬────────────────────────────────────── ┘
                                 │  HTTPS (JSON)  +  JWT in Authorization header
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     BACKEND API  (Node.js + Express)                    │
│                                                                        │
│   Routes → Middleware (Auth/JWT → RBAC → Validation) → Controllers     │
│          → Services (business rules) → Models (Mongoose)               │
│                                                                        │
│   Cross-cutting: customer-data isolation, immutable writes,            │
│   image/file upload handling, notification creation                    │
└───────────────┬───────────────────────────────────┬──────────────────┘
                │                                     │
                ▼                                     ▼
   ┌────────────────────────┐            ┌──────────────────────────┐
   │   MongoDB Atlas         │            │  File/Image Storage       │
   │  (managed database)     │            │  (uploads: photos,        │
   │  collections per 04     │            │   invoice PDFs)           │
   └────────────────────────┘            └──────────────────────────┘
```

> **Why this shape:** the requirements demand a mobile-first tool for engineers on the floor, strict per-customer data isolation, and create-only permanent records. A thin mobile client + a single authoritative API that enforces all rules server-side is the simplest way to guarantee isolation and immutability (rules can never be bypassed by the client).

---

## 2. Layers explained simply

### 2.1 Mobile app (React Native + Expo)
- **One app, three experiences** decided by the logged-in user's role (no separate apps).
- **Screens** map 1:1 to the user flows in `03`:
  - Auth: Login.
  - Admin: Customer list/create, Product list/create, Order list/create, All-data browse.
  - Engineer (one of four): a single data-entry screen with cascading **dropdowns** (Customer → Product → Order, Order Quantity auto-filled) + that department's fields + image upload, and a "my department records" list.
  - Customer: Dashboard (Production/Moulding/Assembly/Quality/Dispatch status), Production Timeline, Notifications.
- **State/networking:** a small API client that attaches the JWT to every request; navigation gated by role.
- **Image upload:** uses the phone camera/gallery (Expo ImagePicker) and uploads as multipart form-data.

### 2.2 Backend API (Node.js + Express)
Request pipeline, in order:
1. **Auth middleware** — verifies the JWT, loads the user (id, role, customerId).
2. **RBAC middleware** — checks the user's role is allowed for the route (e.g., only Admin hits master-data create; only MouldingEngineer hits moulding create).
3. **Scope/isolation middleware** — for customer reads, forces `customerId = token.customerId`; for engineer reads, forces the department filter.
4. **Validation** — validates body/params (only requirement-backed fields accepted).
5. **Controller → Service → Model** — business rules live in services; Mongoose models persist data.
6. **Immutability guard** — no update/delete routes exist in V1; models are written once.

### 2.3 Database (MongoDB Atlas)
- Managed cloud MongoDB; collections defined in `08_MongoDB_Schema.md`.
- Indexed for the two dominant access patterns: **per-customer reads** and **per-department reads**.

### 2.4 File storage
- Images and invoice documents are stored as files (object storage / disk in dev), with only a reference/URL kept in MongoDB. Keeping binaries out of the DB keeps documents small and reads fast (see `06` scalability).

---

## 3. Authentication & RBAC (JWT)

```
Login (email/username + password)
   → backend verifies credentials (password hashed with bcrypt)
   → backend issues a signed JWT:  { sub: userId, role, customerId? , iat, exp }
   → app stores the token securely (Expo SecureStore) and sends it on every request
   → backend verifies signature + expiry on each request, then applies RBAC + scope
```

- **Roles:** `admin`, `moulding_engineer`, `assembly_engineer`, `qc_engineer`, `packing_dispatch_engineer`, `customer`.
- **RBAC is enforced on the server**, route by route — the app only hides UI for convenience, never for security (`02` R1, `06` R-S1/R-S3).
- **Customer isolation:** a customer token carries `customerId`; every customer-facing query is forced to that id and can never request another customer's data (`02` R2, C5).
- **Department isolation:** an engineer token's role determines which single record collection they may write to and read from (`02` R3).
- **No registration/self-signup in V1** — accounts are provisioned (see open question Q-AUTH1); login + token refresh only.

---

## 4. Key end-to-end data flows

**A. Admin sets up an order**
```
Admin app → POST /customers → POST /products (under customer) → POST /orders (qty)
→ stored in Atlas → now selectable by engineers, visible on customer dashboard
```

**B. Engineer submits a record**
```
Engineer app loads dropdowns (GET /customers, /products?customerId, /orders?productId)
→ selects Order (qty auto-filled) → fills dept fields → uploads image
→ POST /moulding (or /assembly | /qc | /packing-dispatch)
→ Auth+RBAC+validation → service links record to orderId/productId/customerId
→ immutable insert → (optional) Notification created
```

**C. Customer views status**
```
Customer app → GET /dashboard  (token.customerId enforced)
→ backend aggregates this customer's orders + records
→ returns only customer-visible fields (internal fields stripped)
→ app renders dashboard + timeline + notifications
```

---

## 5. Cross-cutting concerns
| Concern | Approach (V1) | Source |
|---|---|---|
| Security / isolation | Server-side RBAC + forced customer/department scoping | C5, `02`, `06` R-S1/2/3 |
| Immutability | Create + read only; no update/delete endpoints | V1 Rules |
| Field hiding | Customer responses include only customer-visible fields (whitelist per module) | `02` field matrix |
| Validation | Accept only requirement-backed fields | PROJECT_PLAN Source of Truth |
| Uploads | Multipart upload → file storage → URL in DB; type/size limits | `05` Q-IMG1 |
| Notifications | Created on production events; channel TBD (in-app first) | `05` Q-N1/N2 |
| Config/secrets | Env vars (DB URI, JWT secret) — never in code | best practice |
| Errors | Consistent JSON error shape `{ error, message }` | `09` API design |

---

## 6. Environments & deployment (overview)
- **Mobile:** Expo build → Android (APK / Play Store) first; iOS later. Dev via Expo Go.
- **Backend:** Node/Express service (e.g., Render/Railway/any Node host) over HTTPS.
- **Database:** MongoDB Atlas cluster (managed, network-restricted to the API).
- **Config per environment:** `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRY`, file-storage settings.

---

## 7. What this architecture deliberately excludes (V1)
Per scope, **not** included now (future per `06`): editing/corrections, approvals/workflow, analytics dashboards, web portal, multi-channel notification preferences, offline sync. The structure leaves room for these (service layer, modular routes) without redesign.
