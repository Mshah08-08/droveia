require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require("discord.js");
const admin = require("firebase-admin");

// ── Firebase Admin Init ───────────────────────────────────────────────────────
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_RTDB_URL,
});

const db       = admin.firestore();
const rtdb     = admin.database();
const toolsRef = rtdb.ref("tools");

// ── Discord Client ────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Colors ────────────────────────────────────────────────────────────────────
const BLUE   = 0x1a6ef0;
const GREEN  = 0x22c55e;
const AMBER  = 0xf59e0b;
const RED    = 0xef4444;
const GRAY   = 0x6b7280;
const PURPLE = 0x7c3aed;

// ── Allowed admin Discord user IDs ────────────────────────────────────────────
const ADMIN_IDS = (process.env.ADMIN_IDS || "1477674502660821143,918558841929613333").split(",");

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getTools() {
  const snap = await toolsRef.get();
  const data = snap.val();
  if (!data) return [];
  return (Array.isArray(data) ? data : Object.values(data)).filter(t => t && t.name);
}

async function saveTools(tools) {
  await toolsRef.set(tools);
}

function calcRate(tool) {
  if (tool.pph && tool.pph > 0) return tool.pph;
  return parseFloat(((tool.retail * 0.70) / 48).toFixed(2));
}

function statusColor(status) {
  const map = {
    in_flight:        BLUE,
    delivered:        GREEN,
    returned:         GREEN,
    cancelled:        RED,
    delayed:          AMBER,
    failed:           RED,
    refunded:         PURPLE,
    pending_approval: AMBER,
    pending:          AMBER,
  };
  return map[status] || GRAY;
}

function statusLabel(status) {
  const map = {
    in_flight:        "In Flight",
    delivered:        "Delivered",
    returned:         "Returned",
    cancelled:        "Cancelled",
    delayed:          "Delayed",
    failed:           "Failed",
    refunded:         "Refunded",
    pending_approval: "Pending Approval",
    pending:          "Pending",
  };
  return map[status] || status.replace(/_/g, " ");
}

function typeLabel(type) {
  if (type === "buy")  return "Buy only";
  if (type === "both") return "Rent + Buy";
  return "Rent only";
}

// ── Tool detail embed ─────────────────────────────────────────────────────────
function toolEmbed(t, color = BLUE, label = null) {
  const rate      = calcRate(t);
  const qty       = parseInt(t.qty)       || 1;
  const rentedQty = parseInt(t.rentedQty) || 0;
  const avail     = qty > rentedQty;
  const isBuy     = t.type === "buy";
  const isBoth    = t.type === "both";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(label ? `${label}  —  ${t.name}` : t.name)
    .setDescription(`\`#${t.id}\`  ·  ${t.cat}  ·  ${t.desc || "—"}`)
    .addFields(
      { name: "Listing Type",  value: typeLabel(t.type),                         inline: true },
      { name: "Status",        value: avail ? "Available" : "Out of Stock",       inline: true },
      { name: "Stock",         value: `${qty - rentedQty} / ${qty}`,             inline: true },
    );

  if (!isBuy) {
    embed.addFields(
      { name: "Rent Rate",   value: `$${rate.toFixed(2)}/hr`,                  inline: true },
      { name: "4h rental",   value: `$${(rate * 2.20 * 4).toFixed(2)}`,        inline: true },
      { name: "1d rental",   value: `$${(rate * 1.20 * 24).toFixed(2)}`,       inline: true },
    );
  }

  if (isBuy || isBoth) {
    embed.addFields(
      { name: "Buy Price",   value: `$${(parseFloat(t.buyPrice) || 0).toFixed(2)}`, inline: true },
    );
  }

  embed.addFields(
    { name: "Retail",   value: `$${t.retail}`,   inline: true },
    { name: "ETA",      value: t.eta || "—",     inline: true },
    { name: "Rating",   value: `${t.rating || 4.5}/5`, inline: true },
  );

  if (t.partnerEmail) {
    embed.addFields({ name: "Partner", value: t.partnerName || t.partnerEmail, inline: true });
  }

  embed.setFooter({ text: `Tool ID: ${t.id}` }).setTimestamp();
  if (t.img && t.img !== "x") embed.setImage(t.img);
  return embed;
}

