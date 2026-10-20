import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app  # noqa: E402
from utils.validation import extract_video_id  # noqa: E402


def test_extract_ids():
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://evil.com/watch?v=dQw4w9WgXcQ") is None
    assert extract_video_id("not a url") is None


def test_health_and_bad_url():
    client = app.test_client()
    assert client.get("/api/health").json["status"] == "ok"
    assert client.post("/api/info", json={"url": "nope"}).status_code == 400
