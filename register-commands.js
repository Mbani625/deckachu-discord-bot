const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Search for a card")

    .addStringOption((option) =>
      option
        .setName("game")
        .setDescription("Choose a game")
        .setRequired(true)
        .addChoices(
          { name: "Pokémon", value: "pokemon" },
          { name: "Riftbound", value: "riftbound" }
        )
    )

    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Choose a format filter")
        .setRequired(true)
        .addChoices(
          { name: "All Printings", value: "all" },
          { name: "Pokemon Standard", value: "standard" },
          { name: "Pokemon Expanded", value: "expanded" },
          { name: "Pokemon Unlimited", value: "unlimited" }
        )
    )

    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Card name")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("vgc")
    .setDescription("Look up Pokémon VGC moves and items")

    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Choose reference type")
        .setRequired(true)
        .addChoices(
          { name: "Move", value: "move" },
          { name: "Item", value: "item" }
        )
    )

    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Move or item name")
        .setRequired(true)
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