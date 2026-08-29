#!/usr/bin/env python3
import os
import sys
import subprocess
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = ROOT / "extension"
SERVER_DIR = ROOT / "server"

def install_ort_via_npm():
    print("Installing onnxruntime-web via npm...")
    try:
        # Run npm install --no-save to install it locally without polluting the workspace configs
        subprocess.run([
            "npm", "install", "--no-save", "onnxruntime-web@1.20.0"
        ], check=True, shell=True, cwd=str(ROOT))
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
    copied_count = 0
    # Copy JS bundles and all WASM files
    for path in dist_dir.glob("*"):
        if path.is_file() and (path.suffix == ".js" or path.suffix == ".wasm" or path.suffix == ".mjs"):
            dest = EXTENSION_DIR / path.name
            shutil.copy2(path, dest)
            print(f"  Copied {path.name} to {dest}")
            copied_count += 1
    print(f"Copied {copied_count} files successfully.")

def export_yolo_model():
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
    model = YOLO("yolo11n.pt")
    
    print("Exporting model to ONNX...")
    # Export to ONNX format with 640x640 input size
    onnx_path_str = model.export(format="onnx", imgsz=640, simplify=True)
    onnx_path = Path(onnx_path_str)
    
    dest_model = EXTENSION_DIR / "yolo11n.onnx"
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
