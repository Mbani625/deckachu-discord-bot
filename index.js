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

const API_ENDPOINTS = {
  pokemon:
    process.env.POKEMON_API_URL ||
    "https://api.scrydex.com/pokemon/v1/en/cards",

  riftbound:
    process.env.RIFTBOUND_API_URL ||
    "https://api.scrydex.com/riftbound/v1/cards",

  pokemonVgc:
    process.env.POKEAPI_URL || "https://pokeapi.co/api/v2",
};

const STAT_LABELS = {
  hp: "HP",
  attack: "Atk",
  defense: "Def",
  "special-attack": "SpA",
  "special-defense": "SpD",
  speed: "Spe",
};

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
          ? "id,name,images,rarity,type,domain,card_text"
          : "id,name,supertype,subtypes,rarity,regulation_mark,images,expansion,printed_number,number",
    },
  });

  return response.data?.data || [];
}

function normalizePokemonName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\. /g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, "-");
}

function titleCase(value) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPokemonFormName(apiName) {
  return apiName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatList(items) {
  return items.length ? items.map(titleCase).join(", ") : "None";
}

function cleanEffectText(text) {
  return (text || "No description found.")
    .replace(/\n/g, " ")
    .replace(/\f/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPokemonForms(query) {
  const pokemonName = normalizePokemonName(query);

  const pokemonResponse = await axios.get(
    `${API_ENDPOINTS.pokemonVgc}/pokemon/${encodeURIComponent(pokemonName)}`
  );

  const speciesResponse = await axios.get(pokemonResponse.data.species.url);

  const forms = speciesResponse.data.varieties.map((variety) => ({
    name: formatPokemonFormName(variety.pokemon.name),
    apiName: variety.pokemon.name,
  }));

  const selectedName = pokemonResponse.data.name;

  forms.sort((a, b) => {
    if (a.apiName === selectedName) return -1;
    if (b.apiName === selectedName) return 1;
    return a.name.localeCompare(b.name);
  });

  return forms;
}

async function fetchPokemonVgc(query) {
  const pokemonName = normalizePokemonName(query);

  const pokemonResponse = await axios.get(
    `${API_ENDPOINTS.pokemonVgc}/pokemon/${encodeURIComponent(pokemonName)}`
  );

  const pokemon = pokemonResponse.data;

  const [typeResponses, abilityResponses] = await Promise.all([
    Promise.all(pokemon.types.map((slot) => axios.get(slot.type.url))),
    Promise.all(pokemon.abilities.map((slot) => axios.get(slot.ability.url))),
  ]);

  const typeNames = pokemon.types.map((slot) => slot.type.name);

  const stats = pokemon.stats.map((stat) => ({
    name: STAT_LABELS[stat.stat.name] || titleCase(stat.stat.name),
    value: stat.base_stat,
  }));

  const defensiveMultipliers = new Map();

  for (const typeResponse of typeResponses) {
    const relations = typeResponse.data.damage_relations;

    for (const entry of relations.double_damage_from) {
      defensiveMultipliers.set(
        entry.name,
        (defensiveMultipliers.get(entry.name) || 1) * 2
      );
    }

    for (const entry of relations.half_damage_from) {
      defensiveMultipliers.set(
        entry.name,
        (defensiveMultipliers.get(entry.name) || 1) * 0.5
      );
    }

    for (const entry of relations.no_damage_from) {
      defensiveMultipliers.set(entry.name, 0);
    }
  }

  const weaknesses = [];
  const resistances = [];
  const immunities = [];

  for (const [type, multiplier] of defensiveMultipliers.entries()) {
    if (multiplier === 0) {
      immunities.push(type);
    } else if (multiplier > 1) {
      weaknesses.push(multiplier === 4 ? `${type} (4x)` : type);
    } else if (multiplier < 1) {
      resistances.push(multiplier === 0.25 ? `${type} (¼x)` : type);
    }
  }

  const abilities = abilityResponses.map((abilityResponse, index) => {
    const ability = abilityResponse.data;
    const pokemonAbility = pokemon.abilities[index];
    const englishEntry = ability.effect_entries.find(
      (entry) => entry.language.name === "en"
    );

    return {
      name: titleCase(ability.name),
      hidden: pokemonAbility.is_hidden,
      description: cleanEffectText(
        englishEntry?.short_effect || englishEntry?.effect
      ),
    };
  });

  return {
    name: formatPokemonFormName(pokemon.name),
    types: typeNames,
    stats,
    weaknesses: weaknesses.sort(),
    resistances: resistances.sort(),
    immunities: immunities.sort(),
    abilities,
  };
}

function buildPokemonVgcResponse(data) {
  const statLine = data.stats
    .map((stat) => `**${stat.name}:** ${stat.value}`)
    .join(" | ");

  const abilityText = data.abilities
    .map(
      (ability) =>
        `**${ability.name}${ability.hidden ? " (Hidden)" : ""}:** ${ability.description}`
    )
    .join("\n");

  return {
    content:
      `⚔️ **${data.name} VGC Info**\n` +
      `Type: ${formatList(data.types)}\n\n` +
      `**Base Stats**\n${statLine}\n\n` +
      `**Weaknesses**\n${formatList(data.weaknesses)}\n\n` +
      `**Resistances**\n${formatList(data.resistances)}\n\n` +
      `**Immunities**\n${formatList(data.immunities)}\n\n` +
      `**Abilities**\n${abilityText}`,
  };
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

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "card") {
      const query = interaction.options.getString("name");
      const game = interaction.options.getString("game") || "pokemon";
      const format = interaction.options.getString("format") || "all";

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      try {
        if (game === "pokemon_vgc") {
          const forms = await fetchPokemonForms(query);

          client.userCardCache = client.userCardCache || new Map();

          client.userCardCache.set(interaction.user.id, {
            forms,
            game: "pokemon_vgc",
            isVgc: true,
          });

          setTimeout(() => {
            client.userCardCache?.delete(interaction.user.id);
          }, 10 * 60 * 1000);

          if (forms.length === 1) {
            const pokemonVgcData = await fetchPokemonVgc(forms[0].apiName);
            client.userCardCache.delete(interaction.user.id);
            return interaction.editReply(buildPokemonVgcResponse(pokemonVgcData));
          }

          return interaction.editReply({
            content: `⚔️ Found ${forms.length} form(s) for "${query}". Choose one:`,
            components: [buildVgcMenu(forms)],
          });
        }

        let cards = await fetchCards(game, query);

        if (game === "pokemon") {
          if (format === "standard") {
            const minMark = process.env.STANDARD_REG_MARK_MIN || "H";

            cards = cards.filter(
              (c) =>
                c.regulationMark && c.regulationMark.toUpperCase() >= minMark
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
          components: [buildMenu(cards, 0, game), buildButtons(0, totalPages)],
        });
      } catch (err) {
        console.error(err);

        if (game === "pokemon_vgc") {
          return interaction.editReply(
            `⚠️ Error fetching VGC info for "${query}". Try a simpler name like "Metagross", "Charizard", "Mawile", or "Garchomp".`
          );
        }

        return interaction.editReply("⚠️ Error fetching cards.");
      }
    }

    if (interaction.commandName === "help") {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: `
🧠 **Deckachu Help**

/card

Options:
• game
• name
• format, optional and only used for Pokémon TCG

Games:
• Pokémon
• Pokémon VGC
• Riftbound

Pokémon TCG Formats:
• All Printings
• Standard
• Expanded
• Unlimited

Examples:
• /card game:Pokemon name:Charizard format:Pokemon Standard
• /card game:Pokemon VGC name:Metagross
• /card game:Riftbound name:Jinx
`,
      });
    }

    return;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "vgc_select"
  ) {
    const cache = client.userCardCache?.get(interaction.user.id);

    if (!cache?.isVgc) {
      return interaction.reply({
        content: "Expired.",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const selected = cache.forms[parseInt(interaction.values[0], 10)];
      const pokemonVgcData = await fetchPokemonVgc(selected.apiName);

      client.userCardCache.delete(interaction.user.id);

      return interaction.update({
        content: buildPokemonVgcResponse(pokemonVgcData).content,
        components: [],
      });
    } catch (err) {
      console.error(err);

      return interaction.update({
        content: "⚠️ Error fetching that Pokémon form.",
        components: [],
      });
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "card_select") {
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

    if (cache.game === "riftbound") {
      return interaction.followUp({
        content:
          `**${card.name}**\n` +
          `Type: ${card.type ?? "Unknown"}\n` +
          `Domain: ${card.domain ?? "Unknown"}\n` +
          `Rarity: ${card.rarity ?? "Unknown"}\n\n` +
          `${card.cardText ?? ""}`,
        embeds: imageUrl ? [{ image: { url: imageUrl } }] : [],
      });
    }

    return interaction.followUp({
      content:
        `**${card.name}**\n` +
        `Expansion: ${getExpansionName(card)}\n` +
        `Type: ${card.supertype ?? "Unknown"}` +
        `${card.subtypes?.length ? ` – ${card.subtypes.join(", ")}` : ""}\n` +
        `Regulation: ${card.regulationMark ?? "?"}\n` +
        `Number: ${card.printedNumber ?? card.number ?? "?"}`,
      embeds: imageUrl ? [{ image: { url: imageUrl } }] : [],
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
      components: [buildMenu(cards, page, game), buildButtons(page, totalPages)],
    });
  }
});

function buildVgcMenu(forms) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("vgc_select")
      .setPlaceholder("Choose a Pokémon form")
      .addOptions(
        forms.slice(0, 25).map((form, index) => ({
          label: form.name.substring(0, 100),
          value: index.toString(),
        }))
      )
  );
}

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