// ── Inventory embed ───────────────────────────────────────────────────────────
function inventoryEmbed(tools, filterCat = null) {
  const list      = filterCat ? tools.filter(t => t.cat === filterCat) : tools;
  const totalQty  = list.reduce((s, t) => s + (parseInt(t.qty) || 1), 0);
  const rented    = list.reduce((s, t) => s + (parseInt(t.rentedQty) || 0), 0);
  const available = totalQty - rented;
  const cats      = filterCat ? [filterCat] : ["Workshop", "Electronics", "Crafts", "Office", "Food"];

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(`Droveia — Inventory${filterCat ? ` · ${filterCat}` : ""}`)
    .setDescription(`**${list.length}** tools  ·  **${available}** units available  ·  **${rented}** rented out`)
    .setTimestamp();

  for (const cat of cats) {
    const catTools = list.filter(t => t.cat === cat);
    if (!catTools.length) continue;
    const lines = catTools.map(t => {
      const rate      = calcRate(t);
      const qty       = parseInt(t.qty) || 1;
      const rentedQty = parseInt(t.rentedQty) || 0;
      const avail     = qty > rentedQty;
      const stock     = `${qty - rentedQty}/${qty}`;
      const state     = avail ? "[  ok  ]" : "[  out  ]";
      const id        = `#${String(t.id).padStart(2, "0")}`;
      const name      = t.name.substring(0, 16).padEnd(16, " ");
      const type      = t.type === "buy" ? "buy " : t.type === "both" ? "both" : "rent";
      const price     = t.type === "buy"
        ? `$${(parseFloat(t.buyPrice)||0).toFixed(2).padStart(6)} buy`
        : `$${rate.toFixed(2).padStart(5)}/hr`;
      return `\`${id}  ${name}  ${price}  ${stock.padStart(5)}  ${type}  ${state}\``;
    }).join("\n");
    embed.addFields({ name: cat, value: lines });
  }

  return embed;
}

// ── Command Handlers ──────────────────────────────────────────────────────────
async function handleInventory(interaction) {
  await interaction.deferReply();
  const cat   = interaction.options.getString("category") || null;
  const tools = await getTools();
  if (!tools.length) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(GRAY).setTitle("Inventory").setDescription("No tools found.")
  ]});
  await interaction.editReply({ embeds: [inventoryEmbed(tools, cat)] });
}

async function handleTool(interaction) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const tools = await getTools();
  const tool  = tools.find(t => t.id === id);
  if (!tool) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
  ]});
  await interaction.editReply({ embeds: [toolEmbed(tool)] });
}

