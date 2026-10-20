
"""ClipHarbor API - Flask entry point."""

import logging
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge

load_dotenv()

from services import downloader  # noqa: E402
from utils.cleanup import purge_old, remove_dir  # noqa: E402
from utils.validation import extract_video_id  # noqa: E402


# --------------------------------------------------
# Configuration
# --------------------------------------------------

DEFAULT_ORIGIN = "https://clipharbor.epsingh.in"

ALLOWED_ORIGINS = {
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGIN).split(",")
    if origin.strip()
}

TEMP_DIR = Path(os.getenv("TEMP_DIR", "/tmp/clipharbor"))
FILE_TTL_SECONDS = max(60, int(os.getenv("FILE_TTL_SECONDS", "900")))
MAX_REQUEST_BYTES = 16 * 1024

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES

TEMP_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------
# CORS configuration
# --------------------------------------------------

CORS_METHODS = "GET, POST, OPTIONS"
CORS_HEADERS = "Content-Type"
CORS_MAX_AGE = "600"


@app.after_request
def add_cors_headers(response):
    """Add CORS headers to API responses for approved frontend origins."""

    if not request.path.startswith("/api/"):
        return response

    origin = request.headers.get("Origin", "").strip().rstrip("/")

    # Do not grant cross-origin access to unapproved origins.
    if origin not in ALLOWED_ORIGINS:
        return response

    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = CORS_METHODS
    response.headers["Access-Control-Allow-Headers"] = CORS_HEADERS
    response.headers["Access-Control-Max-Age"] = CORS_MAX_AGE
    response.headers["Access-Control-Expose-Headers"] = "Content-Disposition"
    response.headers["Vary"] = "Origin"

    return response


# --------------------------------------------------
# Common helpers
# --------------------------------------------------

def api_error(message: str, status_code: int):
    """Return a consistent JSON error response."""
    return jsonify(error=message), status_code


def get_video_id(url):
    """Validate a submitted URL and extract its YouTube video ID."""

    if not isinstance(url, str) or not url.strip():
        return None, api_error("Please provide a YouTube video URL.", 400)

    try:
        video_id = extract_video_id(url.strip())
    except (TypeError, ValueError):
        video_id = None

    if not video_id:
        return None, api_error("Please paste a valid YouTube video link.", 400)

    return video_id, None


def cleanup_expired_files():
    """Remove expired temporary downloads where possible."""
    try:
        purge_old(str(TEMP_DIR), FILE_TTL_SECONDS)
    except Exception:
        app.logger.exception("Temporary-file cleanup failed")


# --------------------------------------------------
# Error handlers
# --------------------------------------------------

@app.errorhandler(RequestEntityTooLarge)
def handle_request_too_large(_error):
    return api_error("Request body is too large.", 413)


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return api_error("API endpoint not found.", 404)

    return jsonify(
        service="ClipHarbor API",
        status="ok",
        health="/api/health",
    ), 200


@app.errorhandler(500)
def handle_internal_error(error):
    app.logger.error(
        "Unhandled internal server error: %s",
        error,
        exc_info=True,
    )
    return api_error("An internal server error occurred.", 500)


# --------------------------------------------------
# Health check
# --------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify(status="ok"), 200


# --------------------------------------------------
# Video information
# --------------------------------------------------

@app.post("/api/info")
def info():
    """Return video metadata, quality options, and thumbnails."""

    if not request.is_json:
        return api_error("Content-Type must be application/json.", 415)

    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return api_error("Request body must be a valid JSON object.", 400)

    video_id, error = get_video_id(payload.get("url"))

    if error:
        return error

    try:
        data = downloader.fetch_info(video_id)

        if not isinstance(data, dict):
            app.logger.error("Unexpected video metadata format")
            return api_error("Unable to read video information.", 502)

        data["thumbnails"] = downloader.thumbnail_options(video_id)

        return jsonify(data), 200

    except Exception:
        app.logger.exception("Video information lookup failed")
        return api_error(
            "Could not read this video. It may be private, age-restricted, "
            "removed, or temporarily unavailable.",
            422,
        )


# --------------------------------------------------
# Video / audio download
# --------------------------------------------------

@app.get("/api/download")
def download():
    """Prepare a temporary media file and return it as an attachment."""

    video_id, error = get_video_id(request.args.get("url"))

    if error:
        return error

    kind = request.args.get("type", "video").lower()

    if kind not in {"video", "audio"}:
        return api_error("Invalid download type.", 400)

    try:
        height = int(request.args.get("height", "720"))
    except (TypeError, ValueError):
        return api_error("Video height must be a valid integer.", 400)

    height = max(144, min(height, 4320))

    cleanup_expired_files()
    job_dir = None

    try:
        job_dir, file_path = downloader.download(
            video_id,
            kind,
            height,
            str(TEMP_DIR),
        )

        job_path = Path(job_dir).resolve()
        file_path = Path(file_path).resolve()

        # Ensure the file is inside its assigned job directory.
        if not file_path.is_relative_to(job_path):
            raise ValueError("Download path is outside the job directory")

        if not file_path.is_file():
            raise FileNotFoundError("Downloaded file does not exist")

        response = send_file(
            file_path,
            as_attachment=True,
            download_name=file_path.name,
        )

        # Remove the job directory when the response is closed.
        response.call_on_close(
            lambda path=str(job_dir): remove_dir(path)
        )

        return response

    except Exception:
        app.logger.exception("Media download failed")

        if job_dir:
            try:
                remove_dir(str(job_dir))
            except Exception:
                app.logger.exception("Download cleanup failed")

        return api_error(
            "Download failed. Please try another quality or try again later.",
            422,
        )


# --------------------------------------------------
# Thumbnail download
# --------------------------------------------------

@app.get("/api/thumbnail")
def thumbnail():
    """Fetch a YouTube thumbnail and return it as an image attachment."""

    video_id, error = get_video_id(request.args.get("url"))

    if error:
        return error

    size = request.args.get("size", "maxresdefault")
    allowed_sizes = {key for key, _label in downloader.THUMB_SIZES}

    if size not in allowed_sizes:
        size = "hqdefault"

    fallback_size = "hqdefault"

    try:
        upstream = requests.get(
            f"https://i.ytimg.com/vi/{video_id}/{size}.jpg",
            timeout=(5, 15),
        )

        if upstream.status_code != 200 and size != fallback_size:
            upstream.close()
            size = fallback_size

            upstream = requests.get(
                f"https://i.ytimg.com/vi/{video_id}/{size}.jpg",
                timeout=(5, 15),
            )

        with upstream:
            if upstream.status_code != 200:
                return api_error("Thumbnail is unavailable.", 404)

            content_type = upstream.headers.get("Content-Type", "")

            if not content_type.lower().startswith("image/"):
                return api_error("The source returned an invalid image.", 502)

            image_data = upstream.content

        if not image_data:
            return api_error("Thumbnail image is empty.", 502)

        return Response(
            image_data,
            mimetype="image/jpeg",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="{video_id}-{size}.jpg"'
                ),
                "Cache-Control": "public, max-age=3600",
                "X-Content-Type-Options": "nosniff",
            },
        )

    except requests.RequestException:
        app.logger.exception("Thumbnail request failed")
        return api_error(
            "Could not fetch the thumbnail. Please try again later.",
            502,
        )


# --------------------------------------------------
# Local development
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        debug=False,
    )
