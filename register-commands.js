const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Search for a card or Pokémon VGC info")
    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("Choose a game")
        .setRequired(true)
        .addChoices(
          { name: "Pokémon", value: "pokemon" },
          { name: "Pokémon VGC", value: "pokemon_vgc" },
          { name: "Riftbound", value: "riftbound" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Card or Pokémon name")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Pokémon TCG format filter, ignored for VGC and Riftbound")
        .setRequired(false)
        .addChoices(
          { name: "All Printings", value: "all" },
          { name: "Pokemon Standard", value: "standard" },
          { name: "Pokemon Expanded", value: "expanded" },
          { name: "Pokemon Unlimited", value: "unlimited" }
        )
    ),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show help"),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });

    console.log("✅ Commands registered");
  } catch (error) {
    console.error("❌ Failed to register commands");
    console.error(error);
  }
})();