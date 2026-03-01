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
  const rate   = calcRate(t);
  const avail  = t.available !== false;
  const cost4h = (rate * 2.20 * 4).toFixed(2);
  const cost1d = (rate * 1.20 * 24).toFixed(2);
  const cost2d = (rate * 1.00 * 48).toFixed(2);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(label ? `${label}  —  ${t.name}` : t.name)
    .setDescription(`\`#${t.id}\`  ·  ${t.cat}  ·  ${t.desc || "—"}`)
    .addFields(
      { name: "Retail Price", value: `$${t.retail}`,           inline: true },
      { name: "Base Rate",    value: `$${rate.toFixed(2)}/hr`, inline: true },
      { name: "Status",       value: avail ? "Available" : "Unavailable", inline: true },
      { name: "ETA",          value: t.eta || "—",             inline: true },
      { name: "Rating",       value: `${t.rating || "N/A"} / 5`, inline: true },
      { name: "\u200b",       value: "\u200b",                 inline: true },
      { name: "4h rental",    value: `$${cost4h}`,             inline: true },
      { name: "1 day rental", value: `$${cost1d}`,             inline: true },
      { name: "2 day rental", value: `$${cost2d}`,             inline: true },
    )
    .setFooter({ text: `Tool ID: ${t.id}` })
    .setTimestamp();

  if (t.img && t.img !== "x") embed.setImage(t.img);
  return embed;
}

// ── Inventory embed ───────────────────────────────────────────────────────────
function inventoryEmbed(tools) {
  const total     = tools.length;
  const available = tools.filter(t => t.available !== false).length;
  const cats      = ["Workshop", "Crafts", "Office", "Electronics"];

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle("Droveia  —  Inventory")
    .setDescription(
      `**${total}** tools total  ·  **${available}** available  ·  **${total - available}** rented out`
    )
    .setTimestamp();

  for (const cat of cats) {
    const catTools = tools.filter(t => t.cat === cat);
    if (!catTools.length) continue;
    const lines = catTools.map(t => {
      const rate  = calcRate(t);
      const state = t.available !== false ? "[ Available ]" : "[ Rented    ]";
      const id    = `#${String(t.id).padStart(2, "0")}`;
      const name  = t.name.substring(0, 16).padEnd(16, " ");
      return `\`${id}  ${name}  $${rate.toFixed(2).padStart(5)}/hr  ${state}\``;
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

  const tool = {
    id:        nextId,
    name:      interaction.options.getString("name"),
    cat:       interaction.options.getString("cat"),
    retail:    interaction.options.getNumber("retail"),
    desc:      interaction.options.getString("desc"),
    eta:       interaction.options.getString("eta"),
    pph:       interaction.options.getNumber("pph") || 0,
    rating:    interaction.options.getNumber("rating") || 4.5,
    img:       interaction.options.getString("img") || "x",
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
          { name: "ID",       value: `#${tool.id}`,    inline: true },
          { name: "Category", value: tool.cat,         inline: true },
          { name: "Retail",   value: `$${tool.retail}`,inline: true },
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
  const tool  = tools.find(t => t.id === id);

  if (!tool) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
    ]});
  }

  const oldVal = tool[field];
  tool[field]  = ["retail", "pph", "rating"].includes(field) ? parseFloat(value) : value;
  await saveTools(tools);

  await interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(AMBER)
      .setTitle("Tool Updated")
      .setDescription(`**${tool.name}**  ·  #${id}`)
      .addFields(
        { name: "Field",     value: `\`${field}\``,  inline: true },
        { name: "Old Value", value: String(oldVal),  inline: true },
        { name: "New Value", value: String(value),   inline: true },
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

async function handleAvailability(interaction, available) {
  await interaction.deferReply();
  const id    = interaction.options.getInteger("id");
  const tools = await getTools();
  const tool  = tools.find(t => t.id === id);

  if (!tool) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder().setColor(RED).setDescription(`No tool found with ID #${id}`)
    ]});
  }

  tool.available = available;
  await saveTools(tools);

  await db.collection("inventory").doc(String(id)).set({
    toolId: id,
    available,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: interaction.user.tag,
  });

  const color = available ? GREEN : RED;
  const label = available ? "Available" : "Unavailable";

  await interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`Marked ${label}`)
      .setDescription(`**${tool.name}** is now **${label}**.`)
      .addFields(
        { name: "ID",       value: `#${id}`,  inline: true },
        { name: "Category", value: tool.cat,  inline: true },
        { name: "Status",   value: label,     inline: true },
      )
      .setFooter({ text: `Updated by ${interaction.user.tag}` })
      .setTimestamp()
  ]});

  await notifyChannel(interaction.client, process.env.INVENTORY_CHANNEL_ID, {
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle("Availability Update")
        .setDescription(`**${tool.name}** (#${id}) is now **${label}**.`)
        .setFooter({ text: `By ${interaction.user.tag}` })
        .setTimestamp()
    ]
  });
}

