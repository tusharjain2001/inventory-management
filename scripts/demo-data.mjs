// Loads demo data through the app's own API (so stock, GST and numbering follow the real rules).
// Products and prices follow the client's sample Excel; names, customers and suppliers are dummy.
// Run on a freshly reset database, with the app running:
//
//   npx tsx scripts/reset-data.ts --yes
//   node scripts/demo-data.mjs [baseUrl]        (default http://localhost:3100)
//
// Signs in with DEMO_USER / DEMO_PASSWORD (default admin / ChangeMe@123).

const BASE = process.argv[2] || "http://localhost:3100";
let cookie = "";

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const list = (r) => r.data ?? r;

// Dates are spread over the current month so the dashboard and reports have something to show.
const today = new Date(Date.now() + 5.5 * 3600_000); // IST
const day = (d) => `${today.toISOString().slice(0, 8)}${String(Math.min(d, today.getUTCDate())).padStart(2, "0")}`;

await call("POST", "/api/auth/login", { identifier: process.env.DEMO_USER || "admin", password: process.env.DEMO_PASSWORD || "ChangeMe@123" });
if (list(await call("GET", "/api/products?pageSize=1")).length) {
  console.error("Products already exist. Reset first: npx tsx scripts/reset-data.ts --yes");
  process.exit(1);
}

// Short-year numbering (INV/26-27/00001) keeps document numbers within GST's 16 characters.
await call("PUT", "/api/settings/numbering", await call("GET", "/api/settings/numbering"));

// ── Categories ──
const cats = Object.fromEntries(list(await call("GET", "/api/categories")).map((c) => [c.name, c.id]));
const sub = {};
for (const [cat, names] of Object.entries({
  Furniture: ["Dining Tables", "Consoles"],
  "Home Decor": ["Lighting", "Mirrors", "Decor Accents"],
  Handicrafts: ["Wooden Boxes", "Statues & Figurines", "Wood Carving"],
})) {
  for (const name of names) sub[name] = (await call("POST", "/api/subcategories", { categoryId: cats[cat], name })).id;
}

// ── Suppliers ──
const suppliers = {};
for (const s of [
  { name: "Jodhpur Woodcraft Exports", contactPerson: "Mahesh Jangid", phone: "9829000001", gstin: "08AAJFJ1234K1Z5", city: "Jodhpur", state: "Rajasthan", stateCode: "08", address: "Basni Industrial Area, Phase II" },
  { name: "Moradabad Brass Art", contactPerson: "Imran Ali", phone: "9837000002", gstin: "09AAKFM5678L1Z2", city: "Moradabad", state: "Uttar Pradesh", stateCode: "09", address: "Civil Lines" },
  { name: "Saharanpur Carving House", contactPerson: "Salim Khan", phone: "9897000003", gstin: "09AALFS9012M1Z9", city: "Saharanpur", state: "Uttar Pradesh", stateCode: "09", address: "Wood Carving Market" },
]) {
  const r = await call("POST", "/api/suppliers", s);
  suppliers[s.name] = (r.supplier ?? r).id;
}

