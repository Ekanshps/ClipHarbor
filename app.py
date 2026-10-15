
import os
import re
import json
import shutil
import threading
import uuid
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, render_template, request, jsonify, send_file, abort
import yt_dlp

BASE_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

# FFmpeg executable folder
FFMPEG_DIR = (
    r"C:\Users\Lenovo\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg.Shared_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-9.0.2-full_build-shared\bin"
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
app.config["SECRET_KEY"] = os.environ.get(
    "SECRET_KEY", "change-this-in-production"
)

SITE_NAME = os.environ.get("SITE_NAME", "ClipHarbor")
SITE_URL = os.environ.get(
    "SITE_URL", "http://127.0.0.1:5000"
).rstrip("/")

JOBS = {}
JOBS_LOCK = threading.Lock()


def valid_youtube_url(url):
    try:
        parsed = urlparse(url.strip())
        host = (parsed.hostname or "").lower()

        return parsed.scheme in ("http", "https") and host in {
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtu.be",
            "www.youtu.be",
        }
    except Exception:
        return False


def safe_filename(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", value or "")
    value = re.sub(r"\s+", " ", value).strip(" .")
    return value[:160] or "youtube-media"


def site_prefix():
    return (
        re.sub(r"[^a-zA-Z0-9_-]+", "-", SITE_NAME.lower()).strip("-")
        or "site"
    )


@app.get("/")
def index():
    return render_template(
        "index.html",
        site_name=SITE_NAME,
        site_url=SITE_URL,
    )


@app.get("/about")
def about():
    return render_template(
        "about.html",
        site_name=SITE_NAME,
        site_url=SITE_URL,
    )


@app.get("/terms")
def terms():
    return render_template(
        "terms.html",
        site_name=SITE_NAME,
        site_url=SITE_URL,
    )


@app.get("/privacy")
def privacy():
    return render_template(
        "privacy.html",
        site_name=SITE_NAME,
        site_url=SITE_URL,
    )


@app.get("/robots.txt")
def robots():
    return app.response_class(
        f"User-agent: *\n"
        f"Allow: /\n"
        f"Disallow: /api/\n"
        f"Sitemap: {SITE_URL}/sitemap.xml\n",
        mimetype="text/plain",
    )


@app.get("/sitemap.xml")
def sitemap():
    pages = ["", "/about", "/terms", "/privacy"]

    body = '<?xml version="1.0" encoding="UTF-8"?>\n'
    body += (
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    )

    for page in pages:
        priority = "1.0" if not page else "0.5"
        body += (
            f"  <url><loc>{SITE_URL}{page}</loc>"
            f"<changefreq>monthly</changefreq>"
            f"<priority>{priority}</priority></url>\n"
        )

    body += "</urlset>"

    return app.response_class(body, mimetype="application/xml")


@app.post("/api/info")
def media_info():
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()

    if not valid_youtube_url(url):
        return jsonify(error="Enter a valid YouTube video URL."), 400

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "ffmpeg_location": FFMPEG_DIR,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = []
        seen = set()

        for fmt in info.get("formats", []):
            if not fmt.get("url"):
                continue

            height = fmt.get("height")
            ext = fmt.get("ext")

            if ext not in ("mp4", "webm", "m4a", "mp3"):
                continue

            if height and fmt.get("vcodec") != "none":
                label = (
                    f"{height}p MP4"
                    if ext == "mp4"
                    else f"{height}p {ext.upper()}"
                )

                key = (label, fmt.get("format_id"))

                if key not in seen:
                    formats.append({
                        "format_id": fmt.get("format_id"),
                        "label": label,
                        "height": height,
                        "ext": ext,
                    })
                    seen.add(key)

        formats.sort(
            key=lambda item: item.get("height") or 0,
            reverse=True,
        )

        return jsonify({
            "id": info.get("id"),
            "title": info.get("title") or "YouTube video",
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "uploader": info.get("uploader"),
            "formats": formats[:30],
            "audio_available": True,
        })

    except Exception as exc:
        return jsonify(
            error=(
                "Could not read this video. Check the URL and try again. "
                + str(exc)[:220]
            )
        ), 422


@app.post("/api/download")
def create_download():
    payload = request.get_json(silent=True) or {}

    url = (payload.get("url") or "").strip()
    kind = (payload.get("kind") or "mp4").lower()
    quality = (payload.get("quality") or "best").strip()

    if not valid_youtube_url(url):
        return jsonify(error="Enter a valid YouTube video URL."), 400

    if kind not in ("mp4", "mp3"):
        return jsonify(error="Choose MP4 video or MP3 audio."), 400

    job_id = uuid.uuid4().hex

    with JOBS_LOCK:
        JOBS[job_id] = {
            "status": "queued",
            "progress": 0,
            "error": None,
            "filename": None,
        }

    def run_job():
        try:
            with JOBS_LOCK:
                JOBS[job_id]["status"] = "processing"

            # Verify FFmpeg exists before downloading.
            ffmpeg_exe = Path(FFMPEG_DIR) / "ffmpeg.exe"

            if not ffmpeg_exe.is_file():
                raise FileNotFoundError(
                    f"FFmpeg was not found at: {ffmpeg_exe}"
                )

            prefix = f"downloaded-from-{site_prefix()}"

            outtmpl = str(
                DOWNLOAD_DIR
                / f"{prefix}-%(title).160B-%(id)s.%(ext)s"
            )

            # Shared options for both MP3 and MP4.
            common_opts = {
                "outtmpl": outtmpl,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "restrictfilenames": True,
                "ffmpeg_location": FFMPEG_DIR,
            }

            if kind == "mp3":
                opts = {
                    **common_opts,
                    "format": "bestaudio/best",
                    "postprocessors": [{
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }],
                }

            else:
                if quality == "best":
                    fmt = (
                        "bestvideo[ext=mp4]+bestaudio[ext=m4a]"
                        "/best[ext=mp4]/best"
                    )
                else:
                    match = re.fullmatch(r"(\d{3,4})", quality)

                    if not match:
                        raise ValueError("Invalid video quality.")

                    height = int(match.group(1))

                    fmt = (
                        f"bestvideo[height<={height}][ext=mp4]"
                        f"+bestaudio[ext=m4a]"
                        f"/best[height<={height}][ext=mp4]/best"
                    )

                opts = {
                    **common_opts,
                    "format": fmt,
                    "merge_output_format": "mp4",
                }

            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            candidates = sorted(
                DOWNLOAD_DIR.glob(f"{prefix}-*"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )

            if not candidates:
                raise RuntimeError(
                    "Download finished but no output file was found."
                )

            with JOBS_LOCK:
                JOBS[job_id].update(
                    status="done",
                    progress=100,
                    filename=candidates[0].name,
                )

        except Exception as exc:
            with JOBS_LOCK:
                JOBS[job_id].update(
                    status="error",
                    error=str(exc)[:500],
                )

    threading.Thread(target=run_job, daemon=True).start()

    return jsonify(job_id=job_id)


@app.get("/api/status/<job_id>")
def job_status(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)

        if not job:
            return jsonify(
                error="Job not found or server restarted."
            ), 404

        result = dict(job)

    if result["status"] == "done":
        result["download_url"] = f"/api/file/{job_id}"

    return jsonify(result)


@app.get("/api/file/<job_id>")
def download_file(job_id):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        filename = (
            job.get("filename")
            if job and job.get("status") == "done"
            else None
        )

    if not filename:
        abort(404)

    path = (DOWNLOAD_DIR / filename).resolve()

    if path.parent != DOWNLOAD_DIR.resolve() or not path.exists():
        abort(404)

    return send_file(
        path,
        as_attachment=True,
        download_name=path.name,
    )


@app.errorhandler(413)
def too_large(_):
    return jsonify(error="Request is too large."), 413


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
