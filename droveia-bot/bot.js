require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require("discord.js");
const admin = require("firebase-admin");

// ── Firebase Admin Init ──────────────────────────────────────────────────────
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
const BLUE  = 0x1a6ef0;
const GREEN = 0x22c55e;
const AMBER = 0xf59e0b;
const RED   = 0xef4444;
const GRAY  = 0x6b7280;

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

// ── Tool detail embed ─────────────────────────────────────────────────────────
function toolEmbed(t, color = BLUE, label = null) {
  const rate      = calcRate(t);
  const qty       = parseInt(t.qty)       || 1;
  const rentedQty = parseInt(t.rentedQty) || 0;
  const avail     = qty > rentedQty;
  const cost4h    = (rate * 2.20 * 4).toFixed(2);
  const cost1d    = (rate * 1.20 * 24).toFixed(2);
  const cost2d    = (rate * 1.00 * 48).toFixed(2);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(label ? `${label}  —  ${t.name}` : t.name)
    .setDescription(`\`#${t.id}\`  ·  ${t.cat}  ·  ${t.desc || "—"}`)
    .addFields(
      { name: "Retail Price", value: `$${t.retail}`,                            inline: true },
      { name: "Base Rate",    value: `$${rate.toFixed(2)}/hr`,                  inline: true },
      { name: "Status",       value: avail ? "✅ Available" : "❌ Out of Stock", inline: true },
      { name: "In Stock",     value: `${qty - rentedQty} / ${qty}`,             inline: true },
      { name: "Rented Out",   value: `${rentedQty}`,                            inline: true },
      { name: "ETA",          value: t.eta || "—",                              inline: true },
      { name: "4h rental",    value: `$${cost4h}`,                              inline: true },
      { name: "1 day rental", value: `$${cost1d}`,                              inline: true },
      { name: "2 day rental", value: `$${cost2d}`,                              inline: true },
    )
    .setFooter({ text: `Tool ID: ${t.id}` })
    .setTimestamp();

  if (t.img && t.img !== "x") embed.setImage(t.img);
  return embed;
}

// ── Inventory embed ───────────────────────────────────────────────────────────
function inventoryEmbed(tools) {
  const total     = tools.length;
  const totalQty  = tools.reduce((s, t) => s + (parseInt(t.qty) || 1), 0);
  const rented    = tools.reduce((s, t) => s + (parseInt(t.rentedQty) || 0), 0);
  const available = totalQty - rented;
  const cats      = ["Workshop", "Crafts", "Office", "Electronics"];

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle("Droveia  —  Inventory")
    .setDescription(
      `**${total}** tools  ·  **${available}** units available  ·  **${rented}** rented out`
    )
    .setTimestamp();

  for (const cat of cats) {
    const catTools = tools.filter(t => t.cat === cat);
    if (!catTools.length) continue;
    const lines = catTools.map(t => {
      const rate      = calcRate(t);
      const qty       = parseInt(t.qty) || 1;
      const rentedQty = parseInt(t.rentedQty) || 0;
      const avail     = qty > rentedQty;
      const stock     = `${qty - rentedQty}/${qty}`;
      const state     = avail ? "[ In Stock ]" : "[ Out      ]";
      const id        = `#${String(t.id).padStart(2, "0")}`;
      const name      = t.name.substring(0, 16).padEnd(16, " ");
      return `\`${id}  ${name}  $${rate.toFixed(2).padStart(5)}/hr  ${stock.padStart(5)}  ${state}\``;
    }).join("\n");
    embed.addFields({ name: cat, value: lines });
  }

  return embed;
}

// ── Command Handlers ──────────────────────────────────────────────────────────
async function handleInventory(interaction) {
  await interaction.deferReply();
  const tools = await getTools();
  if (!tools.length) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(GRAY).setTitle("Inventory").setDescription("No tools found.")
    ]});
  }
  await interaction.editReply({ embeds: [inventoryEmbed(tools)] });
}

