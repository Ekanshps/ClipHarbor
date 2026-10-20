"""URL validation helpers."""
import re
from urllib.parse import urlparse, parse_qs

ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(url: str):
    """Return the 11-char YouTube video id or None if the URL is not a valid video link."""
    try:
        parsed = urlparse((url or "").strip())
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or parsed.netloc.lower() not in ALLOWED_HOSTS:
        return None
    host, parts = parsed.netloc.lower(), [p for p in parsed.path.split("/") if p]
    if host == "youtu.be":
        candidate = parts[0] if parts else ""
    elif parts and parts[0] in ("shorts", "embed", "live", "v"):
        candidate = parts[1] if len(parts) > 1 else ""
    else:
        candidate = (parse_qs(parsed.query).get("v") or [""])[0]
    return candidate if VIDEO_ID.match(candidate) else None


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"
