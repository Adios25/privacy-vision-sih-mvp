#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "extension"
DIST = ROOT / "dist"
FILES = ["background.js", "content.js", "popup.html", "popup.css", "popup.js"]


def build(name: str, manifest: str) -> Path:
    target = DIST / name
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for path in SOURCE.iterdir():
        if path.is_file() and path.name not in ("manifest.json", "manifest.firefox.json"):
            shutil.copy2(path, target / path.name)
    manifest_data = json.loads((SOURCE / manifest).read_text(encoding="utf-8"))
    (target / "manifest.json").write_text(json.dumps(manifest_data, indent=2) + "\n", encoding="utf-8")
    legacy_archive = DIST / f"privacy-vision-sih-{name}.zip"
    if legacy_archive.exists():
        legacy_archive.unlink()
    archive = DIST / f"privvy-{name}.zip"
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(target.iterdir()):
            bundle.write(path, path.name)
    return archive


if __name__ == "__main__":
    DIST.mkdir(exist_ok=True)
    for browser, manifest in (("chrome", "manifest.json"), ("firefox", "manifest.firefox.json")):
        print(build(browser, manifest))
