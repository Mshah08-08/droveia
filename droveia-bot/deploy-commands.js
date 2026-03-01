const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("List all tools and their current status"),

  new SlashCommandBuilder()
    .setName("addtool")
    .setDescription("Add a new tool to inventory")
    .addStringOption(o => o.setName("name").setDescription("Tool name").setRequired(true))
    .addStringOption(o => o.setName("cat").setDescription("Category").setRequired(true)
      .addChoices(
        { name: "Workshop", value: "Workshop" },
        { name: "Crafts", value: "Crafts" },
        { name: "Office", value: "Office" },
        { name: "Electronics", value: "Electronics" }
      ))
    .addNumberOption(o => o.setName("retail").setDescription("Retail price ($)").setRequired(true))
    .addStringOption(o => o.setName("desc").setDescription("Description").setRequired(true))
    .addStringOption(o => o.setName("eta").setDescription("Delivery ETA (e.g. '8 min')").setRequired(true))
    .addNumberOption(o => o.setName("rating").setDescription("Rating (1-5)").setRequired(false))
    .addNumberOption(o => o.setName("pph").setDescription("Price per hour (0 = auto-calculate)").setRequired(false))
    .addStringOption(o => o.setName("img").setDescription("Image URL").setRequired(false)),

  new SlashCommandBuilder()
    .setName("removetool")
    .setDescription("Remove a tool from inventory")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("edittool")
    .setDescription("Edit a tool's details")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true))
    .addStringOption(o => o.setName("field").setDescription("Field to edit").setRequired(true)
      .addChoices(
        { name: "name", value: "name" },
        { name: "category", value: "cat" },
        { name: "retail price", value: "retail" },
        { name: "pph (0=auto)", value: "pph" },
        { name: "description", value: "desc" },
        { name: "eta", value: "eta" },
        { name: "rating", value: "rating" },
        { name: "image url", value: "img" }
      ))
    .addStringOption(o => o.setName("value").setDescription("New value").setRequired(true)),

  new SlashCommandBuilder()
    .setName("available")
    .setDescription("Mark a tool as available")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unavailable")
    .setDescription("Mark a tool as unavailable")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("orders")
    .setDescription("View recent active orders"),

  new SlashCommandBuilder()
    .setName("tool")
    .setDescription("Get details about a specific tool")
    .addIntegerOption(o => o.setName("id").setDescription("Tool ID").setRequired(true)),
].map(c => c.setDMPermission(true).toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("Slash commands registered globally!");
  } catch (err) {
    console.error(err);
  }
})();