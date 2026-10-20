"""Temporary file cleanup."""
import os
import shutil
import time


def remove_dir(path: str) -> None:
    shutil.rmtree(path, ignore_errors=True)


def purge_old(base_dir: str, ttl_seconds: int) -> None:
    """Delete job folders older than ttl_seconds (safety net for crashed jobs)."""
    if not os.path.isdir(base_dir):
        return
    now = time.time()
    for name in os.listdir(base_dir):
        path = os.path.join(base_dir, name)
        if now - os.path.getmtime(path) > ttl_seconds:
            remove_dir(path)
