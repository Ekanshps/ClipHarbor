"""yt-dlp + FFmpeg processing. All heavy lifting lives here, routes stay thin."""
import glob
import os
import tempfile

import yt_dlp

from utils.validation import canonical_url

COOKIES = os.getenv("YTDLP_COOKIES") or None
THUMB_SIZES = [("maxresdefault", "Max (1280x720)"), ("sddefault", "HD (640x480)"),
               ("hqdefault", "High (480x360)"), ("mqdefault", "Medium (320x180)")]


def _base_opts(**extra):
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "socket_timeout": 20}
    if COOKIES:
        opts["cookiefile"] = COOKIES
    opts.update(extra)
    return opts


def fetch_info(video_id: str) -> dict:
    """Return title, thumbnail and the list of downloadable qualities."""
    with yt_dlp.YoutubeDL(_base_opts()) as ydl:
        info = ydl.extract_info(canonical_url(video_id), download=False)

    heights = sorted({f["height"] for f in info.get("formats", [])
                      if f.get("vcodec") not in (None, "none") and f.get("height")}, reverse=True)
    qualities = [{"type": "video", "height": h, "label": f"{h}p MP4"} for h in heights]
    qualities.append({"type": "audio", "height": 0, "label": "MP3 audio"})
    return {
        "id": video_id,
        "title": info.get("title"),
        "channel": info.get("uploader"),
        "duration": info.get("duration"),
        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "qualities": qualities,
    }


def thumbnail_options(video_id: str) -> list:
    return [{"key": key, "label": label, "url": f"https://i.ytimg.com/vi/{video_id}/{key}.jpg"}
            for key, label in THUMB_SIZES]


def download(video_id: str, kind: str, height: int, base_dir: str):
    """Download to a fresh temp folder. Returns (job_dir, file_path)."""
    os.makedirs(base_dir, exist_ok=True)
    job_dir = tempfile.mkdtemp(dir=base_dir)
    out = os.path.join(job_dir, "%(title).80s.%(ext)s")
    if kind == "audio":
        opts = _base_opts(format="bestaudio/best", outtmpl=out, postprocessors=[
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}])
    else:
        fmt = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
        opts = _base_opts(format=fmt, outtmpl=out, merge_output_format="mp4",
                          concurrent_fragment_downloads=4)
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([canonical_url(video_id)])
    files = glob.glob(os.path.join(job_dir, "*"))
    if not files:
        raise RuntimeError("Download produced no file")
    return job_dir, files[0]
