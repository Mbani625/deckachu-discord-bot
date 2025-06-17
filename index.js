const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
require("dotenv").config();
const axios = require("axios");

const { ButtonBuilder, ButtonStyle } = require("discord.js");

// Set up bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Register slash command
const commands = [
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Search for a Pokémon card by format and name")
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Format to search (standard, expanded, etc.)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Card name to search for")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn how to use the bot and its commands"),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Failed to register command:", error);
  }
})();

// On bot ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash command
  if (interaction.isChatInputCommand() && interaction.commandName === "card") {
    const format = interaction.options.getString("format").toLowerCase();
    const query = interaction.options
      .getString("name")
      .replace(/[^\w\s\-’:!'.]/gi, "");

    try {
      const { data } = await axios.get(`https://api.pokemontcg.io/v2/cards`, {
        params: { q: `name:${query}` },
        headers: { "X-Api-Key": "" }, // Optional if not using key
      });

      const cards = data.data
        ?.filter((card) => {
          if (format === "standard") {
            return (
              card.regulationMark && card.regulationMark.toUpperCase() >= "G"
            );
          }

          if (format === "expanded") {
            return card.legalities?.expanded === "Legal";
          }

          if (format === "unlimited") {
            return (
              card.legalities?.unlimited === "Legal" ||
              !card.legalities?.standard
            );
          }

          return false;
        })
        .slice(0, 250);

      if (!cards.length) {
        return interaction.reply({
          content: `❌ No legal cards found for "${query}" in ${format}.`,
          ephemeral: true,
        });
      }

      const options = cards.slice(0, 25).map((card, index) => ({
        label: `${card.name} (${card.set?.name ?? "Unknown Set"})`,
        description: `Reg: ${card.regulationMark ?? "?"} • Rarity: ${
          card.rarity ?? "Unknown"
        }`,
        value: index.toString(),
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("card_select")
        .setPlaceholder("Choose a card")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      client.userCardCache = client.userCardCache || new Map();
      client.userCardCache.set(interaction.user.id, {
        cards,
        page: 0,
      });

      // Auto-delete the user's cache after 10 minutes
      setTimeout(() => {
        client.userCardCache.delete(interaction.user.id);
      }, 10 * 60 * 1000);

      const totalPages = Math.ceil(cards.length / 25);
      const buttonRow = getPaginationButtons(0, totalPages);

      await interaction.reply({
        content: `🔍 Found cards for "${query}" in ${format}. Choose one below (Page 1 of ${totalPages}):`,
        components: [row, buttonRow],
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: "⚠️ Error fetching card info.",
        ephemeral: true,
      });
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "help") {
    return interaction.reply({
      content: `🧠 **Bot Help**

Use \`/card\` to search for a Pokémon card by name and format.

**Usage:**
\`/card format:<standard|expanded|unlimited> name:<card name>\`

Example:
\`/card format:standard name:Charizard\`

You'll receive a private dropdown with matching results. Once you select one, the card image will be posted publicly in the channel.

More features coming soon! 🎴`,
      ephemeral: true,
    });
  }

  // Handle card selection from dropdown
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "card_select"
  ) {
    const selectedIndex = parseInt(interaction.values[0], 10);
    const cache = client.userCardCache?.get(interaction.user.id);
    const card = cache?.cards?.[selectedIndex];

    if (!card) {
      return interaction.reply({
        content: "❌ Could not retrieve card data.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: `**${card.name}**\nSet: ${card.set.name}\nType: ${
        card.supertype
      } – ${card.subtypes?.join(", ") ?? "None"}\nRegulation Mark: ${
        card.regulationMark ?? "Unknown"
      }`,
      files: [card.images.large],
      ephemeral: false,
    });
  }

  if (interaction.isButton()) {
    const cache = client.userCardCache.get(interaction.user.id);
    if (!cache)
      return interaction.reply({
        content: "Card list expired.",
        ephemeral: true,
      });

    let { page, cards } = cache;
    const totalPages = Math.ceil(cards.length / 25);

    if (interaction.customId === "prev_page") page--;
    if (interaction.customId === "next_page") page++;

    client.userCardCache.set(interaction.user.id, { cards, page });

    const options = getCardOptions(cards, page);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("card_select")
      .setPlaceholder("Choose a card")
      .addOptions(options);

    const menuRow = new ActionRowBuilder().addComponents(selectMenu);
    const buttonRow = getPaginationButtons(page, totalPages);

    return interaction.update({
      content: `Page ${page + 1} of ${totalPages}:`,
      components: [menuRow, buttonRow],
    });
  }
});

function getCardOptions(cards, page = 0) {
  const start = page * 25;
  return cards.slice(start, start + 25).map((card, index) => ({
    label: `${card.name} (${card.set?.name ?? "Unknown Set"})`,
    description: `Reg: ${card.regulationMark ?? "?"} • Rarity: ${
      card.rarity ?? "Unknown"
    }`,
    value: (start + index).toString(),
  }));
}

function getPaginationButtons(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prev_page")
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("next_page")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

// Login
client.login(process.env.DISCORD_TOKEN);
