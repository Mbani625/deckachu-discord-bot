//this will be for loading
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events,
} = require("discord.js");
require("dotenv").config();
const axios = require("axios");

console.log("Loaded ENV TOKEN:", process.env.DISCORD_TOKEN?.slice(0, 10));

const cooldowns = new Map();
const COOLDOWN_TIME = 3000; // 3 seconds (in milliseconds)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!card") || message.author.bot) return;

  const args = message.content.slice(6).trim().split(" ");
  const format = args.shift()?.toLowerCase();
  const query = args.join(" ").replace(/[^\w\s\-’:!'.]/gi, "");

  if (!format || !query) {
    return message.reply("Usage: `!card <format> <card name>`");
  }

  try {
    const sanitizedQuery = query.replace(/[":]/g, "");

    const { data } = await axios.get(`https://api.pokemontcg.io/v2/cards`, {
      params: { q: `name:${sanitizedQuery}` },
      headers: { "X-Api-Key": "" }, // Optional if not using a key
    });

    const cards = data.data
      ?.filter((card) => {
        if (format === "standard") {
          return (
            card.regulationMark && card.regulationMark.toUpperCase() >= "G"
          );
        }
        return card.legalities?.[format] === "Legal";
      })
      .slice(0, 250);

    if (!cards.length)
      return message.reply(`No legal cards found for "${query}" in ${format}.`);

    const options = cards.map((card, index) => ({
      label: `${card.name} (${card.set?.name ?? "Unknown Set"})`,
      description: `Reg Mark: ${card.regulationMark ?? "?"} • Rarity: ${
        card.rarity ?? "Unknown"
      }`,

      value: index.toString(),
    }));

    const now = Date.now();
    const userId = message.author.id;

    if (cooldowns.has(userId)) {
      const expiration = cooldowns.get(userId);
      const remaining = expiration - now;

      if (remaining > 0) {
        return message.reply(
          `⏳ Please wait ${Math.ceil(
            remaining / 1000
          )} more second(s) before using this command again.`
        );
      }
    }

    // Set cooldown
    cooldowns.set(userId, now + COOLDOWN_TIME);

    // Optional: Auto-cleanup the Map entry later
    setTimeout(() => cooldowns.delete(userId), COOLDOWN_TIME);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("card_select")
      .setPlaceholder("Choose a card")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await message.reply({
      content: `Found multiple cards for "${query}" in ${format}. Select one below:`,
      components: [row],
    });

    // Store cards for selection context
    client.cachedCards = cards;
  } catch (err) {
    console.error(err);
    return message.reply("Error fetching card info.");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "card_select") return;

  const selectedIndex = parseInt(interaction.values[0], 10);
  const card = client.cachedCards?.[selectedIndex];
  if (!card)
    return interaction.reply({
      content: "Could not retrieve card data.",
      ephemeral: true,
    });

  await interaction.reply({
    content: `**${card.name}**\nSet: ${card.set.name}\nType: ${
      card.supertype
    } – ${card.subtypes?.join(", ") ?? "None"}\nRegulation Mark: ${
      card.regulationMark ?? "Unknown"
    } (Standard Legal ✅)
`,
    files: [card.images.large],
  });
});

client.login(process.env.DISCORD_TOKEN);