async function handleAddTool(interaction) {
  await interaction.deferReply();
  const tools  = await getTools();
  const nextId = tools.length ? Math.max(...tools.map(t => parseInt(t.id) || 0)) + 1 : 1;
  const type   = interaction.options.getString("type") || "rent";

  const tool = {
    id:           nextId,
    name:         interaction.options.getString("name"),
    cat:          interaction.options.getString("cat"),
    retail:       interaction.options.getNumber("retail"),
    desc:         interaction.options.getString("desc") || "",
    eta:          interaction.options.getString("eta") || "< 30 min",
    pph:          interaction.options.getNumber("pph") || 0,
    buyPrice:     interaction.options.getNumber("buyprice") || 0,
    type:         type,
    rating:       interaction.options.getNumber("rating") || 4.5,
    img:          interaction.options.getString("img") || "x",
    qty:          interaction.options.getInteger("qty") || 1,
    rentedQty:    0,
    available:    true,
    partnerEmail: null,
    partnerName:  null,
  };

  tools.push(tool);
  await saveTools(tools);

  await interaction.editReply({ embeds: [toolEmbed(tool, GREEN, "Added")] });
  await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID || process.env.ORDERS_CHANNEL_ID, {
    embeds: [new EmbedBuilder()
      .setColor(GREEN).setTitle("Tool Added")
      .setDescription(`**${tool.name}** added to inventory`)
      .addFields(
        { name: "ID",       value: `#${tool.id}`,       inline: true },
        { name: "Category", value: tool.cat,             inline: true },
        { name: "Type",     value: typeLabel(type),      inline: true },
        { name: "Qty",      value: `${tool.qty}`,        inline: true },
        { name: "Retail",   value: `$${tool.retail}`,   inline: true },
        { name: "Buy Price",value: type !== "rent" ? `$${tool.buyPrice}` : "—", inline: true },
      )
      .setFooter({ text: `Added by ${interaction.user.tag}` }).setTimestamp()
    ]
  });
}

async function handleRemoveTool(interaction) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const tools = await getTools();
  const idx   = tools.findIndex(t => t.id === id);
  if (idx === -1) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
  ]});

  const removed = tools.splice(idx, 1)[0];
  await saveTools(tools);

  await interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(RED).setTitle("Tool Removed")
      .setDescription(`**${removed.name}** removed from inventory.`)
      .addFields({ name: "ID", value: `#${id}`, inline: true })
      .setFooter({ text: `Removed by ${interaction.user.tag}` }).setTimestamp()
  ]});
}

async function handleEditTool(interaction) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const field = interaction.options.getString("field");
  const value = interaction.options.getString("value");
  const tools = await getTools();
  const idx   = tools.findIndex(t => t.id === id);

  if (idx === -1) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
  ]});

  const tool   = tools[idx];
  const oldVal = tool[field];

  const numFields = ["retail", "pph", "buyPrice", "rating", "qty", "rentedQty"];
  tool[field] = numFields.includes(field) ? parseFloat(value) : value;

  if (field === "qty" || field === "rentedQty") {
    tool.available = (parseInt(tool.qty) || 1) > (parseInt(tool.rentedQty) || 0);
  }

  await saveTools(tools);

  await interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(AMBER).setTitle("Tool Updated")
      .setDescription(`**${tool.name}**  ·  #${id}`)
      .addFields(
        { name: "Field",     value: `\`${field}\``,  inline: true },
        { name: "Old Value", value: String(oldVal),  inline: true },
        { name: "New Value", value: String(value),   inline: true },
      )
      .setFooter({ text: `Updated by ${interaction.user.tag}` }).setTimestamp()
  ]});

  await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID || process.env.ORDERS_CHANNEL_ID, {
    embeds: [new EmbedBuilder().setColor(AMBER).setTitle("Tool Updated")
      .setDescription(`**${tool.name}** (#${id})  ·  \`${field}\` changed from **${oldVal}** → **${value}**`)
      .setFooter({ text: `By ${interaction.user.tag}` }).setTimestamp()
    ]
  });
}

