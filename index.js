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
const fs = require("fs");
const path = require("path");

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
| LOCAL VGC DATA
|--------------------------------------------------------------------------
*/

function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Failed to load ${filePath}`, err);
    return {};
  }
}

const VGC_MOVES = loadJson(path.join(__dirname, "data", "vgc-moves.json"));
const VGC_ITEMS = loadJson(path.join(__dirname, "data", "vgc-items.json"));

/*
|--------------------------------------------------------------------------
| FETCH CARDS
|--------------------------------------------------------------------------
*/

async function fetchCards(game, query) {
  const endpoint = API_ENDPOINTS[game] || API_ENDPOINTS.pokemon;

  const response = await axios.get(endpoint, {
    headers: {
      "X-Api-Key": process.env.SCRYDEX_API_KEY,
      "X-Team-ID": process.env.SCRYDEX_TEAM_ID,
    },
    params: {
      q: query,
      page_size: 250,
      casing: "camel",

      select:
        game === "riftbound"
          ? "id,name,images,rarity,type,domain,cardText"
          : "id,name,supertype,subtypes,rarity,regulation_mark,images,expansion,printed_number,number",
    },
  });

  console.log(`${game} status:`, response.status);

  return response.data?.data || [];
}

/*
|--------------------------------------------------------------------------
| POKEAPI FALLBACKS
|--------------------------------------------------------------------------
*/

async function fetchMoveFromPokeApi(name) {
  const slug = toPokeApiSlug(name);
  const response = await axios.get(`https://pokeapi.co/api/v2/move/${slug}`);
  const move = response.data;

  const englishEffect =
    move.effect_entries?.find((e) => e.language.name === "en") ||
    move.flavor_text_entries?.find((e) => e.language.name === "en");

  return {
    name: toTitleCase(move.name),
    type: toTitleCase(move.type?.name),
    category: toTitleCase(move.damage_class?.name),
    power: move.power,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    target: toTitleCase(move.target?.name),
    effect:
      englishEffect?.effect ||
      englishEffect?.flavor_text ||
      "No effect text found.",
    source: "PokéAPI fallback",
  };
}

