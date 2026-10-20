# ClipHarbor

Free YouTube video and thumbnail downloader. Mobile first, dark UI, no login, no limit, no watermark.
Live: https://clipharbor.epsingh.in

## Structure
- `frontend/` static site (HTML, CSS, JS). Deploy on Vercel.
- `backend/` Flask API using yt-dlp and FFmpeg. Deploy on Render.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/info` | Body `{url}`. Returns title, thumbnail, qualities, thumbnail sizes |
| GET | `/api/download?url=&type=video\|audio&height=` | Streams MP4 or MP3, then deletes the temp file |
| GET | `/api/thumbnail?url=&size=` | Downloads a thumbnail JPG |

## SEO and AEO
Per page title, description, canonical, Open Graph, `sitemap.xml`, `robots.txt`, FAQPage + HowTo + WebApplication + Article JSON-LD, and 4 guide articles targeting real search queries.

## Quick start
See `instructions.txt` for local run and hosting steps.

## Legal
Only download content you own or have permission to save.