// ── Orders ────────────────────────────────────────────────────────────────────
async function handleOrders(interaction) {
  await interaction.deferReply();
  const status = interaction.options.getString("status") || "in_flight";
  const snap   = await db.collection("allOrders").where("status", "==", status).orderBy("createdAt", "desc").limit(10).get();

  if (snap.empty) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(statusColor(status))
      .setTitle("Orders").setDescription(`No **${statusLabel(status)}** orders right now.`).setTimestamp()
  ]});

  const embed = new EmbedBuilder()
    .setColor(statusColor(status))
    .setTitle(`${statusLabel(status)}  —  ${snap.size} order${snap.size !== 1 ? "s" : ""}`)
    .setTimestamp();

  snap.docs.forEach(d => {
    const o     = d.data();
    const items = (o.items || []).map(it => `${it.name}${it.type === "buy" ? " (buy)" : ` (${it.hours}h)`}`).join(", ");
    const addr  = o.address ? `${o.address.building || "—"}` : "—";
    const total = `$${(o.total || 0).toFixed(2)}`;
    const date  = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : "—";
    embed.addFields({
      name:  `#${d.id.slice(0, 8).toUpperCase()}  ·  ${total}`,
      value: `\`Items\`    ${items}\n\`Deliver\` ${addr}\n\`Customer\`${o.userEmail || "—"}\n\`Placed\`  ${date}`,
    });
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handleOrderStatus(interaction) {
  await interaction.deferReply();
  const orderId   = interaction.options.getString("order_id");
  const newStatus = interaction.options.getString("status");

  const orderSnap = await db.collection("allOrders").doc(orderId).get();
  if (!orderSnap.exists) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(RED).setDescription(`Order \`${orderId}\` not found.`)
  ]});

  const order  = orderSnap.data();
  const update = {
    status:    newStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(newStatus === "delivered" ? { deliveredAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
  };

  await db.collection("allOrders").doc(orderId).update(update);

  if (order.userId && order.userOrderId) {
    try {
      await db.collection("users").doc(order.userId)
        .collection("orders").doc(order.userOrderId).update(update);
    } catch(e) { console.warn("Could not update user order:", e.message); }
  }

  // Restore stock on returned or cancelled
  if (newStatus === "returned" || newStatus === "cancelled") {
    const tools = await getTools();
    for (const item of (order.items || [])) {
      if (!item.id || item.type === "buy") continue; // don't restore buy items
      const idx = tools.findIndex(t => t.id === parseInt(item.id));
      if (idx < 0) continue;
      const qty       = parseInt(tools[idx].qty) || 1;
      const rentedQty = Math.max(0, (parseInt(tools[idx].rentedQty) || 1) - 1);
      await rtdb.ref(`tools/${idx}`).update({ rentedQty, available: rentedQty < qty });
    }
  }

  await interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(statusColor(newStatus)).setTitle("Order Updated")
      .setDescription(`Order \`${orderId.slice(0, 8).toUpperCase()}\` → **${statusLabel(newStatus)}**`)
      .addFields(
        { name: "Customer", value: order.userEmail || "—",                              inline: true },
        { name: "Total",    value: `$${(order.total || 0).toFixed(2)}`,                 inline: true },
        { name: "Items",    value: (order.items||[]).map(i => i.name).join(", ") || "—", inline: false },
      )
      .setFooter({ text: `Updated by ${interaction.user.tag}` }).setTimestamp()
  ]});
}

// ── Partners ──────────────────────────────────────────────────────────────────
async function handlePartners(interaction) {
  await interaction.deferReply();
  const snap    = await db.collection("partners").where("status", "==", "active").get();
  const tools   = await getTools();

  if (snap.empty) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(GRAY).setTitle("Partners").setDescription("No active partners yet.").setTimestamp()
  ]});

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(`Droveia — Active Partners (${snap.size})`)
    .setTimestamp();

  snap.docs.forEach(d => {
    const p       = d.data();
    const pTools  = tools.filter(t => t.partnerEmail === p.email);
    const rentCnt = pTools.filter(t => t.type !== "buy").length;
    const buyCnt  = pTools.filter(t => t.type === "buy" || t.type === "both").length;
    embed.addFields({
      name:  p.name || p.email,
      value: `\`Email\`   ${p.email}\n\`Items\`   ${pTools.length} live (${rentCnt} rent · ${buyCnt} buy)\n\`Station\` ${p.stationId || "—"}`,
    });
  });

  await interaction.editReply({ embeds: [embed] });
}