async function handleAddTool(interaction) {
  await interaction.deferReply();
  const tools  = await getTools();
  const nextId = tools.length ? Math.max(...tools.map(t => t.id || 0)) + 1 : 1;
  const qty    = interaction.options.getInteger("qty") || 1;

  const tool = {
    id:        nextId,
    name:      interaction.options.getString("name"),
    cat:       interaction.options.getString("cat"),
    retail:    interaction.options.getNumber("retail"),
    desc:      interaction.options.getString("desc") || "",
    eta:       interaction.options.getString("eta"),
    pph:       interaction.options.getNumber("pph") || 0,
    rating:    interaction.options.getNumber("rating") || 4.5,
    img:       interaction.options.getString("img") || "x",
    qty:       qty,
    rentedQty: 0,
    available: true,
  };

  tools.push(tool);
  await saveTools(tools);

  await interaction.editReply({ embeds: [toolEmbed(tool, GREEN, "Added")] });
  await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID, {
    embeds: [
      new EmbedBuilder()
        .setColor(GREEN)
        .setTitle("Tool Added")
        .setDescription(`**${tool.name}** has been added to inventory.`)
        .addFields(
          { name: "ID",       value: `#${tool.id}`,     inline: true },
          { name: "Category", value: tool.cat,          inline: true },
          { name: "Qty",      value: `${qty}`,          inline: true },
          { name: "Retail",   value: `$${tool.retail}`, inline: true },
        )
        .setFooter({ text: `Added by ${interaction.user.tag}` })
        .setTimestamp()
    ]
  });
}

async function handleRemoveTool(interaction) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const tools = await getTools();
  const idx   = tools.findIndex(t => t.id === id);

  if (idx === -1) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
    ]});
  }

  const removed = tools.splice(idx, 1)[0];
  await saveTools(tools);

  await interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(RED)
      .setTitle("Tool Removed")
      .setDescription(`**${removed.name}** has been removed from inventory.`)
      .addFields({ name: "ID", value: `#${id}`, inline: true })
      .setFooter({ text: `Removed by ${interaction.user.tag}` })
      .setTimestamp()
  ]});

  await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID, {
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle("Tool Removed")
        .setDescription(`**${removed.name}** (#${id}) removed by ${interaction.user.tag}`)
        .setTimestamp()
    ]
  });
}

async function handleEditTool(interaction) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const field = interaction.options.getString("field");
  const value = interaction.options.getString("value");
  const tools = await getTools();
  const idx   = tools.findIndex(t => t.id === id);

  if (idx === -1) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
    ]});
  }

  const tool   = tools[idx];
  const oldVal = tool[field];

  if (["retail", "pph", "rating", "qty", "rentedQty"].includes(field)) {
    tool[field] = parseFloat(value);
  } else {
    tool[field] = value;
  }

  // Recompute available if stock fields changed
  if (field === "qty" || field === "rentedQty") {
    tool.available = (parseInt(tool.qty) || 1) > (parseInt(tool.rentedQty) || 0);
  }

  await saveTools(tools);

  await interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(AMBER)
      .setTitle("Tool Updated")
      .setDescription(`**${tool.name}**  ·  #${id}`)
      .addFields(
        { name: "Field",     value: `\`${field}\``, inline: true },
        { name: "Old Value", value: String(oldVal), inline: true },
        { name: "New Value", value: String(value),  inline: true },
      )
      .setFooter({ text: `Updated by ${interaction.user.tag}` })
      .setTimestamp()
  ]});

  await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID, {
    embeds: [
      new EmbedBuilder()
        .setColor(AMBER)
        .setTitle("Tool Updated")
        .setDescription(`**${tool.name}** (#${id})  ·  \`${field}\` changed from **${oldVal}** to **${value}**`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()
    ]
  });
}

// ── Orders — reads from allOrders collection ──────────────────────────────────
async function handleOrders(interaction) {
  await interaction.deferReply();
  const status = interaction.options.getString("status") || "in_flight";
  const snap   = await db.collection("allOrders").where("status", "==", status).get();

  const statusLabels = { in_flight: "In Flight ✈", delivered: "Delivered ✓", returned: "Returned ↩", cancelled: "Cancelled ✕" };
  const statusColors = { in_flight: BLUE, delivered: GREEN, returned: GRAY, cancelled: RED };

  if (snap.empty) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(statusColors[status] || GRAY)
        .setTitle("Orders")
        .setDescription(`No **${statusLabels[status] || status}** orders right now.`)
        .setTimestamp()
    ]});
  }

  const embed = new EmbedBuilder()
    .setColor(statusColors[status] || BLUE)
    .setTitle(`${statusLabels[status] || status}  —  ${snap.size} order${snap.size !== 1 ? "s" : ""}`)
    .setTimestamp();

  snap.docs.slice(0, 10).forEach(d => {
    const o     = d.data();
    const items = (o.items || []).map(it => `${it.name} (${it.hours}h)`).join(", ");
    const addr  = o.address ? `${o.address.building}${o.address.room ? `, Rm ${o.address.room}` : ""}` : "—";
    const total = `$${(o.total || 0).toFixed(2)}`;
    const date  = o.createdAt?._seconds
      ? new Date(o.createdAt._seconds * 1000).toLocaleString()
      : "—";

    embed.addFields({
      name:  `#${d.id.slice(0, 8).toUpperCase()}  ·  ${total}`,
      value: `\`Items\`     ${items}\n\`Deliver\`  ${addr}\n\`Customer\` ${o.userEmail || "—"}\n\`Placed\`   ${date}`,
    });
  });

  if (snap.size > 10) embed.setFooter({ text: `Showing 10 of ${snap.size} orders` });

  await interaction.editReply({ embeds: [embed] });
}

