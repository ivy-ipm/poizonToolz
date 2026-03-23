import {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  EmbedBuilder,
  Message,
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

async function downloadLevel(
  downloadUrl: string
): Promise<Buffer | null> {
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

function buildEmbed(info: NonNullable<Awaited<ReturnType<typeof fetchLevelInfo>>>) {
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
    const desc = info.description.length > 200
      ? info.description.slice(0, 197) + "..."
      : info.description;
    fields.push({ name: "Description", value: desc });
  }

  embed.addFields(fields);
  embed.setFooter({ text: `ID: ${info.id} | TS: ${info.ts}` });

  return embed;
}

const HELP_TEXT = `**GRAB VR Level Downloader Bot**

**Commands:**
\`!grab <level_link>\` — Fetch level info and download the \`.level\` file
\`!grabinfo <level_link>\` — Show level info only (no download)
\`!grabhelp\` — Show this help message

**Example:**
\`!grab https://grabvr.quest/levels/viewer/?level=abc123:1234567890\``;

export function startBot() {
  const token = process.env.TOKEN;
  if (!token) {
    log("TOKEN secret not set — Discord bot will not start.", "bot");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    log(`Logged in as ${c.user.tag}`, "bot");
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    const content = message.content.trim();

    if (content === "!grabhelp") {
      await message.reply(HELP_TEXT);
      return;
    }

    if (content.startsWith("!grabinfo ") || content.startsWith("!grab ")) {
      const isDownload = content.startsWith("!grab ");
      const link = isDownload ? content.slice(6).trim() : content.slice(10).trim();

      const parsed = parseLevelLink(link);
      if (!parsed) {
        await message.reply(
          "Invalid GRAB link. Expected format:\n`https://grabvr.quest/levels/viewer/?level=id:timestamp`"
        );
        return;
      }

      const { id, ts } = parsed;

      const thinking = await message.reply("Fetching level info...");

      try {
        const info = await fetchLevelInfo(id, ts);
        if (!info) {
          await thinking.edit("Level not found on GRAB API.");
          return;
        }

        const embed = buildEmbed(info);

        if (!isDownload) {
          await thinking.edit({ content: "", embeds: [embed] });
          return;
        }

        if (!info.downloadUrl) {
          await thinking.edit({
            content: "Level info found, but no downloadable file could be located.",
            embeds: [embed],
          });
          return;
        }

        await thinking.edit("Downloading level file...");

        const buffer = await downloadLevel(info.downloadUrl);
        if (!buffer) {
          await thinking.edit({
            content: "Failed to download the level file from GRAB API.",
            embeds: [embed],
          });
          return;
        }

        const filename = `${id}_${ts}.level`;
        const attachment = new AttachmentBuilder(buffer, { name: filename });

        await thinking.edit({
          content: "",
          embeds: [embed],
          files: [attachment],
        });
      } catch (err) {
        console.error("[bot] Error handling command:", err);
        await thinking.edit("An error occurred while processing this level.");
      }

      return;
    }
  });

  client.login(token).catch((err) => {
    log(`Failed to login to Discord: ${err.message}`, "bot");
  });
}