async function handlePending(interaction) {
  await interaction.deferReply();
  const snap = await db.collection("pendingInventory").where("status", "==", "pending").get();

  if (snap.empty) return interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(GREEN).setTitle("Pending Inventory").setDescription("No pending submissions.").setTimestamp()
  ]});

  const embed = new EmbedBuilder()
    .setColor(AMBER)
    .setTitle(`Pending Inventory — ${snap.size} submission${snap.size !== 1 ? "s" : ""}`)
    .setTimestamp();

  snap.docs.slice(0, 10).forEach(d => {
    const item = d.data();
    embed.addFields({
      name:  `${item.name}  ·  ${item.cat}`,
      value: `\`Partner\` ${item.partnerEmail || "—"}\n\`Type\`    ${typeLabel(item.type)}\n\`Rent\`    $${item.pph || 0}/hr  ·  \`Buy\` $${item.buyPrice || 0}\n\`Qty\`     ${item.qty || 1}\n\`DocID\`   ${d.id}`,
    });
  });

  if (snap.size > 10) embed.setFooter({ text: `Showing 10 of ${snap.size}` });
  await interaction.editReply({ embeds: [embed] });
}

async function handleStats(interaction) {
  await interaction.deferReply();
  const [tools, ordersSnap, partnersSnap] = await Promise.all([
    getTools(),
    db.collection("allOrders").get(),
    db.collection("partners").where("status", "==", "active").get(),
  ]);

  const orders       = ordersSnap.docs.map(d => d.data());
  const inFlight     = orders.filter(o => o.status === "in_flight").length;
  const delivered    = orders.filter(o => o.status === "delivered").length;
  const totalRevenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + (o.total || 0), 0);
  const totalTools   = tools.length;
  const totalQty     = tools.reduce((s, t) => s + (parseInt(t.qty) || 1), 0);
  const rented       = tools.reduce((s, t) => s + (parseInt(t.rentedQty) || 0), 0);
  const rentOnly     = tools.filter(t => !t.type || t.type === "rent").length;
  const buyOnly      = tools.filter(t => t.type === "buy").length;
  const both         = tools.filter(t => t.type === "both").length;
  const partnerTools = tools.filter(t => t.partnerEmail).length;

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle("Droveia — Live Stats")
    .addFields(
      { name: "Inventory",       value: `${totalTools} tools  ·  ${totalQty} units\n${rented} rented  ·  ${totalQty - rented} available`, inline: false },
      { name: "Listing Types",   value: `Rent: ${rentOnly}  ·  Buy: ${buyOnly}  ·  Both: ${both}`, inline: false },
      { name: "Partner Items",   value: `${partnerTools} tools from ${partnersSnap.size} partner${partnersSnap.size !== 1 ? "s" : ""}`, inline: false },
      { name: "Orders",          value: `${inFlight} in flight  ·  ${delivered} delivered`, inline: false },
      { name: "Total Revenue",   value: `$${totalRevenue.toFixed(2)} delivered`, inline: false },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── Add Admin ─────────────────────────────────────────────────────────────────
async function handleAddAdmin(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const email = interaction.options.getString("email");
  const fb    = admin.firestore();

  try {
    const ref  = fb.collection("config").doc("admins");
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { emails: [] };
    const list = data.emails || [];

    if (list.includes(email)) {
      return interaction.editReply({ content: `**${email}** is already an admin.` });
    }

    list.push(email);
    await ref.set({ emails: list }, { merge: true });

    await interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(GREEN).setTitle("Admin Added")
        .setDescription(`**${email}** has been granted admin access to Droveia.`)
        .addFields({ name: "Total Admins", value: `${list.length}`, inline: true })
        .setFooter({ text: `Added by ${interaction.user.tag}` }).setTimestamp()
    ]});
  } catch(e) {
    interaction.editReply({ content: `Error: ${e.message}` });
  }
}

