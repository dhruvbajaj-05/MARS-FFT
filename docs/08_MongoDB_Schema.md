# Physical MongoDB Schema (MongoDB Atlas)
## FFT Manufacturing Transparency Platform — V1 (MVP)

> Concrete collection design derived from `04_Database_Entities.md`. Every field traces to a requirement. V1 rule: documents are **insert-only and immutable** — no app code performs update/delete.
> Conventions: each doc has `_id` (ObjectId), `createdAt`, `createdBy` (ObjectId → users). Relationships use **referenced ObjectIds** (normalized) because reads are filtered by customer/department/order. Money/efficiency/cost fields from the source are NOT stored (never captured — see `05` Q-M1).

---

## 1. Collections overview
| Collection | Holds | Written by |
|---|---|---|
| `users` | accounts + role | (provisioned) |
| `customers` | buyer companies/brands | Admin |
| `products` | products per customer | Admin |
| `orders` | orders per product (+ order quantity) | Admin |
| `mouldingrecords` | Module 1 submissions | Moulding Engineer |
| `assemblyrecords` | Module 2 submissions | Assembly Engineer |
| `qcrecords` | Module 3 submissions | QC Engineer |
| `packingdispatchrecords` | Module 4 submissions | Packing & Dispatch Engineer |
| `mediaassets` | uploaded images / invoice docs | Engineers |
| `notifications` | customer event notifications | System |

---

## 2. `users`
```js
{
  _id: ObjectId,
  name: String,                       // display name
  email: String,                      // unique login id
  passwordHash: String,               // bcrypt hash (never plain)
  role: String,                       // enum: 'admin' | 'moulding_engineer' |
                                      //       'assembly_engineer' | 'qc_engineer' |
                                      //       'packing_dispatch_engineer' | 'customer'
  customerId: ObjectId | null,        // set ONLY when role === 'customer' → customers._id
  isActive: Boolean,                  // default true
  createdAt: Date
}
```
**Indexes:** `{ email: 1 }` unique; `{ role: 1 }`; `{ customerId: 1 }`.
**Rule:** `customerId` required iff role is `customer`; null for all internal roles.

---

## 3. `customers`  *(Admin-created)*
```js
{
  _id: ObjectId,
  name: String,                       // "Customer Name" / brand
  createdBy: ObjectId,                // → users._id (admin)
  createdAt: Date
}
```
**Indexes:** `{ name: 1 }`.

---

## 4. `products`  *(Admin-created; Customer 1—* Product)*
```js
{
  _id: ObjectId,
  customerId: ObjectId,               // → customers._id  (owner)
  name: String,                       // "Product Name"
  partName: String,                   // "Part Name" (Module 1)
  createdBy: ObjectId,                // admin
  createdAt: Date
}
```
**Indexes:** `{ customerId: 1 }`; `{ customerId: 1, name: 1 }`.

---

## 5. `orders`  *(Admin-created; Product 1—* Order)*
```js
{
  _id: ObjectId,
  customerId: ObjectId,               // → customers._id (denormalized for isolation/queries)
  productId: ObjectId,                // → products._id
  orderQuantity: Number,             // "Order Quantity" — Admin-set, auto-fills engineer screens
  createdBy: ObjectId,                // admin
  createdAt: Date

  // Derived/displayed values (Produced/Pending/Progress %, timeline stage) are
  // computed from records at read time — formulas pending Q-P1/Q-T1, so NOT stored yet.
}
```
**Indexes:** `{ customerId: 1 }`; `{ productId: 1 }`; `{ customerId: 1, productId: 1 }`.

---

