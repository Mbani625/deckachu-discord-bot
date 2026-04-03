const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

require("dotenv").config();
const axios = require("axios");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`✅ Deckachu online as ${client.user.tag}`);
});

const SCRYDEX_BASE =
  process.env.SCRYDEX_BASE_URL ||
  "https://api.scrydex.com/pokemon/v1/en/cards";

async function fetchCards(query) {
  const response = await axios.get(SCRYDEX_BASE, {
    headers: {
      "X-Api-Key": process.env.SCRYDEX_API_KEY,
      "X-Team-ID": process.env.SCRYDEX_TEAM_ID,
    },
    params: {
      q: `name:"${query}"`,
      page_size: 25,
      select:
        "id,name,supertype,subtypes,rarity,regulation_mark,images,expansion,printed_number,number",
      casing: "camel",
    },
  });

  console.log("Scrydex status:", response.status);
  return response.data?.data || [];
}

function getBestImageUrl(images) {
  if (!images) return null;

  if (Array.isArray(images)) {
    const frontImage = images.find((img) => img.type === "front") || images[0];
    return frontImage?.large || frontImage?.medium || frontImage?.small || null;
  }

  return null;
}

function getExpansionName(card) {
  return card?.expansion?.name || "Unknown";
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "card") {
      const format = interaction.options.getString("format").toLowerCase();
      const query = interaction.options.getString("name");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        let cards = await fetchCards(query);

        if (format === "standard") {
          const minMark = process.env.STANDARD_REG_MARK_MIN || "G";
          cards = cards.filter(
            (c) =>
              c.regulationMark &&
              c.regulationMark.toUpperCase() >= minMark
          );
        }

        if (!cards.length) {
          return interaction.editReply(`❌ No cards found for "${query}".`);
        }

        cards = cards.slice(0, 250);

        client.userCardCache = client.userCardCache || new Map();
        client.userCardCache.set(interaction.user.id, {
          cards,
          page: 0,
        });

        setTimeout(() => {
          client.userCardCache.delete(interaction.user.id);
        }, 10 * 60 * 1000);

        const totalPages = Math.ceil(cards.length / 25);

        return interaction.editReply({
          content: `🔍 Found cards for "${query}" (${format}) — Page 1/${totalPages}`,
          components: [buildMenu(cards, 0), buildButtons(0, totalPages)],
        });
      } catch (err) {
        console.error("Scrydex fetch failed");
        console.error("Message:", err.message);
        console.error("Status:", err.response?.status);
        console.error("Data:", JSON.stringify(err.response?.data, null, 2));

        return interaction.editReply("⚠️ Error fetching cards.");
      }
    }

    if (interaction.commandName === "help") {
      return interaction.reply({
        content: `🧠 **Deckachu Help**

Use:
/card format:<standard|expanded> name:<card>

Example:
/card format:standard name:Charizard`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "card_select"
  ) {
    const cache = client.userCardCache?.get(interaction.user.id);
    const index = parseInt(interaction.values[0], 10);
    const card = cache?.cards?.[index];

    if (!card) {
      return interaction.reply({
        content: "❌ Card expired.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const imageUrl = getBestImageUrl(card.images);

    return interaction.reply({
      content: `**${card.name}**
Expansion: ${getExpansionName(card)}
Type: ${card.supertype ?? "Unknown"}${
        card.subtypes?.length ? ` – ${card.subtypes.join(", ")}` : ""
      }
Regulation: ${card.regulationMark ?? "?"}
Number: ${card.printedNumber ?? card.number ?? "?"}`,
      files: imageUrl
  ? [
      {
        attachment: imageUrl,
        name: "card.png",
      },
    ]
  : [],
    });
  }

  if (interaction.isButton()) {
    const cache = client.userCardCache?.get(interaction.user.id);

    if (!cache) {
      return interaction.reply({
        content: "Expired.",
        flags: MessageFlags.Ephemeral,
      });
    }

    let { page, cards } = cache;
    const totalPages = Math.ceil(cards.length / 25);

    if (interaction.customId === "next") page++;
    if (interaction.customId === "prev") page--;

    client.userCardCache.set(interaction.user.id, { cards, page });

    return interaction.update({
      content: `🔍 Found cards — Page ${page + 1}/${totalPages}`,
      components: [buildMenu(cards, page), buildButtons(page, totalPages)],
    });
  }
});

function buildMenu(cards, page) {
  const start = page * 25;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_select")
      .setPlaceholder("Choose a card")
      .addOptions(
        cards.slice(start, start + 25).map((c, i) => ({
          label: `${c.name} (${getExpansionName(c)})`,
          description: `Reg: ${c.regulationMark ?? "?"}`,
          value: (start + i).toString(),
        }))
      )
  );
}

function buildButtons(page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prev")
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total - 1)
  );
}

client.login(process.env.DISCORD_TOKEN);