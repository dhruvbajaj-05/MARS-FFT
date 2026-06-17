# API Design (REST)
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Node.js + Express REST API consumed by the React Native + Expo app. JWT auth on every protected route; RBAC enforced server-side. V1 is **create + read only** — there are intentionally **no PUT/PATCH/DELETE** endpoints.
> Base URL: `/api/v1`. All requests/responses are JSON (except file uploads = multipart/form-data). Auth header: `Authorization: Bearer <JWT>`.

---

## 1. Conventions
- **Success:** `200 OK` (reads), `201 Created` (creates). Body: the resource or a list.
- **Errors:** consistent shape `{ "error": "<code>", "message": "<human readable>" }`.
  - `400` validation, `401` missing/invalid token, `403` role/scope not allowed, `404` not found, `409` conflict, `500` server.
- **Roles:** `admin`, `moulding_engineer`, `assembly_engineer`, `qc_engineer`, `packing_dispatch_engineer`, `customer`.
- **Scoping (automatic):** customer routes are forced to the token's `customerId`; engineer record reads are forced to the engineer's own department.

---

## 2. Auth
| Method | Endpoint | Who | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | Login, returns JWT + user profile |
| POST | `/auth/refresh` | any logged-in | Exchange a valid token for a fresh one |
| GET | `/auth/me` | any logged-in | Current user profile (id, role, customerId) |

```
POST /auth/login
req:  { "email": "...", "password": "..." }
res:  { "token": "<jwt>", "user": { "id","name","role","customerId" } }
```
> No public signup in V1 (accounts provisioned — Q-AUTH1).

---

## 3. Master data — Admin only (create + read)

### Customers
| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| POST | `/customers` | admin | Create a customer |
| GET | `/customers` | admin, engineers | List customers (engineers use it to populate dropdown) |
| GET | `/customers/:id` | admin | Get one |

```
POST /customers   req: { "name": "Acme Corp" }   res(201): { customer }
```

### Products  (belong to a customer)
| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| POST | `/products` | admin | Create product under a customer |
| GET | `/products?customerId=` | admin, engineers | List products for a customer (cascading dropdown) |
| GET | `/products/:id` | admin | Get one |

```
POST /products   req: { "customerId":"...", "name":"Gearbox", "partName":"Housing" }
```

### Orders  (belong to a product; carry Order Quantity)
| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| POST | `/orders` | admin | Create order, set Order Quantity |
| GET | `/orders?productId=` | admin, engineers | List orders for a product (cascading dropdown) |
| GET | `/orders/:id` | admin, engineers | Get one (engineer reads `orderQuantity` to auto-fill) |

```
POST /orders   req: { "customerId":"...", "productId":"...", "orderQuantity": 5000 }
```

> Engineers may **read** customers/products/orders (to drive dropdowns) but may **not** create them — `403` if attempted.

---

## 4. Department record submission (engineers: create + read own department)

Each department has exactly one create route and one "my records" read route. Role must match the department.

### Moulding — `moulding_engineer`
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/moulding` | Create a moulding record |
| GET | `/moulding/mine` | List this engineer's moulding records |
| GET | `/moulding/:id` | Get one (own department) |

```
POST /moulding
req: {
  "orderId":"...", "productId":"...", "customerId":"...",   // from dropdown selection
  "moldNumber":"M12", "machineNumber":"MC-3", "shift":"A",
  "productionQuantity":1200, "goodParts":1150, "rejectedParts":50,
  "rejectionReason":"Flash", "comments":"...",
  "imageId":"<from /uploads>"
}
res(201): { mouldingRecord }
```

### Assembly — `assembly_engineer`
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/assembly` | Create an assembly record |
| GET | `/assembly/mine` | List this engineer's assembly records |
| GET | `/assembly/:id` | Get one |

```
POST /assembly
req: { orderId, productId, customerId, assemblyType, subAssembly, finalAssembly,
       shift, quantityAssembled, labourUtilized, remarks, imageIds:[] }
```

### QC — `qc_engineer`
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/qc` | Create a QC record |
| GET | `/qc/mine` | List this engineer's QC records |
| GET | `/qc/:id` | Get one |

```
POST /qc
req: { orderId, productId, customerId, inspectionDate, defectCategory,
       defectQuantity, defectDescription, correctiveAction, defectImageIds:[] }