// ── Products (prices from the client's sheet; GST rates are placeholders for the accountant to confirm) ──
const J = suppliers["Jodhpur Woodcraft Exports"], M = suppliers["Moradabad Brass Art"], S = suppliers["Saharanpur Carving House"];
const P = [
  ["SR-DT-001", "Sheesham Dining Table (6 Seater)", "Furniture", "Dining Tables", 61600, 38000, "9403", 18, "72 x 36 x 30 in", "Sheesham wood", "Walnut polish", 2, 1, J],
  ["SR-CN-001", "Hand-painted Console Table", "Furniture", "Consoles", 13440, 8200, "9403", 18, "48 x 16 x 32 in", "Mango wood", "Hand-painted", 3, 1, J],
  ["SR-CN-002", "Reclaimed Wood Console", "Furniture", "Consoles", 14000, 8600, "9403", 18, "54 x 18 x 32 in", "Reclaimed teak", "Natural matte", 3, 1, J],
  ["SR-LT-001", "Iron & Glass Table Lamp", "Home Decor", "Lighting", 5040, 2900, "9405", 18, "10 x 10 x 24 in", "Iron, glass", "Antique black", 5, 2, M],
  ["SR-LT-002", "Hurricane Glass Lamp", "Home Decor", "Lighting", 4500, 2600, "9405", 18, "8 x 8 x 18 in", "Glass, brass", "Clear / brass", 4, 2, M],
  ["SR-MR-001", "Round Carved Frame Mirror", "Home Decor", "Mirrors", 15700, 9500, "7009", 18, "36 x 2 x 36 in", "Sheesham wood", "Distressed white", 2, 1, S],
  ["SR-DC-001", "Carved Wooden Wall Panel", "Home Decor", "Decor Accents", 2800, 1500, "4420", 5, "24 x 1 x 12 in", "Mango wood", "Natural", 6, 2, S],
  ["SR-DC-002", "Carved Decor Bowl", "Home Decor", "Decor Accents", 2800, 1550, "4420", 5, "12 x 12 x 5 in", "Mango wood", "Walnut polish", 6, 2, S],
  ["SR-DC-003", "Brass Inlay Decor Tray", "Handicrafts", "Wood Carving", 5040, 2950, "4420", 5, "18 x 12 x 2 in", "Wood, brass inlay", "Natural", 4, 2, S],
  ["SR-DC-004", "Marble Leaf Platter", "Home Decor", "Decor Accents", 1100, 600, "6802", 5, "12 x 7 x 1 in", "White marble", "Polished", 8, 3, S],
  ["SR-DC-005", "Ceramic Scalloped Bowl", "Home Decor", "Decor Accents", 900, 480, "6913", 5, "10 x 10 x 3 in", "Ceramic", "Ivory glaze", 12, 4, S],
  ["SR-WB-001", "Bone Inlay Wooden Box", "Handicrafts", "Wooden Boxes", 1344, 720, "4420", 5, "8 x 5 x 3 in", "Wood, bone inlay", "Blue / white", 10, 3, S],
  ["SR-ST-001", "Brass Buddha Statue", "Handicrafts", "Statues & Figurines", 65600, 41000, "8306", 5, "18 x 14 x 36 in", "Brass", "Antique gold", 1, 1, M],
  ["SR-ST-002", "Brass Horse Figurine", "Handicrafts", "Statues & Figurines", 3900, 2200, "8306", 5, "10 x 4 x 9 in", "Brass", "Antique gold", 5, 2, M],
  ["SR-ST-003", "Metal Abstract Sculpture", "Handicrafts", "Statues & Figurines", 4100, 2300, "8306", 5, "8 x 6 x 20 in", "Iron, brass", "Bronze patina", 4, 2, M],
];
const prod = {};
for (const [sku, name, cat, subName, sell, cost, hsn, gst, size, material, colour, , reorder, supplier] of P) {
  const r = await call("POST", "/api/products", {
    sku, name, categoryId: cats[cat], subCategoryId: sub[subName], sellingPrice: sell, purchasePrice: cost,
    hsnCode: hsn, gstRate: gst, size, material, colour, reorderLevel: reorder, preferredSupplierId: supplier,
  });
  prod[sku] = (r.product ?? r).id;
}

// ── Opening stock (1st of the month) and one purchase ──
await call("POST", "/api/inventory/stock-in", {
  date: day(1), source: "OPENING", remarks: "Opening stock (demo)",
  items: P.map(([sku, , , , , cost, , , , , , qty]) => ({ productId: prod[sku], quantity: qty, unitCost: cost })),
});
await call("POST", "/api/inventory/stock-in", {
  date: day(8), source: "PURCHASE", supplierId: J, purchaseInvoiceNo: "JWE/2026/245", purchaseInvoiceDate: day(7),
  items: [
    { productId: prod["SR-CN-001"], quantity: 2, unitCost: 8200, gstRate: 18 },
    { productId: prod["SR-DT-001"], quantity: 1, unitCost: 38000, gstRate: 18 },
  ],
});

