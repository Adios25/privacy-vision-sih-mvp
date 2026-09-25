#!/usr/bin/env python3
"""Install and package the browser-local Tesseract OCR runtime."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = ROOT / "extension"
NODE_MODULES = ROOT / "node_modules"
TESSERACT_VERSION = "7.0.0"
LANGUAGE_VERSION = "1.0.0"


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def install_dependencies() -> None:
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm is required. Install Node.js, then run this script again.")
    run(
        [
            npm,
            "install",
            "--prefix",
            str(ROOT),
            "--no-save",
            "--no-package-lock",
            f"tesseract.js@{TESSERACT_VERSION}",
        f"@tesseract.js-data/eng@{LANGUAGE_VERSION}",
        f"@tesseract.js-data/hin@{LANGUAGE_VERSION}",
        ]
    )


def copy_file(source: Path, destination_name: str | None = None) -> Path:
    if not source.is_file():
        raise FileNotFoundError(f"Required OCR asset is missing: {source}")
    destination = EXTENSION_DIR / (destination_name or source.name)
    shutil.copy2(source, destination)
    print(f"Copied {source.name} -> extension/{destination.name}")
    return destination


def package_assets() -> list[Path]:
    EXTENSION_DIR.mkdir(parents=True, exist_ok=True)
    tesseract_root = NODE_MODULES / "tesseract.js"
    core_root = NODE_MODULES / "tesseract.js-core"
    language_root = NODE_MODULES / "@tesseract.js-data" / "eng" / "4.0.0"
    hindi_language_root = NODE_MODULES / "@tesseract.js-data" / "hin" / "4.0.0"

    copied = [
        copy_file(tesseract_root / "dist" / "tesseract.min.js"),
        copy_file(tesseract_root / "dist" / "worker.min.js", "tesseract.worker.min.js"),
        copy_file(language_root / "eng.traineddata.gz"),
        copy_file(hindi_language_root / "hin.traineddata.gz"),
    ]
    core_assets = sorted(core_root.glob("tesseract-core*.js")) + sorted(core_root.glob("tesseract-core*.wasm"))
    if not core_assets:
        raise FileNotFoundError(f"No Tesseract core assets were found under {core_root}")
    copied.extend(copy_file(path) for path in core_assets)
    return copied


def validate_assets(paths: list[Path]) -> None:
    empty = [path for path in paths if path.stat().st_size == 0]
    if empty:
        raise RuntimeError(f"OCR assets were copied but empty: {', '.join(map(str, empty))}")
    required = {
        "tesseract.min.js",
        "tesseract.worker.min.js",
        "eng.traineddata.gz",
        "hin.traineddata.gz",
        "tesseract-core.wasm.js",
        "tesseract-core.wasm",
    }
    missing = sorted(name for name in required if not (EXTENSION_DIR / name).is_file())
    if missing:
        raise RuntimeError(f"OCR setup is incomplete; missing: {', '.join(missing)}")


def main() -> None:
    try:
        install_dependencies()
        copied = package_assets()
        validate_assets(copied)
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"OCR setup failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print(f"Local OCR setup complete ({len(copied)} packaged assets).")
    print("Next: python3 scripts/package_extensions.py")


if __name__ == "__main__":
    main()