## 6. `mouldingrecords`  *(Module 1 — created by Moulding Engineer)*
```js
{
  _id: ObjectId,
  // links (from dropdown selection — confirmed FKs):
  orderId: ObjectId,                  // → orders._id
  productId: ObjectId,                // → products._id
  customerId: ObjectId,               // → customers._id (isolation key)

  // department fields:
  moldNumber: String,                 // "Mold Number" / shown as "Mold Currently Running"
  machineNumber: String,              // "Machine Number" / "Machine Running"
  shift: String,                      // enum: 'A' | 'B' | 'C'
  productionQuantity: Number,        // "Production Quantity" / "Production Completed"
  goodParts: Number,                 // "Good Parts Produced"
  rejectedParts: Number,             // "Rejected Parts"
  rejectionReason: String,            // FFT-only
  comments: String,                   // FFT-only
  imageId: ObjectId | null,           // → mediaassets._id ("Image Upload")

  createdBy: ObjectId,                // moulding engineer
  createdAt: Date
}
```
**Customer-visible fields:** productName(via product), moldNumber, machineNumber, productionQuantity, goodParts, rejectedParts, + computed progress %. Hidden: partName, shift, rejectionReason, comments, image.
**Indexes:** `{ customerId: 1 }`; `{ orderId: 1 }`; `{ createdBy: 1, createdAt: -1 }` (engineer's own-dept list).

---

## 7. `assemblyrecords`  *(Module 2 — created by Assembly Engineer)*
```js
{
  _id: ObjectId,
  orderId: ObjectId, productId: ObjectId, customerId: ObjectId,

  assemblyType: String,               // "Assembly Type"
  subAssembly: String,                // "Sub Assembly"
  finalAssembly: String,              // "Final Assembly"
  shift: String,                      // 'A' | 'B' | 'C'
  quantityAssembled: Number,         // "Quantity Assembled" / "Quantity Completed"
  labourUtilized: Number,            // FFT-ONLY (never returned to customer)
  remarks: String,                    // FFT-only
  imageIds: [ObjectId],               // optional images → mediaassets

  createdBy: ObjectId,
  createdAt: Date
}
```
**Customer-visible:** quantityAssembled, + computed assembly progress / production status. Hidden: assemblyType, subAssembly, finalAssembly, shift, **labourUtilized**, remarks, images.
**Indexes:** `{ customerId: 1 }`; `{ orderId: 1 }`; `{ createdBy: 1, createdAt: -1 }`.

---

## 8. `qcrecords`  *(Module 3 — created by QC Engineer; all fields customer-visible)*
```js
{
  _id: ObjectId,
  orderId: ObjectId, productId: ObjectId, customerId: ObjectId,

  inspectionDate: Date,               // "Inspection Date"
  defectCategory: String,             // enum: 'Minor' | 'Major' | 'Critical'
  defectQuantity: Number,            // "Defect Quantity"
  defectDescription: String,          // "Defect Description"
  correctiveAction: String,           // "Corrective Action Taken"
  defectImageIds: [ObjectId],         // "Defect Images" → mediaassets

  createdBy: ObjectId,
  createdAt: Date
}
```
**Customer-visible:** all of the above (transparency by design — Module 3).
**Indexes:** `{ customerId: 1 }`; `{ orderId: 1 }`; `{ orderId: 1, inspectionDate: -1 }` (Daily QC Report); `{ createdBy: 1, createdAt: -1 }`.

---

## 9. `packingdispatchrecords`  *(Module 4 — created by Packing & Dispatch Engineer)*
```js
{
  _id: ObjectId,
  orderId: ObjectId, productId: ObjectId, customerId: ObjectId,

  boxesPacked: Number,               // "Number of Boxes Packed"   (FFT-only)
  quantityPacked: Number,            // "Quantity Packed"          (FFT-only)
  readyForDispatchQty: Number,       // "Ready for Dispatch Quantity" / "Ready Stock" (visible)
  dispatchDate: Date,                 // "Dispatch Date" / "Expected Dispatch Date" (visible)
  vehicleDetails: String,             // "Vehicle Details"  (visibility OPEN Q-VIS1)
  lrNumber: String,                   // "LR Number"        (visibility OPEN Q-VIS1)
  invoiceId: ObjectId | null,         // "Invoice Upload" / "Dispatch Documents" (visible)

  createdBy: ObjectId,
  createdAt: Date
}
```
**Customer-visible:** readyForDispatchQty, dispatchDate, invoice (Dispatch Documents), dispatch/delivery status (computed). Hidden by default: boxesPacked, quantityPacked; vehicleDetails/lrNumber pending Q-VIS1.
**Indexes:** `{ customerId: 1 }`; `{ orderId: 1 }`; `{ createdBy: 1, createdAt: -1 }`.

---

## 10. `mediaassets`  *(images & invoice documents)*
```js
{
  _id: ObjectId,
  type: String,                       // 'image' | 'invoice'
  url: String,                        // storage location/URL (binary not in DB)
  mimeType: String,
  sizeBytes: Number,
  ownerType: String,                  // 'moulding' | 'assembly' | 'qc' | 'packing_dispatch'
  ownerId: ObjectId,                  // the record it belongs to
  uploadedBy: ObjectId,
  createdAt: Date
}
```
**Indexes:** `{ ownerType: 1, ownerId: 1 }`.
**Constraints (pending Q-IMG1):** allowed mimeTypes, max sizeBytes enforced in upload service.

---

## 11. `notifications`  *(customer event notifications)*
```js
{
  _id: ObjectId,
  customerId: ObjectId,               // recipient (→ customers._id)
  orderId: ObjectId,                  // context
  eventType: String,                  // enum: 'production_starts' | 'production_completes' |
                                      //       'qc_completes' | 'dispatch_scheduled' |
                                      //       'goods_dispatched'
  message: String,
  channel: String,                    // 'in_app' (V1 default; Q-N1 for push/SMS/email)
  isRead: Boolean,                    // default false
  createdAt: Date
}
```
**Indexes:** `{ customerId: 1, createdAt: -1 }`.

---

## 12. Relationship map
```
users(customer) ─customerId─► customers ─1:*─► products ─1:*─► orders
                                   ▲                              │
                                   │            ┌─────────────────┤ (orderId, productId, customerId)
                                   │            ▼
                       customerId  │     mouldingrecords / assemblyrecords /
                                   │     qcrecords / packingdispatchrecords
                                   │            │
                                   │            └─ownerId─► mediaassets
                                   └───────────────────────► notifications (customerId, orderId)
```

---

## 13. Integrity & rules enforced in app layer (not by Mongo itself)
- **Immutability:** services only `insertOne`; no `updateOne`/`deleteOne` exist in V1.
- **Isolation:** every customer query includes `customerId` from the JWT.
- **Department writes:** role gates which record collection an engineer can insert into.
- **Referential checks:** before inserting a record, the service verifies the selected `orderId`/`productId`/`customerId` exist and are consistent (order belongs to product belongs to customer).
- **Field whitelist on read:** customer responses project only customer-visible fields per `02`.
