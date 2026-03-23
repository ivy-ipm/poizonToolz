import type { Express } from "express";
import { createServer, type Server } from "http";

const GRAB_API = "https://api.slin.dev/grab/v1";

function parseLevelLink(link: string): { id: string; ts: string } | null {
  link = link.trim();
  if (!link.includes("grabvr.quest")) return null;
  const m = link.match(/[?&]level=([^&\s]+)/);
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // GET /api/level-info?link=<url>
  app.get("/api/level-info", async (req, res) => {
    const link = req.query.link as string;
    if (!link) {
      return res.status(400).json({ message: "Missing link parameter" });
    }

    const parsed = parseLevelLink(link);
    if (!parsed) {
      return res.status(400).json({
        message:
          "Invalid GRAB link. Expected format: https://grabvr.quest/levels/viewer/?level=id:timestamp",
      });
    }

    const { id, ts } = parsed;

    try {
      const apiUrl = `${GRAB_API}/details/${id}/${ts}`;
      const apiRes = await fetch(apiUrl);

      if (!apiRes.ok) {
        return res.status(404).json({ message: "Level not found on GRAB API" });
      }

      const data = (await apiRes.json()) as Record<string, unknown>;

      let downloadUrl: string | null = null;
      const dataKey = data.data_key as string | undefined;

      if (dataKey) {
        downloadUrl = buildDownloadUrl(dataKey);
      }

      if (!downloadUrl) {
        downloadUrl = await probeVersions(id, ts);
      }

      const title = (data.title as string) || `${id}_${ts}`;
      const creators = (data.creators as string[]) || [];

      return res.json({
        id,
        ts,
        title,
        creators,
        dataKey: dataKey || null,
        downloadUrl,
        description: (data.description as string) || null,
        complexity: (data.complexity as number) || null,
        maxCheckpoint: (data.max_checkpoint_count as number) || null,
        verified: (data.verified as boolean) || false,
        averageRating: (data.average_rating as number) || null,
        ratingCount: (data.rating_count as number) || null,
      });
    } catch (err) {
      console.error("GRAB API error:", err);
      return res.status(502).json({ message: "Failed to contact GRAB API" });
    }
  });

  // GET /api/level-download?id=<id>&ts=<ts>&dataKey=<key>
  app.get("/api/level-download", async (req, res) => {
    const { id, ts, dataKey } = req.query as {
      id?: string;
      ts?: string;
      dataKey?: string;
    };

    if (!id || !ts) {
      return res.status(400).json({ message: "Missing id or ts parameters" });
    }

    let downloadUrl: string | null = null;

    if (dataKey) {
      downloadUrl = buildDownloadUrl(dataKey);
    }

    if (!downloadUrl) {
      downloadUrl = await probeVersions(id, ts);
    }

    if (!downloadUrl) {
      return res.status(404).json({ message: "Could not find downloadable level file" });
    }

    try {
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        return res.status(502).json({ message: "Download failed from GRAB API" });
      }

      const filename = `${id}_${ts}.level`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");

      const buffer = await fileRes.arrayBuffer();
      return res.send(Buffer.from(buffer));
    } catch (err) {
      console.error("Download error:", err);
      return res.status(502).json({ message: "Failed to download level file" });
    }
  });

  return httpServer;
}