```

### Packing & Dispatch — `packing_dispatch_engineer`
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/packing-dispatch` | Create a packing/dispatch record |
| GET | `/packing-dispatch/mine` | List this engineer's records |
| GET | `/packing-dispatch/:id` | Get one |

```
POST /packing-dispatch
req: { orderId, productId, customerId, boxesPacked, quantityPacked,
       readyForDispatchQty, dispatchDate, vehicleDetails, lrNumber, invoiceId }
```

> On each create, the service validates the order/product/customer chain and inserts an **immutable** record; it may also create notification(s).

---

## 5. File / image upload (engineers)
| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| POST | `/uploads` | engineers | Upload an image or invoice; returns a media reference to attach to a record |

```
POST /uploads        (multipart/form-data: file=<binary>, type='image'|'invoice')
res(201): { "mediaId":"...", "url":"...", "type":"image" }
```
> Validates mimeType/size (limits pending Q-IMG1). The returned `mediaId`/`imageId` is placed in the record create call.

---

## 6. Customer dashboard & timeline (customer only — own data)

All routes auto-scope to `token.customerId`; responses include **only customer-visible fields** (internal fields stripped server-side).

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/customer/orders` | List this customer's orders (with status summary) |
| GET | `/customer/dashboard?orderId=` | Full dashboard for one order |
| GET | `/customer/timeline?orderId=` | Production timeline stages for one order |
| GET | `/customer/qc-reports?orderId=` | Daily QC reports (defects, images, corrective actions) |
| GET | `/notifications` | This customer's notifications |
| POST | `/notifications/:id/read` | Mark a notification read |

```
GET /customer/dashboard?orderId=...
res: {
  productionStatus: { orderQuantity, producedQuantity, pendingQuantity, progressPct },  // progressPct: Q-P1
  mouldingStatus:   { currentMoldRunning, currentProduction, rejections, goodParts },
  assemblyStatus:   { quantityAssembled, assemblyProgress },
  qualityStatus:    { dailyQcReports:[...], defectsFound, images:[...] },
  dispatchStatus:   { readyStock, expectedDispatchDate, deliveryProgress }
}
```
```
GET /customer/timeline?orderId=...
res: { stages: [
  { name:"Order Received", status:"complete" },
  { name:"Moulding",       status:"complete" | "in_progress" | "pending" },   // rule: Q-T1
  { name:"Assembly",       status:"..." },
  { name:"QC",             status:"..." },
  { name:"Dispatch",       status:"..." }
]}
```

---

## 7. Admin read-all (view everything)
Admin reuses the master-data GETs above, plus read-all across departments:
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/moulding?customerId=&orderId=` | All moulding records (any filter) |
| GET | `/admin/assembly?...` | All assembly records |
| GET | `/admin/qc?...` | All QC records |
| GET | `/admin/packing-dispatch?...` | All packing/dispatch records |
| GET | `/admin/overview` | Cross-customer/department summary (read-only) |

> Admin sees **all fields** (including FFT-only); admin has no create on department records and no edit/delete anywhere.

---

## 8. RBAC matrix (route → allowed roles)
| Route group | admin | moulding | assembly | qc | packing | customer |
|---|---|---|---|---|---|---|
| `/auth/*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `POST /customers,/products,/orders` | ✓ | — | — | — | — | — |
| `GET /customers,/products,/orders` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `POST/GET /moulding*` | GET(admin via /admin) | ✓ | — | — | — | — |
| `POST/GET /assembly*` | GET via /admin | — | ✓ | — | — | — |
| `POST/GET /qc*` | GET via /admin | — | — | ✓ | — | — |
| `POST/GET /packing-dispatch*` | GET via /admin | — | — | — | ✓ | — |
| `POST /uploads` | — | ✓ | ✓ | ✓ | ✓ | — |
| `/customer/*`, `/notifications` | — | — | — | — | — | ✓ |
| `/admin/*` | ✓ | — | — | — | — | — |

---

## 9. Notes
- **Versioned base path** (`/api/v1`) leaves room for V2 (editing/approvals/analytics — `06`).
- **Items dependent on open questions** are marked inline (Q-P1 progress %, Q-T1 timeline status, Q-N1/N2 notifications, Q-IMG1 uploads, Q-VIS1 dispatch field visibility). Endpoints exist; the exact computed values/limits get finalized when those questions are answered.