async function handleOrders(interaction) {
  await interaction.deferReply();
  const usersSnap    = await db.collection("users").listDocuments();
  const activeOrders = [];

  for (const userDoc of usersSnap) {
    const ordersSnap = await db
      .collection("users").doc(userDoc.id)
      .collection("orders")
      .where("status", "==", "in_flight")
      .get();
    ordersSnap.docs.forEach(d =>
      activeOrders.push({ ...d.data(), _id: d.id, _uid: userDoc.id })
    );
  }

  if (!activeOrders.length) {
    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(GRAY)
        .setTitle("Active Orders")
        .setDescription("No active orders right now.")
        .setTimestamp()
    ]});
  }

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle(`Active Orders  —  ${activeOrders.length} in flight`)
    .setTimestamp();

  activeOrders.slice(0, 10).forEach(o => {
    const items = (o.items || []).map(it => it.name).join(", ");
    const addr  = o.address ? `${o.address.building}, Room ${o.address.room}` : "—";
    const total = `$${(o.total || 0).toFixed(2)}`;
    embed.addFields({
      name:  `#${o._id.slice(0, 8).toUpperCase()}  ·  ${total}`,
      value: `\`Items\`       ${items}\n\`Deliver to\`  ${addr}`,
    });
  });

  await interaction.editReply({ embeds: [embed] });
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

// ── Firestore inventory watcher ───────────────────────────────────────────────
function watchInventory() {
  db.collection("inventory").onSnapshot(snap => {
    snap.docChanges().forEach(async change => {
      if (change.type !== "modified") return;
      const data  = change.doc.data();
      const tools = await getTools();
      const tool  = tools.find(t => t.id === data.toolId);
      if (!tool) return;

      // Sync availability back to RTDB so bot stays in sync with site
      if (tool.available !== data.available) {
        tool.available = data.available;
        await saveTools(tools);
        console.log(`Synced #${tool.id} ${tool.name} -> ${data.available ? "available" : "unavailable"}`);
      }

      const label = data.available ? "Available" : "Unavailable";
      const color = data.available ? GREEN : RED;
      await notifyChannel(client, process.env.INVENTORY_CHANNEL_ID, {
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle("Availability Update")
            .setDescription(`**${tool.name}** is now **${label}**.`)
            .setTimestamp()
        ]
      });
    });
  });
}

// ── Bot ready ─────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`Droveia Bot online as ${client.user.tag}`);
  client.user.setActivity("Droveia", { type: ActivityType.Watching });
  await syncFirestoreToRTDB();
  watchInventory();
});

// On startup: pull Firestore inventory into RTDB so they match
async function syncFirestoreToRTDB() {
  try {
    const snap  = await db.collection("inventory").get();
    const tools = await getTools();
    let changed = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      const tool = tools.find(t => t.id === data.toolId);
      if (tool && tool.available !== data.available) {
        tool.available = data.available;
        changed++;
      }
    });
    if (changed) {
      await saveTools(tools);
      console.log(`Startup sync: updated ${changed} tools from Firestore`);
    } else {
      console.log("Startup sync: all tools in sync");
    }
  } catch(e) {
    console.error("syncFirestoreToRTDB error:", e.message);
  }
}

// ── Interaction handler ───────────────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  console.log(`/${interaction.commandName} by ${interaction.user.tag}`);

  try {
    switch (interaction.commandName) {
      case "inventory":   await handleInventory(interaction);           break;
      case "addtool":     await handleAddTool(interaction);             break;
      case "removetool":  await handleRemoveTool(interaction);          break;
      case "edittool":    await handleEditTool(interaction);            break;
      case "available":   await handleAvailability(interaction, true);  break;
      case "unavailable": await handleAvailability(interaction, false); break;
      case "orders":      await handleOrders(interaction);              break;
      case "tool":        await handleTool(interaction);                break;
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: "Something went wrong.", ephemeral: true };
    interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
  }
});

client.login(process.env.DISCORD_TOKEN);