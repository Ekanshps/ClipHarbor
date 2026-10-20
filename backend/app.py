"""ClipHarbor API - Flask entry point."""
import os

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS

load_dotenv()

from services import downloader  # noqa: E402
from utils.cleanup import purge_old, remove_dir  # noqa: E402
from utils.validation import extract_video_id  # noqa: E402

TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/clipharbor")
TTL = int(os.getenv("FILE_TTL_SECONDS", "900"))

app = Flask(__name__)

allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": allowed_origins
        }
    },
    expose_headers=["Content-Disposition"]
)


def _video_id_or_error(url):
    vid = extract_video_id(url)
    if not vid:
        return None, (jsonify(error="Please paste a valid YouTube video link."), 400)
    return vid, None


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.post("/api/info")
def info():
    vid, err = _video_id_or_error((request.get_json(silent=True) or {}).get("url"))
    if err:
        return err
    try:
        data = downloader.fetch_info(vid)
        data["thumbnails"] = downloader.thumbnail_options(vid)
        return jsonify(data)
    except Exception as exc:  # yt-dlp raises many error types
        app.logger.warning("info failed: %s", exc)
        return jsonify(error="Could not read this video. It may be private, age-restricted or removed."), 422


@app.get("/api/download")
def download():
    vid, err = _video_id_or_error(request.args.get("url"))
    if err:
        return err
    kind = "audio" if request.args.get("type") == "audio" else "video"
    try:
        height = max(144, min(int(request.args.get("height", 720)), 4320))
    except ValueError:
        height = 720
    purge_old(TEMP_DIR, TTL)
    try:
        job_dir, path = downloader.download(vid, kind, height, TEMP_DIR)
    except Exception as exc:
        app.logger.warning("download failed: %s", exc)
        return jsonify(error="Download failed. Try another quality."), 422
    response = send_file(path, as_attachment=True, download_name=os.path.basename(path))
    response.call_on_close(lambda: remove_dir(job_dir))
    return response


@app.get("/api/thumbnail")
def thumbnail():
    """Proxy a thumbnail so the browser saves it as a file instead of opening it."""
    vid, err = _video_id_or_error(request.args.get("url"))
    if err:
        return err
    size = request.args.get("size", "maxresdefault")
    if size not in {k for k, _ in downloader.THUMB_SIZES}:
        size = "hqdefault"
    r = requests.get(f"https://i.ytimg.com/vi/{vid}/{size}.jpg", timeout=15)
    if r.status_code != 200:
        r = requests.get(f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg", timeout=15)
    return Response(r.content, mimetype="image/jpeg", headers={
        "Content-Disposition": f'attachment; filename="{vid}-{size}.jpg"'})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)), debug=False)