// ── Update order status ───────────────────────────────────────────────────────
async function handleOrderStatus(interaction) {
  await interaction.deferReply();
  const orderId   = interaction.options.getString("order_id");
  const newStatus = interaction.options.getString("status");

  const orderSnap = await db.collection("allOrders").doc(orderId).get();
  if (!orderSnap.exists) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`Order \`${orderId}\` not found.`)
    ]});
  }

  const order  = orderSnap.data();
  const update = {
    status:    newStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(newStatus === "delivered" ? { deliveredAt: admin.firestore.FieldValue.serverTimestamp() } : {})
  };

  await db.collection("allOrders").doc(orderId).update(update);

  // Update user's subcollection order too
  if (order.userId && order.userOrderId) {
    try {
      await db.collection("users").doc(order.userId)
        .collection("orders").doc(order.userOrderId).update(update);
    } catch(e) { console.warn("Could not update user order:", e.message); }
  }

  // Restore stock on returned or cancelled — only touch rentedQty
  if (newStatus === "returned" || newStatus === "cancelled") {
    const tools = await getTools();
    for (const item of (order.items || [])) {
      if (!item.id) continue;
      const idx = tools.findIndex(t => t.id === parseInt(item.id));
      if (idx < 0) continue;
      const qty       = parseInt(tools[idx].qty) || 1;
      const rentedQty = Math.max(0, (parseInt(tools[idx].rentedQty) || 1) - 1);
      await rtdb.ref(`tools/${idx}`).update({ rentedQty, available: rentedQty < qty });
    }
  }

  const statusColors = { in_flight: BLUE, delivered: GREEN, returned: GRAY, cancelled: RED };
  const color = statusColors[newStatus] || BLUE;

  await interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(color)
      .setTitle("Order Updated")
      .setDescription(`Order \`${orderId.slice(0, 8).toUpperCase()}\` → **${newStatus.replace(/_/g, " ")}**`)
      .addFields(
        { name: "Customer", value: order.userEmail || "—",                    inline: true },
        { name: "Total",    value: `$${(order.total || 0).toFixed(2)}`,       inline: true },
        { name: "Items",    value: (order.items||[]).map(i=>i.name).join(", ") || "—", inline: false },
      )
      .setFooter({ text: `Updated by ${interaction.user.tag}` })
      .setTimestamp()
  ]});
}

async function handleTool(interaction) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const tools = await getTools();
  const tool  = tools.find(t => t.id === id);

  if (!tool) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
    ]});
  }

  await interaction.editReply({ embeds: [toolEmbed(tool)] });
}

// ── Notify channel ────────────────────────────────────────────────────────────
async function notifyChannel(client, channelId, payload) {
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch) await ch.send(typeof payload === "string" ? { content: payload } : payload);
  } catch (e) {
    console.error("notifyChannel error:", e.message);
  }
}

// ── Bot ready ─────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`Droveia Bot online as ${client.user.tag}`);
  client.user.setActivity("Droveia", { type: ActivityType.Watching });
});

// ── Interaction handler ───────────────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  console.log(`/${interaction.commandName} by ${interaction.user.tag}`);

  try {
    switch (interaction.commandName) {
      case "inventory":   await handleInventory(interaction);   break;
      case "addtool":     await handleAddTool(interaction);     break;
      case "removetool":  await handleRemoveTool(interaction);  break;
      case "edittool":    await handleEditTool(interaction);    break;
      case "orders":      await handleOrders(interaction);      break;
      case "orderstatus": await handleOrderStatus(interaction); break;
      case "tool":        await handleTool(interaction);        break;
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: "Something went wrong.", ephemeral: true };
    interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
  }
});

client.login(process.env.DISCORD_TOKEN);