// ─────────────────────────────────────────────────────────────────
// Droveia Delivery API
// Run: node server.js
// ─────────────────────────────────────────────────────────────────

const express = require("express");
const cors    = require("cors");
const admin   = require("firebase-admin");
const fs      = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// ── Firebase init ─────────────────────────────────────────────────
const serviceAccount = JSON.parse(
  fs.readFileSync("C:\\Users\\Ani\\Documents\\GitHub\\droveia\\key.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── API key middleware ────────────────────────────────────────────
// Each partner has an API key stored in Firestore under:
// /apiKeys/{key}  →  { partnerEmail, partnerName, stationId, active: true }
async function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key) {
    return res.status(401).json({ error: "Missing API key. Pass it as x-api-key header." });
  }

  const keyDoc = await db.collection("apiKeys").doc(key).get();
  if (!keyDoc.exists || !keyDoc.data().active) {
    return res.status(403).json({ error: "Invalid or inactive API key." });
  }

  // Attach partner info to the request so route handlers can use it
  req.partner = keyDoc.data();
  next();
}

// ── POST /v1/deliveries ───────────────────────────────────────────
// Called by partner website when a customer places an order.
//
// Request body:
// {
//   "customerName": "John Smith",
//   "customerPhone": "555-123-4567",        // optional
//   "deliveryAddress": "123 Main St, Plano TX 75023",
//   "items": [
//     { "name": "DeWalt Drill", "qty": 1 }
//   ],
//   "notes": "Leave at front door"          // optional
// }
//
// Response:
// {
//   "deliveryId": "abc123",
//   "status": "pending_approval",
//   "message": "Order received. Awaiting Droveia approval before dispatch."
// }

app.post("/v1/deliveries", requireApiKey, async (req, res) => {
  const { customerName, customerPhone, deliveryAddress, items, notes } = req.body;

  // Basic validation
  if (!customerName || !deliveryAddress || !items || items.length === 0) {
    return res.status(400).json({
      error: "Missing required fields: customerName, deliveryAddress, items",
    });
  }

  try {
    const deliveryRef = db.collection("deliveries").doc();

    await deliveryRef.set({
      // Partner info (from API key)
      partnerEmail: req.partner.partnerEmail,
      partnerName: req.partner.partnerName,
      stationId: req.partner.stationId,

      // Order details
      customerName,
      customerPhone: customerPhone || null,
      deliveryAddress,
      items,
      notes: notes || null,

      // Status — Pi only acts on "approved"
      status: "pending_approval",

      // Timestamps
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      // Source so dashboard can show "via API" vs manually entered
      source: "api",
    });

    return res.status(201).json({
      deliveryId: deliveryRef.id,
      status: "pending_approval",
      message: "Order received. Awaiting Droveia approval before dispatch.",
    });
  } catch (err) {
    console.error("Error creating delivery:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET /v1/deliveries/:id ────────────────────────────────────────
// Partner can poll this to check order status.
// Statuses: pending_approval → approved → dispatched → delivered → failed

app.get("/v1/deliveries/:id", requireApiKey, async (req, res) => {
  try {
    const doc = await db.collection("deliveries").doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Delivery not found." });
    }

    const data = doc.data();

    // Partners can only see their own orders
    if (data.partnerEmail !== req.partner.partnerEmail) {
      return res.status(403).json({ error: "Not authorized to view this delivery." });
    }

    return res.json({
      deliveryId: doc.id,
      status: data.status,
      customerName: data.customerName,
      deliveryAddress: data.deliveryAddress,
      items: data.items,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  } catch (err) {
    console.error("Error fetching delivery:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ── GET /v1/deliveries ────────────────────────────────────────────
// List all deliveries for this partner (last 50)

app.get("/v1/deliveries", requireApiKey, async (req, res) => {
  try {
    const snapshot = await db
      .collection("deliveries")
      .where("partnerEmail", "==", req.partner.partnerEmail)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const deliveries = snapshot.docs.map((doc) => ({
      deliveryId: doc.id,
      status: doc.data().status,
      customerName: doc.data().customerName,
      deliveryAddress: doc.data().deliveryAddress,
      items: doc.data().items,
      createdAt: doc.data().createdAt,
    }));

    return res.json({ deliveries });
  } catch (err) {
    console.error("Error listing deliveries:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
});

// ── Health check ──────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "Droveia API running" }));

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Droveia API running on http://localhost:${PORT}`);
});