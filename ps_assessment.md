# Privvy vs. SIH Problem Statement — Assessment

## Summary

The project is **very well-built** and hits the core requirements hard. The privacy-first architecture, multi-modal local detection pipeline, and sanitized server-side planning pipeline are solid. However, several features are either absent or underdeveloped that could significantly improve the score on judging day.

---

## Evaluation Metric Breakdown

### 1. Accuracy of Visual Context from Screen — 25%

**Status: ✅ Good, but limited**

| What's Done | Gap |
|---|---|
| Viewport-accurate DOM graph extraction via `content.js` | YOLO11n is COCO-trained, not tuned for UI elements (forms, text fields, documents) |
| Shadow DOM walking via `shadowWalker.js` | No scroll-based multi-frame capture (misses below-fold content) |
| Text block extraction (up to 100 blocks) | YOLO only detects COCO classes (person, faces) — cannot detect generic form fields visually |
| QR/barcode via ZXing | No vision-based text detection (e.g., detecting text printed in an image) that YOLO can't do |

> [!IMPORTANT]
> **Key Opportunity:** The YOLO model is currently COCO-only. Fine-tuning it or swapping it for a ViT/DETR model tuned on UI screenshots (like a model trained on Rico or Enrico datasets) would directly boost this metric.

---

### 2. Recall & Precision for Detection of Sensitive/PII Data — 20%

**Status: ✅ Strong, but India-specific coverage is shallow**

| What's Done | Gap |
|---|---|
| Regex patterns for Email, Phone, Aadhaar, PAN, Passport, CARD, IP, DOB | No Voter ID pattern |
| Luhn validation for cards | No GSTIN / CIN / DL (driving licence) detection |
| Verhoeff check for Aadhaar | No bank IFSC + account number pair detection |
| Tesseract OCR extracts PII from image content | OCR is single-pass; no multi-resolution retry on low-confidence results |
| Label-value pattern matching (e.g., "Name: John") | No Hindi/regional language PII detection (Devanagari script names, dates) |

> [!TIP]
> **Key Opportunity:** Adding patterns for Voter ID (`[A-Z]{3}\d{7}`), Driving Licence, GSTIN (`\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}`), and a basic VPA/UPI ID pattern would improve recall on Indian documents substantially.

---

### 3. Precision of Redaction — 20%

**Status: ✅ Good with the fix just applied, but a few gaps remain**

| What's Done | Gap |
|---|---|
| Bounding-box redaction drawn on canvas | No blurring option — only hard black box (less visually informative) |
| Interactive overlay for manual mask add/remove | No per-category confidence threshold control by the user |
| QR/barcode verification before masking | `<FACE>` label on redaction box is visible in the screenshot (leaks category) |
| Redaction merging to avoid double-boxes | Form inputs now fixed (your change today), but `<select>` value sanitization is still pattern-only |

> [!WARNING]
> The redaction canvas draws the `<FACE>` / `<EMAIL>` label text **on top of the black box**. This leaks the PII category into the sanitized image sent to the server. The label should only appear locally in the interactive overlay, not in the exported JPEG.

---

### 4. Client-Side Resource Utilization — 20%

**Status: ⚠️ Moderate — main risk is YOLO WASM memory**

| What's Done | Gap |
|---|---|
| ONNX Runtime WASM with `numThreads=1` (no SharedArrayBuffer needed) | YOLO model is 10.7 MB — takes significant memory and time on first load |
| Tesseract worker runs off-thread | No lazy loading — both models are initialized on first scan (not on startup) |
| Memory metric reported in UI | No WebGPU backend — WASM-only means no GPU acceleration on supported machines |
| Model caching (Tesseract `readOnly` cache mode) | Extension bundle is very large (tens of MB of WASM files) — slow to install |

> [!TIP]
> **Key Opportunity:** Adding WebGPU as the preferred ONNX backend (with WASM fallback) would be a strong talking point for judges and would directly improve inference latency and resource efficiency on modern hardware. The `ort.all.min.js` bundle already supports WebGPU — it just needs to be enabled.

---

### 5. Overall End-to-End Latency — 15%

**Status: ⚠️ Moderate — first scan is slow, subsequent scans are fast**

| What's Done | Gap |
|---|---|
| Parallel `Promise.all` for YOLO + OCR + QR | YOLO init is ~5-10s on first scan (model fetch + ONNX session create) |
| Tesseract warm-up is lazy (first-use init) | No pre-warm on extension startup (models cold-start on first click) |
| Metric grid shows timing breakdown | No streaming/progressive display of results as each model finishes |
| Local heuristic plan is instant | The server round-trip has no loading indicator granularity |

> [!TIP]
> **Key Opportunity:** Pre-initializing the ONNX session and Tesseract worker in the `background.js` service worker on extension install/startup would eliminate the cold-start penalty entirely. Results could then be displayed progressively as each model finishes.

---

## Features to Implement (Prioritized)

### 🔴 High Impact (directly affects scoring metrics)

1. **WebGPU backend for YOLO** — Try `executionProviders: ['webgpu', 'wasm']` in the ONNX session. Falls back gracefully. Metrics 4 & 5.

2. **Remove PII category labels from exported redacted image** — The `<FACE>`, `<EMAIL>` text drawn on the canvas should only be shown in the local overlay, not burned into the JPEG sent to the server. This is a precision issue (Metric 3).

3. **Model pre-warm on extension startup** — In `background.js`, send a message to pre-initialize the YOLO ONNX session when the extension loads, so first-scan latency is near-zero. Metric 5.

4. **Additional India-specific PII patterns** — Add Voter ID, GSTIN, Driving Licence, and UPI ID regex to both `content.js` and `ocr.js`. Metric 2.

### 🟡 Medium Impact (good for demo + judges)

5. **Confidence threshold slider in the UI** — Let users adjust the minimum confidence required to auto-redact, reducing false positives (like your checkbox issue). Metric 3.

6. **Blur-based redaction style** — Offer "blur" as an alternative to hard black-box redaction. Looks more professional and is less disruptive to the visual context. Metric 3.

7. **Progressive result display** — Show YOLO detections as soon as they arrive, without waiting for OCR to finish. Better perceived latency. Metric 5.

8. **Below-the-fold scan (scroll & capture)** — Automatically scroll and capture multi-frame screenshots for long pages, merging results. Metric 1.

### 🟢 Nice to Have (bonus differentiation)

9. **Hindi/regional script PII detection** — Tesseract can run Hindi OCR (`hin` language pack). Detecting names/dates in Devanagari script would be a unique capability.

10. **Privacy report export** — Generate a downloadable PDF or JSON summary of what was redacted, for demonstration to judges.

11. **Confidence score visualization** — Show confidence percentage per redaction box in the interactive overlay (already computed, just not displayed).
