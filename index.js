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

/*
|--------------------------------------------------------------------------
| API ENDPOINTS
|--------------------------------------------------------------------------
*/

const API_ENDPOINTS = {
  pokemon:
    process.env.POKEMON_API_URL ||
    "https://api.scrydex.com/pokemon/v1/en/cards",

  riftbound:
    process.env.RIFTBOUND_API_URL ||
    "https://api.scrydex.com/riftbound/v1/cards",
};

/*
|--------------------------------------------------------------------------
| FETCH CARDS
|--------------------------------------------------------------------------
*/

async function fetchCards(game, query) {
  const endpoint = API_ENDPOINTS[game] || API_ENDPOINTS.pokemon;

  const safeQuery = escapeScrydexQuery(query);

  const response = await axios.get(endpoint, {
    headers: {
      "X-Api-Key": process.env.SCRYDEX_API_KEY,
      "X-Team-ID": process.env.SCRYDEX_TEAM_ID,
    },
    params: {
      q: `name:"${safeQuery}"`,
      page_size: 250,
      casing: "camel",

      select:
        game === "riftbound"
          ? "id,name,type,domain,rarity,images,cardText"
          : "id,name,supertype,subtypes,rarity,regulation_mark,images,expansion,printed_number,number",
    },
  });

  console.log(`${game} status:`, response.status);

  return response.data?.data || [];
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getBestImageUrl(images) {
  if (!images) return null;

  if (Array.isArray(images)) {
    const front =
      images.find((img) => img.type === "front") || images[0];

    return (
      front?.large ||
      front?.medium ||
      front?.small ||
      null
    );
  }

  return null;
}

function getExpansionName(card) {
  return card?.expansion?.name || "Unknown";
}

function getFormatLabel(format) {
  switch (format) {
    case "standard":
      return "Standard";

    case "expanded":
      return "Expanded";

    case "unlimited":
      return "Unlimited";

    default:
      return "All Printings";
  }
}

/*
|--------------------------------------------------------------------------
| INTERACTIONS
|--------------------------------------------------------------------------
*/

client.on(Events.InteractionCreate, async (interaction) => {
  /*
  ------------------------------------------------------------------------
  SLASH COMMANDS
  ------------------------------------------------------------------------
  */

  if (interaction.isChatInputCommand()) {
    /*
    ----------------------------------------------------------------------
    /CARD
    ----------------------------------------------------------------------
    */

    if (interaction.commandName === "card") {
      const query = interaction.options.getString("name");

      const game =
        interaction.options.getString("game") || "pokemon";

      const format =
        interaction.options.getString("format") || "all";

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      try {
        let cards = await fetchCards(game, query);

        /*
        ------------------------------------------------------------------
        POKEMON FORMAT FILTERING
        ------------------------------------------------------------------
        */

        if (game === "pokemon") {
          if (format === "standard") {
            const minMark =
              process.env.STANDARD_REG_MARK_MIN || "H";

            cards = cards.filter(
              (c) =>
                c.regulationMark &&
                c.regulationMark.toUpperCase() >= minMark
            );
          } else if (format === "expanded") {
            cards = cards.filter(
              (c) => !!c.regulationMark
            );
          }
        }

        if (!cards.length) {
          return interaction.editReply(
            `❌ No ${game} cards found for "${query}".`
          );
        }

        client.userCardCache =
          client.userCardCache || new Map();

        client.userCardCache.set(interaction.user.id, {
          cards,
          page: 0,
          game,
          format,
        });

        setTimeout(() => {
          client.userCardCache.delete(
            interaction.user.id
          );
        }, 10 * 60 * 1000);

        const totalPages = Math.ceil(cards.length / 25);

        return interaction.editReply({
          content:
            `🔍 Found ${cards.length} ${game} cards for "${query}"` +
            ` (${getFormatLabel(format)})` +
            ` • Page 1/${totalPages}`,

          components: [
            buildMenu(cards, 0, game),
            buildButtons(0, totalPages),
          ],
        });
      } catch (err) {
        console.error(err);

        return interaction.editReply(
          "⚠️ Error fetching cards."
        );
      }
    }

    /*
    ----------------------------------------------------------------------
    /HELP
    ----------------------------------------------------------------------
    */

    if (interaction.commandName === "help") {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,

        content: `
🧠 **Deckachu Help**

/card

Options:
• name
• game
• format

Games:
• Pokémon
• Riftbound

Formats:
• All Printings
• Standard
• Expanded
• Unlimited

Examples:
• /card name:Charizard game:Pokemon
• /card name:Jinx game:Riftbound
`,
      });
    }

    return;
  }

  /*
  ------------------------------------------------------------------------
  CARD DROPDOWN
  ------------------------------------------------------------------------
  */

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "card_select"
  ) {
    const cache =
      client.userCardCache?.get(interaction.user.id);

    const index = parseInt(
      interaction.values[0],
      10
    );

    const card = cache?.cards?.[index];

    if (!card) {
      return interaction.reply({
        content: "❌ Card expired.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const imageUrl = getBestImageUrl(card.images);

    await interaction.deferUpdate();
    await interaction.deleteReply();

    client.userCardCache.delete(
      interaction.user.id
    );

    /*
    ----------------------------------------------------------------------
    RIFTBOUND DISPLAY
    ----------------------------------------------------------------------
    */

    if (cache.game === "riftbound") {
      return interaction.followUp({
        content:
          `**${card.name}**\n` +
          `Type: ${card.type ?? "Unknown"}\n` +
          `Domain: ${card.domain ?? "Unknown"}\n` +
          `Rarity: ${card.rarity ?? "Unknown"}\n\n` +
          `${card.cardText ?? ""}`,

        embeds: imageUrl
          ? [
              {
                image: {
                  url: imageUrl,
                },
              },
            ]
          : [],
      });
    }

    /*
    ----------------------------------------------------------------------
    POKEMON DISPLAY
    ----------------------------------------------------------------------
    */

    return interaction.followUp({
      content:
        `**${card.name}**\n` +
        `Expansion: ${getExpansionName(card)}\n` +
        `Type: ${card.supertype ?? "Unknown"}` +
        `${
          card.subtypes?.length
            ? ` – ${card.subtypes.join(", ")}`
            : ""
        }\n` +
        `Regulation: ${card.regulationMark ?? "?"}\n` +
        `Number: ${
          card.printedNumber ??
          card.number ??
          "?"
        }`,

      embeds: imageUrl
        ? [
            {
              image: {
                url: imageUrl,
              },
            },
          ]
        : [],
    });
  }

  /*
  ------------------------------------------------------------------------
  PAGINATION
  ------------------------------------------------------------------------
  */

  if (interaction.isButton()) {
    const cache =
      client.userCardCache?.get(interaction.user.id);

    if (!cache) {
      return interaction.reply({
        content: "Expired.",
        flags: MessageFlags.Ephemeral,
      });
    }

    let { page, cards, game } = cache;

    const totalPages = Math.ceil(
      cards.length / 25
    );

    if (interaction.customId === "next") page++;
    if (interaction.customId === "prev") page--;

    client.userCardCache.set(
      interaction.user.id,
      {
        ...cache,
        page,
      }
    );

    return interaction.update({
      content:
        `🔍 Found cards • Page ${page + 1}/${totalPages}`,

      components: [
        buildMenu(cards, page, game),
        buildButtons(page, totalPages),
      ],
    });
  }
});

/*
|--------------------------------------------------------------------------
| MENU BUILDERS
|--------------------------------------------------------------------------
*/

function buildMenu(cards, page, game) {
  const start = page * 25;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("card_select")
      .setPlaceholder("Choose a card")
      .addOptions(
        cards
          .slice(start, start + 25)
          .map((card, i) => ({
            label: card.name.substring(0, 100),

            description:
              game === "riftbound"
                ? `${card.type ?? "Card"}`
                : `Reg: ${
                    card.regulationMark ?? "?"
                  }`,

            value: (start + i).toString(),
          }))
      )
  );
}

function buildButtons(page, totalPages) {
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
      .setDisabled(page >= totalPages - 1)
  );
}

client.login(process.env.DISCORD_TOKEN);