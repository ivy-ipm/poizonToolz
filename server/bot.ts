import {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { log } from "./index";

const GRAB_API = "https://api.slin.dev/grab/v1";

function parseLevelLink(input: string): { id: string; ts: string } | null {
  input = input.trim();
  const m = input.match(/[?&]level=([^&\s]+)/);
  if (!m) return null;
  const raw = m[1];
  if (!raw.includes(":")) return null;
  const colonIdx = raw.indexOf(":");
  const id = raw.slice(0, colonIdx).trim();
  const ts = raw.slice(colonIdx + 1).trim();
  if (!id || !ts) return null;
  return { id, ts };
}

function buildDownloadUrl(dataKey: string): string | null {
  const parts = dataKey.split(":");
  if (parts.length === 4) {
    return `${GRAB_API}/download/${parts[1]}/${parts[2]}/${parts[3]}`;
  }
  return null;
}

async function probeVersions(id: string, ts: string): Promise<string | null> {
  for (let v = 1; v <= 15; v++) {
    const url = `${GRAB_API}/download/${id}/${ts}/${v}`;
    try {
      const resp = await fetch(url, { method: "HEAD" });
      if (resp.ok) return url;
    } catch {
      // continue
    }
  }
  return null;
}

async function fetchLevelInfo(id: string, ts: string) {
  const apiUrl = `${GRAB_API}/details/${id}/${ts}`;
  const apiRes = await fetch(apiUrl);
  if (!apiRes.ok) return null;
  const data = (await apiRes.json()) as Record<string, unknown>;

  const dataKey = data.data_key as string | undefined;
  let downloadUrl: string | null = null;
  if (dataKey) downloadUrl = buildDownloadUrl(dataKey);
  if (!downloadUrl) downloadUrl = await probeVersions(id, ts);

  return {
    id,
    ts,
    title: (data.title as string) || `${id}_${ts}`,
    creators: (data.creators as string[]) || [],
    description: (data.description as string) || null,
    complexity: (data.complexity as number) || null,
    maxCheckpoint: (data.max_checkpoint_count as number) || null,
    verified: (data.verified as boolean) || false,
    averageRating: (data.average_rating as number) || null,
    ratingCount: (data.rating_count as number) || null,
    dataKey: dataKey || null,
    downloadUrl,
  };
}

async function downloadLevel(downloadUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

type LevelInfo = NonNullable<Awaited<ReturnType<typeof fetchLevelInfo>>>;

function buildLevelEmbed(info: LevelInfo) {
  const embed = new EmbedBuilder()
    .setTitle(info.title)
    .setColor(0x00d4e8)
    .setURL(`https://grabvr.quest/levels/viewer/?level=${info.id}:${info.ts}`);

  const fields: { name: string; value: string; inline?: boolean }[] = [];

  if (info.creators.length > 0) {
    fields.push({ name: "Creator(s)", value: info.creators.join(", "), inline: true });
  }
  if (info.verified) {
    fields.push({ name: "Verified", value: "Yes", inline: true });
  }
  if (info.averageRating != null) {
    const stars = info.averageRating.toFixed(2);
    const count = info.ratingCount ? ` (${info.ratingCount} ratings)` : "";
    fields.push({ name: "Rating", value: `${stars}/5${count}`, inline: true });
  }
  if (info.complexity != null) {
    fields.push({ name: "Complexity", value: String(info.complexity), inline: true });
  }
  if (info.maxCheckpoint != null) {
    fields.push({ name: "Checkpoints", value: String(info.maxCheckpoint), inline: true });
  }
  if (info.description) {
    const desc =
      info.description.length > 200
        ? info.description.slice(0, 197) + "..."
        : info.description;
    fields.push({ name: "Description", value: desc });
  }

  if (fields.length > 0) embed.addFields(fields);
  embed.setFooter({ text: `ID: ${info.id} | TS: ${info.ts}` });

  return embed;
}

interface ListItem {
  identifier: string;
  title?: string;
  creators?: string[];
  complexity?: number;
  average_rating?: number;
  rating_count?: number;
  verified?: boolean;
}

async function fetchList(type: string): Promise<ListItem[]> {
  const url = `${GRAB_API}/list/level/${type}?max_format_version=6`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()) as ListItem[];
  } catch {
    return [];
  }
}

