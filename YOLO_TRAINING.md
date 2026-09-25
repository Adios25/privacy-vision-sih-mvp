# YOLO11n Fine-Tuning for Privvy Privacy Detection

## Goal

Fine-tune YOLO11n on a custom dataset to detect privacy-sensitive UI regions in web page screenshots. Export the trained model to ONNX for browser-side inference in the Privvy Chrome extension.

---

## 1. Setup Environment

```bash
# Create and activate a virtual environment
python -m venv yolo_env
# Windows:
yolo_env\Scripts\activate
# Linux/Mac:
source yolo_env/bin/activate

# Install dependencies
pip install ultralytics onnx onnxruntime
```

---

## 2. Dataset Structure

Create the dataset directory at `d:\privacy-vision-sih-mvp\training\`:

```
training/
├── dataset.yaml
├── images/
│   ├── train/       # ~80% of images (PNG/JPG screenshots)
│   └── val/         # ~20% of images
└── labels/
    ├── train/       # One .txt per image, YOLO format
    └── val/
```

### Label Format (YOLO)

Each `.txt` file has one line per bounding box:

```
<class_id> <x_center> <y_center> <width> <height>
```

All values are normalized to `[0, 1]` relative to image dimensions.

### dataset.yaml

Create `training/dataset.yaml`:

```yaml
path: d:/privacy-vision-sih-mvp/training
train: images/train
val: images/val

nc: 8
names:
  0: id_card
  1: face_photo
  2: signature
  3: qr_barcode
  4: payment_card
  5: doc_header
  6: biometric
  7: form_field
```

---

## 3. Gather Training Data

### Option A: Download from Roboflow (fastest)

1. Go to [universe.roboflow.com](https://universe.roboflow.com)
2. Search and download these datasets in **YOLOv8 format**:
   - `aadhaar card detection`
   - `pan card detection`
   - `qr code detection`
   - `credit card detection`
   - `face detection`
3. Remap class IDs to match `dataset.yaml` above
4. Place images and labels into `training/images/` and `training/labels/`

### Option B: Generate synthetic data from Privvy's test portal

```bash
# Install puppeteer
npm install puppeteer

# Run the scraper (create this script)
node training/scrape_screenshots.js
```

Create `training/scrape_screenshots.js`:

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CASES = ['telehealth', 'passport', 'banking', 'tax', 'education'];
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

(async () => {
  const dir = path.join(__dirname, 'images', 'train');
  fs.mkdirSync(dir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  let i = 0;

  for (const c of CASES) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.goto(`http://127.0.0.1:8787/?case=${c}`, {
        waitUntil: 'networkidle2',
        timeout: 10000,
      });
      await page.screenshot({
        path: path.join(dir, `synth_${i++}.png`),
        fullPage: true,
      });
      await page.close();
    }
  }

  await browser.close();
  console.log(`Captured ${i} screenshots`);
})();
```

After capturing, annotate using [CVAT](https://www.cvat.ai/) or [Roboflow](https://roboflow.com/) and export in YOLO format.

---

## 4. Train the Model

```python
from ultralytics import YOLO

# Load pretrained YOLO11n (transfer learning)
model = YOLO('yolo11n.pt')

# Train
results = model.train(
    data='d:/privacy-vision-sih-mvp/training/dataset.yaml',
    epochs=100,
    imgsz=640,
    batch=16,
    device=0,           # GPU index. Use 'cpu' if no CUDA GPU.
    lr0=0.01,
    augment=True,
    patience=20,        # Early stopping
    project='d:/privacy-vision-sih-mvp/training/runs',
    name='privvy_v1',
)
```

Or via CLI:

```bash
yolo detect train \
  data=d:/privacy-vision-sih-mvp/training/dataset.yaml \
  model=yolo11n.pt \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  device=0 \
  project=d:/privacy-vision-sih-mvp/training/runs \
  name=privvy_v1
```

Best weights will be at: `training/runs/privvy_v1/weights/best.pt`

---

## 5. Validate

```bash
yolo detect val \
  model=d:/privacy-vision-sih-mvp/training/runs/privvy_v1/weights/best.pt \
  data=d:/privacy-vision-sih-mvp/training/dataset.yaml
```

Target: mAP@50 > 0.80

---

## 6. Export to ONNX

```python
from ultralytics import YOLO

model = YOLO('d:/privacy-vision-sih-mvp/training/runs/privvy_v1/weights/best.pt')

# Export to ONNX (static input shape for browser WASM/WebGPU)
model.export(
    format='onnx',
    imgsz=640,
    simplify=True,
    dynamic=False,
    opset=17,
)
```

Output: `best.onnx` in the same `weights/` directory.

### Optional: Quantize to INT8 (smaller file)

```python
import onnxruntime.quantization as quant

quant.quantize_dynamic(
    model_input='training/runs/privvy_v1/weights/best.onnx',
    model_output='training/runs/privvy_v1/weights/best_int8.onnx',
    weight_type=quant.QuantType.QUInt8,
)
```

---

## 7. Deploy to Extension

```bash
# Copy the ONNX model into the extension directory
copy training\runs\privvy_v1\weights\best.onnx extension\yolo11n.onnx
```

Then update the class names in `extension/popup.js` inside the `detect()` method. Find the `YOLO_CLASSES` array (or the section that maps class indices to category names) and replace with:

```javascript
const YOLO_CLASSES = [
  'id_card', 'face_photo', 'signature', 'qr_barcode',
  'payment_card', 'doc_header', 'biometric', 'form_field'
];
```

Rebuild the extension:

```bash
node scripts/package_extensions.mjs
```

---

## Summary Checklist

- [ ] Environment set up with `ultralytics` and `onnxruntime`
- [ ] Dataset collected (minimum 500 images, ideally 1500+)
- [ ] Dataset annotated in YOLO format with 8 classes
- [ ] `dataset.yaml` created and paths verified
- [ ] Training completed, `best.pt` produced
- [ ] Validation mAP@50 > 0.80
- [ ] Exported to ONNX with static 640x640 input
- [ ] Copied `best.onnx` → `extension/yolo11n.onnx`
- [ ] Class names updated in `popup.js`
- [ ] Extension rebuilt and tested
