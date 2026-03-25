require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [

  // ── Inventory ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("inventory")
    .setDescription("View all tools in Droveia inventory")
    .addStringOption(o => o
      .setName("category")
      .setDescription("Filter by category")
      .setRequired(false)
      .addChoices(
        { name: "Workshop",     value: "Workshop" },
        { name: "Electronics",  value: "Electronics" },
        { name: "Crafts",       value: "Crafts" },
        { name: "Office",       value: "Office" },
        { name: "Food & Drinks",value: "Food" },
      )
    ),

  // ── Single tool ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("tool")
    .setDescription("View details for a specific tool")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true)),

  // ── Add tool ─────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("addtool")
    .setDescription("Add a new tool to Droveia inventory")
    .addStringOption(o =>  o.setName("name").setDescription("Tool name").setRequired(true))
    .addStringOption(o =>  o.setName("cat").setDescription("Category").setRequired(true)
      .addChoices(
        { name: "Workshop",     value: "Workshop" },
        { name: "Electronics",  value: "Electronics" },
        { name: "Crafts",       value: "Crafts" },
        { name: "Office",       value: "Office" },
        { name: "Food & Drinks",value: "Food" },
      ))
    .addNumberOption(o =>  o.setName("retail").setDescription("Retail price ($)").setRequired(true))
    .addStringOption(o =>  o.setName("type").setDescription("Listing type").setRequired(false)
      .addChoices(
        { name: "Rent only",    value: "rent" },
        { name: "Buy only",     value: "buy" },
        { name: "Rent + Buy",   value: "both" },
      ))
    .addNumberOption(o =>  o.setName("pph").setDescription("Rent price per hour ($). 0 = auto-calculate").setRequired(false))
    .addNumberOption(o =>  o.setName("buyprice").setDescription("Buy price ($). Required if type is buy or both").setRequired(false))
    .addIntegerOption(o => o.setName("qty").setDescription("Quantity in stock").setRequired(false))
    .addStringOption(o =>  o.setName("eta").setDescription("ETA string e.g. '8 min'").setRequired(false))
    .addStringOption(o =>  o.setName("desc").setDescription("Tool description").setRequired(false))
    .addStringOption(o =>  o.setName("img").setDescription("Image URL").setRequired(false))
    .addNumberOption(o =>  o.setName("rating").setDescription("Rating (1-5)").setRequired(false)),

  // ── Remove tool ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("removetool")
    .setDescription("Remove a tool from inventory")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true)),

  // ── Edit tool ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("edittool")
    .setDescription("Edit a field on an existing tool")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true))
    .addStringOption(o => o.setName("field").setDescription("Field to edit").setRequired(true)
      .addChoices(
        { name: "name",      value: "name" },
        { name: "cat",       value: "cat" },
        { name: "type",      value: "type" },
        { name: "retail",    value: "retail" },
        { name: "pph",       value: "pph" },
        { name: "buyPrice",  value: "buyPrice" },
        { name: "qty",       value: "qty" },
        { name: "rentedQty", value: "rentedQty" },
        { name: "eta",       value: "eta" },
        { name: "desc",      value: "desc" },
        { name: "img",       value: "img" },
        { name: "rating",    value: "rating" },
      ))
    .addStringOption(o => o.setName("value").setDescription("New value").setRequired(true)),

  // ── Orders ───────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("orders")
    .setDescription("View orders by status")
    .addStringOption(o => o.setName("status").setDescription("Order status to filter by").setRequired(false)
      .addChoices(
        { name: "In Flight",        value: "in_flight" },
        { name: "Pending Approval", value: "pending_approval" },
        { name: "Delivered",        value: "delivered" },
        { name: "Returned",         value: "returned" },
        { name: "Cancelled",        value: "cancelled" },
        { name: "Delayed",          value: "delayed" },
        { name: "Failed",           value: "failed" },
        { name: "Refunded",         value: "refunded" },
      )),

  // ── Order status update ───────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("orderstatus")
    .setDescription("Update the status of an order")
    .addStringOption(o => o.setName("order_id").setDescription("Firestore order document ID").setRequired(true))
    .addStringOption(o => o.setName("status").setDescription("New status").setRequired(true)
      .addChoices(
        { name: "In Flight",        value: "in_flight" },
        { name: "Delivered",        value: "delivered" },
        { name: "Returned",         value: "returned" },
        { name: "Cancelled",        value: "cancelled" },
        { name: "Delayed",          value: "delayed" },
        { name: "Failed",           value: "failed" },
        { name: "Refunded",         value: "refunded" },
        { name: "Pending Approval", value: "pending_approval" },
      )),

  // ── Partners ──────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("partners")
    .setDescription("View all active Droveia partners and their inventory"),

  // ── Pending inventory ─────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("pending")
    .setDescription("View pending partner inventory submissions awaiting approval"),

  // ── Stats ─────────────────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("stats")
    .setDescription("View live Droveia platform stats — inventory, orders, revenue"),

  // ── Admin management ──────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("addadmin")
    .setDescription("Grant admin access to a user by email")
    .addStringOption(o => o.setName("email").setDescription("Email address to grant admin access").setRequired(true)),

  new SlashCommandBuilder().setDMPermission(true)
    .setName("removeadmin")
    .setDescription("Revoke admin access from a user")
    .addStringOption(o => o.setName("email").setDescription("Email address to remove from admins").setRequired(true)),

  new SlashCommandBuilder().setDMPermission(true)
    .setName("listadmins")
    .setDescription("List all current admin emails"),

  // ── Partner management ────────────────────────────────────────────────────────
  new SlashCommandBuilder().setDMPermission(true)
    .setName("addpartner")
    .setDescription("Add a new Droveia partner")
    .addStringOption(o => o.setName("email").setDescription("Partner email address").setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("Partner / business name").setRequired(true))
    .addStringOption(o => o.setName("station").setDescription("Station ID (e.g. station-dallas-01) — auto-generated if blank").setRequired(false))
    .addStringOption(o => o.setName("logo").setDescription("Logo image URL").setRequired(false)),

  new SlashCommandBuilder().setDMPermission(true)
    .setName("removepartner")
    .setDescription("Deactivate a partner (does not delete — sets status to inactive)")
    .addStringOption(o => o.setName("email").setDescription("Partner email address").setRequired(true)),

  new SlashCommandBuilder().setDMPermission(true)
    .setName("partnerinfo")
    .setDescription("View full info and live inventory for a partner")
    .addStringOption(o => o.setName("email").setDescription("Partner email address").setRequired(true)),

].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
    console.log(`Registering ${commands.length} global slash commands (DM-accessible)...`);
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    console.log("Commands registered successfully.");
  } catch(err) {
    console.error("Failed to register commands:", err);
  }
})();