async function fetchSgmList(): Promise<ListItem[]> {
  try {
    const res = await fetch(`${GRAB_API}/list/sgm`);
    if (!res.ok) return [];
    const data = (await res.json()) as ListItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const LIST_TYPE_LABELS: Record<string, string> = {
  top_today: "Top Today",
  top_week: "Top This Week",
  top_month: "Top This Month",
  new: "Recently Published",
};

const commands = [
  new SlashCommandBuilder()
    .setName("grab")
    .setDescription("Download a .level file from GRAB VR")
    .addStringOption((opt) =>
      opt.setName("link").setDescription("The grabvr.quest level link").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("grabinfo")
    .setDescription("Show level info from GRAB VR without downloading")
    .addStringOption((opt) =>
      opt.setName("link").setDescription("The grabvr.quest level link").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("browse")
    .setDescription("Browse GRAB VR levels by category")
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Level list type")
        .setRequired(false)
        .addChoices(
          { name: "Top Today", value: "top_today" },
          { name: "Top This Week", value: "top_week" },
          { name: "Top This Month", value: "top_month" },
          { name: "Recently Published", value: "new" }
        )
    ),
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("Look up levels published by a GRAB VR player")
    .addStringOption((opt) =>
      opt.setName("username").setDescription("Exact in-game username").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("sgm")
    .setDescription("List available Shared Game Modules (SGMs) in GRAB VR"),
  new SlashCommandBuilder()
    .setName("grabhelp")
    .setDescription("Show all poizonTools GRAB VR commands"),
].map((cmd) => cmd.toJSON());

async function registerCommands(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    log("Slash commands registered globally.", "bot");
  } catch (err: any) {
    log(`Failed to register slash commands: ${err.message}`, "bot");
  }
}

async function handleLevelCommand(
  interaction: ChatInputCommandInteraction,
  isDownload: boolean
) {
  const link = interaction.options.getString("link", true);
  const parsed = parseLevelLink(link);
  if (!parsed) {
    await interaction.reply({
      content:
        "Invalid GRAB link. Expected format:\n`https://grabvr.quest/levels/viewer/?level=id:timestamp`",
      ephemeral: true,
    });
    return;
  }

  const { id, ts } = parsed;
  await interaction.deferReply();

  try {
    const info = await fetchLevelInfo(id, ts);
    if (!info) {
      await interaction.editReply("Level not found on GRAB API.");
      return;
    }

    const embed = buildLevelEmbed(info);

    if (!isDownload) {
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!info.downloadUrl) {
      await interaction.editReply({
        content: "Level info found, but no downloadable file could be located.",
        embeds: [embed],
      });
      return;
    }

    const buffer = await downloadLevel(info.downloadUrl);
    if (!buffer) {
      await interaction.editReply({
        content: "Failed to download the level file from GRAB API.",
        embeds: [embed],
      });
      return;
    }

    const filename = `${id}_${ts}.level`;
    const attachment = new AttachmentBuilder(buffer, { name: filename });
    await interaction.editReply({ embeds: [embed], files: [attachment] });
  } catch (err) {
    console.error("[bot] Error handling interaction:", err);
    await interaction.editReply("An error occurred while processing this level.");
  }
}

async function handleBrowse(interaction: ChatInputCommandInteraction) {
  const type = interaction.options.getString("type") || "top_today";
  await interaction.deferReply();

  const items = await fetchList(type);
  if (items.length === 0) {
    await interaction.editReply("No levels found or GRAB API is unavailable.");
    return;
  }

  const label = LIST_TYPE_LABELS[type] ?? type;
  const lines = items.slice(0, 10).map((item, i) => {
    const title = item.title || item.identifier;
    const creator = item.creators?.join(", ") || "Unknown";
    const rating = item.average_rating != null ? ` • ★ ${item.average_rating.toFixed(1)}` : "";
    return `**${i + 1}.** ${title}\n└ by ${creator}${rating}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`GRAB VR — ${label}`)
    .setColor(0x00d4e8)
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Showing top ${Math.min(items.length, 10)} of ${items.length} • poizonTools` });

  await interaction.editReply({ embeds: [embed] });
}

async function handlePlayer(interaction: ChatInputCommandInteraction) {
  const username = interaction.options.getString("username", true).trim();
  await interaction.deferReply();

  const nameLower = username.toLowerCase();
  const listTypes = ["new", "top_week", "top_month", "top_today"];
  const seen = new Set<string>();
  const found: ListItem[] = [];

  await Promise.allSettled(
    listTypes.map(async (type) => {
      let pageTimestamp: string | undefined;
      for (let page = 0; page < 3; page++) {
        let url = `${GRAB_API}/list/level/${type}?max_format_version=6`;
        if (pageTimestamp) url += `&page_timestamp=${encodeURIComponent(pageTimestamp)}`;
        try {
          const res = await fetch(url);
          if (!res.ok) break;
          const data = (await res.json()) as (ListItem & { page_timestamp?: string })[];
          if (!data.length) break;
          for (const item of data) {
            if (!seen.has(item.identifier)) {
              seen.add(item.identifier);
              const creatorsLower = (item.creators ?? []).map((c) => c.toLowerCase());
              if (creatorsLower.some((c) => c === nameLower)) {
                found.push(item);
              }
            }
          }
          pageTimestamp = data[data.length - 1]?.page_timestamp;
          if (!pageTimestamp) break;
        } catch {
          break;
        }
      }
    })
  );

  if (found.length === 0) {
    await interaction.editReply(
      `No levels found for **${username}**.\nThe player may not exist in GRAB VR, or they have no indexed levels.`
    );
    return;
  }

  found.sort((a, b) => {
    const ta = (a as any).creation_timestamp ?? 0;
    const tb = (b as any).creation_timestamp ?? 0;
    return ta - tb;
  });

  const lines = found.slice(0, 10).map((item, i) => {
    const title = item.title || item.identifier;
    const rating = item.average_rating != null ? ` • ★ ${item.average_rating.toFixed(1)}` : "";
    const link = `https://grabvr.quest/levels/viewer/?level=${item.identifier}`;
    return `**${i + 1}.** [${title}](${link})${rating}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`GRAB VR — ${username}'s Levels`)
    .setColor(0x00d4e8)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `${found.length} level${found.length !== 1 ? "s" : ""} found · sorted oldest first · poizonTools`,
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleSgm(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const items = await fetchSgmList();

  if (items.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle("GRAB VR — SGM Inspector")
      .setColor(0x8b5cf6)
      .setDescription(
        "No Shared Game Modules are currently indexed by the GRAB API.\n\nSGMs are shared components that can be embedded into levels. Check back as more content is published."
      )
      .setFooter({ text: "poizonTools" });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const lines = items.slice(0, 10).map((item, i) => {
    const title = item.title || item.identifier;
    const creator = item.creators?.join(", ") || "Unknown";
    return `**${i + 1}.** ${title}\n└ by ${creator}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("GRAB VR — SGM Inspector")
    .setColor(0x8b5cf6)
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `${items.length} SGM${items.length !== 1 ? "s" : ""} found · poizonTools` });

  await interaction.editReply({ embeds: [embed] });
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("poizonTools — GRAB VR Commands")
    .setColor(0x00d4e8)
    .addFields([
      {
        name: "/grab `link`",
        value: "Download a GRAB VR level as a .level file attachment.",
        inline: false,
      },
      {
        name: "/grabinfo `link`",
        value: "Show level info (creator, rating, complexity) without downloading.",
        inline: false,
      },
      {
        name: "/browse `[type]`",
        value: "Browse top/recent GRAB VR levels. Types: `top_today`, `top_week`, `top_month`, `new`.",
        inline: false,
      },
      {
        name: "/player `username`",
        value: "Look up all indexed levels by a GRAB VR player (exact username, sorted oldest first).",
        inline: false,
      },
      {
        name: "/sgm",
        value: "Inspect available Shared Game Modules (SGMs) in GRAB VR.",
        inline: false,
      },
      {
        name: "/grabhelp",
        value: "Show this help message.",
        inline: false,
      },
    ])
    .setFooter({ text: "poizonTools · Unofficial GRAB VR Tool" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export function startBot() {
  const token = process.env.TOKEN;
  if (!token) {
    log("TOKEN secret not set — Discord bot will not start.", "bot");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    log(`Logged in as ${c.user.tag}`, "bot");
    await registerCommands(token, c.user.id);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case "grab":
        await handleLevelCommand(interaction, true);
        break;
      case "grabinfo":
        await handleLevelCommand(interaction, false);
        break;
      case "browse":
        await handleBrowse(interaction);
        break;
      case "player":
        await handlePlayer(interaction);
        break;
      case "sgm":
        await handleSgm(interaction);
        break;
      case "grabhelp":
        await handleHelp(interaction);
        break;
    }
  });

  client.login(token).catch((err) => {
    log(`Failed to login to Discord: ${err.message}`, "bot");
  });
}