async function handleRemoveAdmin(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const email = interaction.options.getString("email");
  const fb    = admin.firestore();

  try {
    const ref  = fb.collection("config").doc("admins");
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { emails: [] };
    const list = (data.emails || []).filter(e => e !== email);

    if ((data.emails || []).length === list.length) {
      return interaction.editReply({ content: `**${email}** is not in the admin list.` });
    }

    await ref.set({ emails: list }, { merge: true });

    await interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setTitle("Admin Removed")
        .setDescription(`**${email}** has been removed from admin access.`)
        .addFields({ name: "Total Admins", value: `${list.length}`, inline: true })
        .setFooter({ text: `Removed by ${interaction.user.tag}` }).setTimestamp()
    ]});
  } catch(e) {
    interaction.editReply({ content: `Error: ${e.message}` });
  }
}

async function handleListAdmins(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const fb   = admin.firestore();
  const snap = await fb.collection("config").doc("admins").get();
  const list = snap.exists ? (snap.data().emails || []) : [];

  await interaction.editReply({ embeds: [
    new EmbedBuilder().setColor(BLUE).setTitle("Droveia Admins")
      .setDescription(list.length ? list.map((e, i) => `${i + 1}. ${e}`).join("\n") : "No admins configured.")
      .setTimestamp()
  ]});
}

// ── Add Partner ───────────────────────────────────────────────────────────────
async function handleAddPartner(interaction) {
  await interaction.deferReply();
  const email     = interaction.options.getString("email");
  const name      = interaction.options.getString("name");
  const stationId = interaction.options.getString("station") || `station-${email.split("@")[0]}`;
  const logoUrl   = interaction.options.getString("logo") || null;
  const fb        = admin.firestore();

  try {
    // Check if already exists
    const existing = await fb.collection("partners").where("email", "==", email).get();
    if (!existing.empty) {
      return interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(AMBER).setTitle("Partner Already Exists")
          .setDescription(`**${email}** is already a registered partner.`)
      ]});
    }

    const partnerData = {
      email,
      name:      name || email,
      stationId,
      logoUrl,
      status:    "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      addedBy:   interaction.user.tag,
    };

    await fb.collection("partners").add(partnerData);

    await interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(GREEN).setTitle("Partner Added")
        .setDescription(`**${name || email}** is now a Droveia partner.`)
        .addFields(
          { name: "Email",      value: email,      inline: true },
          { name: "Station ID", value: stationId,  inline: true },
          { name: "Status",     value: "Active",   inline: true },
        )
        .setFooter({ text: `Added by ${interaction.user.tag}` }).setTimestamp()
    ]});

    await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID || process.env.ORDERS_CHANNEL_ID, {
      embeds: [new EmbedBuilder().setColor(GREEN).setTitle("New Partner Onboarded")
        .setDescription(`**${name || email}** has been added as a partner by ${interaction.user.tag}`)
        .addFields({ name: "Station", value: stationId, inline: true })
        .setTimestamp()
      ]
    });
  } catch(e) {
    interaction.editReply({ content: `Error: ${e.message}` });
  }
}

async function handleRemovePartner(interaction) {
  await interaction.deferReply();
  const email = interaction.options.getString("email");
  const fb    = admin.firestore();

  try {
    const snap = await fb.collection("partners").where("email", "==", email).get();
    if (snap.empty) {
      return interaction.editReply({ embeds: [
        new EmbedBuilder().setColor(RED).setDescription(`No partner found with email **${email}**`)
      ]});
    }

    const doc  = snap.docs[0];
    const data = doc.data();
    await doc.ref.update({ status: "inactive", removedAt: admin.firestore.FieldValue.serverTimestamp(), removedBy: interaction.user.tag });

    await interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setTitle("Partner Deactivated")
        .setDescription(`**${data.name || email}** has been deactivated.`)
        .addFields({ name: "Email", value: email, inline: true })
        .setFooter({ text: `Deactivated by ${interaction.user.tag}` }).setTimestamp()
    ]});
  } catch(e) {
    interaction.editReply({ content: `Error: ${e.message}` });
  }
}

