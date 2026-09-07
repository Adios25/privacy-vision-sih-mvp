#!/usr/bin/env python3
import sys
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = ROOT / "extension"
ORT_VERSION = "1.20.0"
ORT_FILES = [
    "ort.all.min.js",
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm",
]


def remove_unused_ort_assets():
    """Remove files copied by older setup versions that packaged the whole dist folder."""
    required = set(ORT_FILES)
    for path in EXTENSION_DIR.glob("ort*"):
        if path.is_file() and path.name not in required:
            path.unlink()
            print(f"  Removed unused ONNX Runtime asset: {path.name}")

def install_ort_via_npm():
    print("Installing onnxruntime-web via npm...")
    npm = shutil.which("npm")
    if not npm:
        print("  Error: npm is required. Install Node.js and run this script again.", file=sys.stderr)
        sys.exit(1)
    try:
        subprocess.run([
            npm, "install", "--prefix", str(ROOT), "--no-save", "--no-package-lock",
            f"onnxruntime-web@{ORT_VERSION}"
        ], check=True, cwd=str(ROOT))
        print("  Successfully installed onnxruntime-web.")
    except Exception as e:
        print(f"  Error installing onnxruntime-web via npm: {e}", file=sys.stderr)
        sys.exit(1)

    dist_dir = ROOT / "node_modules" / "onnxruntime-web" / "dist"
    if not dist_dir.exists():
        print(f"  Error: node_modules/onnxruntime-web/dist not found at {dist_dir}!", file=sys.stderr)
        sys.exit(1)

    print("Copying onnxruntime-web files to extension folder...")
    EXTENSION_DIR.mkdir(parents=True, exist_ok=True)
    remove_unused_ort_assets()
    for filename in ORT_FILES:
        path = dist_dir / filename
        if not path.is_file():
            print(f"  Error: required ONNX Runtime asset is missing: {path}", file=sys.stderr)
            sys.exit(1)
        dest = EXTENSION_DIR / filename
        shutil.copy2(path, dest)
        print(f"  Copied {path.name} to {dest}")
    print(f"Copied {len(ORT_FILES)} files successfully.")

def export_yolo_model():
    dest_model = EXTENSION_DIR / "yolo11n.onnx"
    if dest_model.is_file() and dest_model.stat().st_size > 1_000_000:
        print(f"Using existing model: {dest_model}")
        return
    print("Checking if ultralytics is installed...")
    try:
        import ultralytics
        print(f"  ultralytics version {ultralytics.__version__} is already installed.")
    except ImportError:
        print("  ultralytics not found. Installing via pip...")
        try:
            # Install CPU-only PyTorch and Ultralytics to be lightweight and fast
            subprocess.run([
                sys.executable, "-m", "pip", "install", "ultralytics",
                "--extra-index-url", "https://download.pytorch.org/whl/cpu"
            ], check=True)
            print("  Successfully installed ultralytics.")
        except Exception as e:
            print(f"  Error installing ultralytics: {e}", file=sys.stderr)
            sys.exit(1)

    # Now import YOLO and run the export
    from ultralytics import YOLO
    
    print("Loading yolo11n.pt...")
    # This downloads yolo11n.pt automatically if it doesn't exist
    model = YOLO(str(ROOT / "yolo11n.pt"))
    
    print("Exporting model to ONNX...")
    # Export to ONNX format with 640x640 input size
    onnx_path_str = model.export(format="onnx", imgsz=640, simplify=True)
    onnx_path = Path(onnx_path_str)
    
    print(f"Copying exported model from {onnx_path} to {dest_model}...")
    if onnx_path.exists():
        shutil.copy2(onnx_path, dest_model)
        print("  Model copied successfully.")
    else:
        print(f"  Error: Exported model file {onnx_path} not found!", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    install_ort_via_npm()
    export_yolo_model()
    print("YOLO & ONNX Runtime Web setup complete!")
