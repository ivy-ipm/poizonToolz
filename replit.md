# GRAB Level Downloader

A web-based tool for downloading GRAB VR game levels from grabvr.quest. Paste a level link, view level info, and download the `.level` file directly to your device.

## Tech Stack

- **Frontend:** React + TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend:** Express (Node.js/TypeScript)
- **State:** TanStack Query
- **Forms:** React Hook Form + Zod

## Architecture

- `client/src/pages/home.tsx` — Main downloader UI (link input, level info card, history)
- `client/src/components/theme-provider.tsx` — Dark/light theme toggle
- `server/routes.ts` — API proxy routes for GRAB API
- `shared/schema.ts` — Zod schemas for level info

## API Proxy Routes

- `GET /api/level-info?link=<url>` — Parses link, fetches from GRAB API, returns level info
- `GET /api/level-download?id=<id>&ts=<ts>&dataKey=<key>` — Proxies binary download from GRAB API

## External API

Uses the unofficial GRAB API at `https://api.slin.dev/grab/v1`
- `/details/{id}/{ts}` — Level metadata
- `/download/{id}/{ts}/{version}` — Binary level file

## Design

- Dark gaming theme by default (cyan/teal primary, deep dark backgrounds)
- Light mode available via theme toggle
- Session-based history (last 10 fetched levels)