// ── Customers ──
const cust = { Cash: list(await call("GET", "/api/customers?q=Cash"))[0].id };
for (const c of [
  { name: "Rajiv Malhotra", mobile: "9810000001", email: "rajiv.demo@example.com", billingAddress: "House 214, Sector 57", city: "Gurugram", state: "Haryana", stateCode: "06", pincode: "122011" },
  { name: "Nidhi Sharma", mobile: "9810000002", billingAddress: "Tower B, Flat 1102, Golf Course Extension Road", city: "Gurugram", state: "Haryana", stateCode: "06", pincode: "122102" },
  { name: "Vikram Khanna", mobile: "9810000003", billingAddress: "C-41, Greater Kailash II", city: "New Delhi", state: "Delhi", stateCode: "07", pincode: "110048" },
  { name: "Urban Nest Interiors", customerType: "BUSINESS", companyName: "Urban Nest Interiors LLP", mobile: "9810000004", gstin: "06AABFU3456P1Z1", billingAddress: "Plot 32, Udyog Vihar Phase IV", city: "Gurugram", state: "Haryana", stateCode: "06", pincode: "122015", paymentTermsDays: 15 },
  { name: "Aangan Design Studio", customerType: "BUSINESS", companyName: "Aangan Design Studio", mobile: "9810000005", gstin: "06AAMFA7788Q1Z4", billingAddress: "SCO 18, Sector 29 Market", city: "Gurugram", state: "Haryana", stateCode: "06", pincode: "122001" },
]) {
  const r = await call("POST", "/api/customers", c);
  cust[c.name] = (r.customer ?? r).id;
}

// ── Sales: Save & Invoice, then payments ──
async function sale(date, customer, items, extra = {}) {
  const r = await call("POST", "/api/sales/orders", {
    orderDate: date, customerId: cust[customer], action: "invoice", invoice: { invoiceDate: date },
    items: items.map(([sku, quantity, discountPercent]) => ({ productId: prod[sku], quantity, unitPrice: P.find((p) => p[0] === sku)[4], discountPercent })),
    ...extra,
  });
  console.log(`${r.invoice.invoiceNo}  ${customer.padEnd(22)} ₹${r.invoice.grandTotal}`);
  return r.invoice;
}
async function pay(inv, date, amount, mode, reference) {
  await call("POST", "/api/payments", { invoiceId: inv.id, paymentDate: date, amount, mode, reference });
}

const i1 = await sale(day(6), "Cash", [["SR-WB-001", 2], ["SR-DC-005", 1]]);
await pay(i1, day(6), i1.grandTotal, "UPI", "UPI ref 6021");
const i2 = await sale(day(9), "Rajiv Malhotra", [["SR-DT-001", 1, 5]], { notes: "Delivery within 7 days of balance payment." });
await pay(i2, day(9), Math.round(i2.grandTotal / 2), "NEFT", "50% advance");
const i3 = await sale(day(13), "Vikram Khanna", [["SR-MR-001", 1], ["SR-LT-001", 1]]);
await pay(i3, day(13), i3.grandTotal, "CREDIT_CARD", "HDFC POS 4471");
await sale(day(16), "Urban Nest Interiors", [["SR-CN-001", 1], ["SR-DC-003", 2]]);
const i5 = await sale(day(19), "Nidhi Sharma", [["SR-ST-002", 1], ["SR-DC-004", 2]]);
await pay(i5, day(19), i5.grandTotal, "CASH");

// ── Potential Sales: stock out on display at a client's site (prints a delivery challan) ──
const exp = new Date(today.getTime() + 15 * 86400_000).toISOString().slice(0, 10);
const d = await call("POST", "/api/inventory/display", {
  date: day(15), customerId: cust["Aangan Design Studio"], locationName: "Aangan Design Studio – client show flat",
  address: "Tower 4, Flat 702, Sector 54, Gurugram, Haryana 122011", contactPerson: "Meera (designer)", contactPhone: "9810000005",
  expectedReturnDate: exp, remarks: "For client walkthrough; unsold items to be returned.",
  items: [{ productId: prod["SR-CN-002"], quantity: 1 }, { productId: prod["SR-LT-002"], quantity: 2 }, { productId: prod["SR-DC-002"], quantity: 2 }],
});
console.log(`${(d.issue ?? d).displayNo}  display at Aangan Design Studio`);
console.log("Demo data loaded.");