async function handlePartnerInfo(interaction) {
  await interaction.deferReply();
  const email = interaction.options.getString("email");
  const fb    = admin.firestore();

  try {
    const [partnerSnap, tools, pendingSnap] = await Promise.all([
      fb.collection("partners").where("email", "==", email).get(),
      getTools(),
      fb.collection("pendingInventory").where("partnerEmail", "==", email).get(),
    ]);

    if (partnerSnap.empty) return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`No partner found with email **${email}**`)
    ]});

    const p        = partnerSnap.docs[0].data();
    const pTools   = tools.filter(t => t.partnerEmail === email);
    const pending  = pendingSnap.docs.map(d => d.data()).filter(i => i.status === "pending");
    const rentCnt  = pTools.filter(t => !t.type || t.type === "rent").length;
    const buyCnt   = pTools.filter(t => t.type === "buy" || t.type === "both").length;

    const embed = new EmbedBuilder()
      .setColor(BLUE).setTitle(`Partner — ${p.name || email}`)
      .addFields(
        { name: "Email",          value: email,                        inline: true },
        { name: "Status",         value: p.status || "unknown",        inline: true },
        { name: "Station",        value: p.stationId || "—",           inline: true },
        { name: "Live Items",     value: `${pTools.length} (${rentCnt} rent · ${buyCnt} buy)`, inline: true },
        { name: "Pending",        value: `${pending.length} awaiting approval`, inline: true },
        { name: "Since",          value: p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "—", inline: true },
      ).setTimestamp();

    if (pTools.length) {
      const itemList = pTools.slice(0, 8).map(t => `\`#${t.id}\` ${t.name} — ${typeLabel(t.type)}`).join("\n");
      embed.addFields({ name: "Live Inventory", value: itemList });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch(e) {
    interaction.editReply({ content: `Error: ${e.message}` });
  }
}

// ── Notify channel ────────────────────────────────────────────────────────────
async function notifyChannel(client, channelId, payload) {
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch) await ch.send(typeof payload === "string" ? { content: payload } : payload);
  } catch(e) { console.error("notifyChannel error:", e.message); }
}

// ── Bot ready ─────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`Droveia Bot online as ${client.user.tag}`);
  client.user.setActivity("Droveia deliveries", { type: ActivityType.Watching });
});

// ── Interaction handler ───────────────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Admin gate
  if (!ADMIN_IDS.includes(interaction.user.id)) {
    const msg = { content: "You are not authorized to use Droveia bot commands.", ephemeral: true };
    return interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
  }

  console.log(`/${interaction.commandName} by ${interaction.user.tag}`);

  try {
    switch (interaction.commandName) {
      case "inventory":    await handleInventory(interaction);   break;
      case "tool":         await handleTool(interaction);        break;
      case "addtool":      await handleAddTool(interaction);     break;
      case "removetool":   await handleRemoveTool(interaction);  break;
      case "edittool":     await handleEditTool(interaction);    break;
      case "orders":       await handleOrders(interaction);      break;
      case "orderstatus":  await handleOrderStatus(interaction); break;
      case "partners":     await handlePartners(interaction);    break;
      case "pending":      await handlePending(interaction);     break;
      case "stats":        await handleStats(interaction);        break;
      case "addadmin":     await handleAddAdmin(interaction);     break;
      case "removeadmin":  await handleRemoveAdmin(interaction);  break;
      case "listadmins":   await handleListAdmins(interaction);   break;
      case "addpartner":   await handleAddPartner(interaction);   break;
      case "removepartner":await handleRemovePartner(interaction);break;
      case "partnerinfo":  await handlePartnerInfo(interaction);  break;
      default:
        interaction.reply({ content: `Unknown command: ${interaction.commandName}`, ephemeral: true });
    }
  } catch(err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: `Something went wrong: ${err.message}`, ephemeral: true };
    interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
  }
});

client.login(process.env.DISCORD_TOKEN);