async function fetchItemFromPokeApi(name) {
  const slug = toPokeApiSlug(name);
  const response = await axios.get(`https://pokeapi.co/api/v2/item/${slug}`);
  const item = response.data;

  const englishEffect =
    item.effect_entries?.find((e) => e.language.name === "en") ||
    item.flavor_text_entries?.find((e) => e.language.name === "en");

  return {
    name: toTitleCase(item.name),
    category: toTitleCase(item.category?.name),
    effect:
      englishEffect?.effect ||
      englishEffect?.flavor_text ||
      "No effect text found.",
    source: "PokéAPI fallback",
  };
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toPokeApiSlug(name) {
  return normalizeName(name)
    .replace(/'/g, "")
    .replace(/\s+/g, "-");
}

function toTitleCase(value) {
  if (!value) return "Unknown";

  return String(value)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findLocalEntry(data, name) {
  const key = normalizeName(name);

  if (data[key]) return data[key];

  if (Array.isArray(data)) {
    return data.find((entry) => normalizeName(entry.name) === key);
  }

  return Object.values(data).find(
    (entry) => normalizeName(entry?.name) === key
  );
}

function cleanValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function getBestImageUrl(images) {
  if (!images) return null;

  if (Array.isArray(images)) {
    const front = images.find((img) => img.type === "front") || images[0];

    return front?.large || front?.medium || front?.small || null;
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
| VGC LOOKUP HANDLERS
|--------------------------------------------------------------------------
*/

async function handleVgcMove(interaction, name) {
  let move = findLocalEntry(VGC_MOVES, name);
  let usedFallback = false;

  if (!move) {
    try {
      move = await fetchMoveFromPokeApi(name);
      usedFallback = true;
    } catch (err) {
      console.error(err);
      return interaction.editReply(`❌ No VGC move found for "${name}".`);
    }
  }

  const effect =
    move.effect ||
    move.description ||
    move.shortEffect ||
    move.flavorText ||
    "No effect text found.";

  const fields = [
    { name: "Type", value: cleanValue(move.type), inline: true },
    { name: "Category", value: cleanValue(move.category), inline: true },
    { name: "Power", value: cleanValue(move.power), inline: true },
    { name: "Accuracy", value: cleanValue(move.accuracy), inline: true },
    { name: "PP", value: cleanValue(move.pp), inline: true },
    { name: "Priority", value: cleanValue(move.priority ?? 0), inline: true },
  ];

  if (move.target) {
    fields.push({
      name: "Target",
      value: cleanValue(move.target),
      inline: true,
    });
  }

  if (move.vgcNotes) {
    fields.push({
      name: "VGC Notes",
      value: cleanValue(move.vgcNotes),
    });
  }

  if (usedFallback) {
    fields.push({
      name: "Source",
      value: "PokéAPI fallback",
    });
  }

  return interaction.editReply({
    embeds: [
      {
        title: move.name || toTitleCase(name),
        description: effect,
        fields,
      },
    ],
  });
}

async function handleVgcItem(interaction, name) {
  let item = findLocalEntry(VGC_ITEMS, name);
  let usedFallback = false;

  if (!item) {
    try {
      item = await fetchItemFromPokeApi(name);
      usedFallback = true;
    } catch (err) {
      console.error(err);
      return interaction.editReply(`❌ No VGC item found for "${name}".`);
    }
  }

  const effect =
    item.effect ||
    item.description ||
    item.shortEffect ||
    item.flavorText ||
    "No effect text found.";

  const fields = [];

  if (item.category) {
    fields.push({
      name: "Category",
      value: cleanValue(item.category),
      inline: true,
    });
  }

  if (item.activation) {
    fields.push({
      name: "Activation",
      value: cleanValue(item.activation),
    });
  }

  if (item.vgcNotes) {
    fields.push({
      name: "VGC Notes",
      value: cleanValue(item.vgcNotes),
    });
  }

  if (usedFallback) {
    fields.push({
      name: "Source",
      value: "PokéAPI fallback",
    });
  }

  return interaction.editReply({
    embeds: [
      {
        title: item.name || toTitleCase(name),
        description: effect,
        fields,
      },
    ],
  });
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

      const game = interaction.options.getString("game") || "pokemon";

      const format = interaction.options.getString("format") || "all";

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
            const minMark = process.env.STANDARD_REG_MARK_MIN || "H";

            cards = cards.filter(
              (c) =>
                c.regulationMark &&
                c.regulationMark.toUpperCase() >= minMark
            );
          } else if (format === "expanded") {
            cards = cards.filter((c) => !!c.regulationMark);
          }
        }

        if (!cards.length) {
          return interaction.editReply(
            `❌ No ${game} cards found for "${query}".`
          );
        }

        client.userCardCache = client.userCardCache || new Map();

        client.userCardCache.set(interaction.user.id, {
          cards,
          page: 0,
          game,
          format,
        });

        setTimeout(() => {
          client.userCardCache.delete(interaction.user.id);
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

        return interaction.editReply("⚠️ Error fetching cards.");
      }
    }

    /*
    ----------------------------------------------------------------------
    /VGC
    ----------------------------------------------------------------------
    */

    if (interaction.commandName === "vgc") {
      const type = interaction.options.getString("type");
      const name = interaction.options.getString("name");

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (type === "move") {
        return handleVgcMove(interaction, name);
      }

      if (type === "item") {
        return handleVgcItem(interaction, name);
      }

      return interaction.editReply("❌ Unknown VGC lookup type.");
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

**Card Lookup**
/card

Options:
• game
• format
• name

Games:
• Pokémon
• Riftbound

Formats:
• All Printings
• Pokémon Standard
• Pokémon Expanded
• Pokémon Unlimited

Examples:
• /card game:Pokémon format:All Printings name:Charizard
• /card game:Riftbound format:All Printings name:Jinx

**VGC Reference**
/vgc

Options:
• type
• name

Types:
• Move
• Item

Examples:
• /vgc type:Move name:Protect
• /vgc type:Item name:Focus Sash
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

    await interaction.deferUpdate();
    await interaction.deleteReply();

    client.userCardCache.delete(interaction.user.id);

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
        `${card.subtypes?.length ? ` – ${card.subtypes.join(", ")}` : ""}\n` +
        `Regulation: ${card.regulationMark ?? "?"}\n` +
        `Number: ${card.printedNumber ?? card.number ?? "?"}`,

      embeds: imageUrl
        ? [
            {
              image: {
                url: imageUrl,
              },
            }
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
    const cache = client.userCardCache?.get(interaction.user.id);

    if (!cache) {
      return interaction.reply({
        content: "Expired.",
        flags: MessageFlags.Ephemeral,
      });
    }

    let { page, cards, game } = cache;

    const totalPages = Math.ceil(cards.length / 25);

    if (interaction.customId === "next") page++;
    if (interaction.customId === "prev") page--;

    client.userCardCache.set(interaction.user.id, {
      ...cache,
      page,
    });

    return interaction.update({
      content: `🔍 Found cards • Page ${page + 1}/${totalPages}`,

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
        cards.slice(start, start + 25).map((card, i) => ({
          label: card.name.substring(0, 100),

          description:
            game === "riftbound"
              ? `${card.type ?? "Card"}`
              : `Reg: ${card.regulationMark ?? "?"}`,

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