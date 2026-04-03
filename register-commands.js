const { REST, Routes, SlashCommandBuilder } = require("discord.js");
require("dotenv").config();

const commands = [
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Search for a Pokémon card")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Card name")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Choose a format filter")
        .setRequired(false)
        .addChoices(
          { name: "All Printings", value: "all" },
          { name: "Standard", value: "standard" },
          { name: "Expanded", value: "expanded" },
          { name: "Unlimited", value: "unlimited" }
        )
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show help"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands,
  });
  console.log("✅ Commands registered");
})();
