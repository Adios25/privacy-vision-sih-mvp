# Privvy (v1.3.5) — Privacy-Preserving Visual Web Agent MVP

> **An institutional-grade, privacy-first browser extension and autonomous agent platform that inspects, redacts, sanitizes, plans, and executes web actions locally without leaking raw PII or unmasked visual data to external servers or AI models.**

---

## 🌟 Executive Summary & Problem Statement

Modern Vision-Language Models (VLMs) and browser automation agents offer immense productivity improvements for completing forms, processing workflows, and navigating complex institutional portals. However, sending unredacted web pages or raw screenshots to third-party cloud APIs presents serious privacy risks:

- **Data Leaks:** Plaintext PII (Names, Passwords, Aadhaar, SSN/PAN, Passport, Phone, Email, Medical info) is directly sent over the network.
- **Visual Privacy Violations:** Sensitive visual artifacts (faces, physical signatures, identity cards) are exposed to remote vision models.
- **Accidental Overwrites & Hijacking:** Unconstrained agents can overwrite user-typed data, follow untrusted page instructions (prompt injection), or trigger destructive actions (payments, deletions, uncontrolled form submissions).

### The Privvy Solution

**Privvy** (v1.3.5) introduces an **in-browser privacy boundary** that runs between the user's browser tab and any AI reasoning backend (local or cloud):

1. **Local-First Detection & Masking:** Identifies text patterns, form semantics, and visual regions locally inside the browser.
2. **Zero Raw PII Egress:** Replaces sensitive values with typed tokens (`<USER_NAME>`, `<USER_EMAIL>`, `<USER_INPUT_1>`) and applies solid, opaque bounding-box masks to screenshots.
3. **Structured Payload & Outbound Leak Guard:** Verifies that no known raw terms exist in the structured JSON payload before any data leaves the extension.
4. **Dual Plan Architecture (v1.3.5):** Generates an offline deterministic local plan immediately upon scan, while offering an optional server/VLM plan. Users can independently inspect and choose **"Execute local plan"** or **"Execute server plan"**.
5. **Local Profile Resolution:** Real user data resides strictly in browser-local extension storage. Token resolution occurs strictly on-device inside the DOM.
6. **Human-in-the-Loop Safety:** Critical high-risk actions (such as submissions) require explicit, separate user approval with **Confirm** and **Decline** controls.

### Recent implementation updates

- Restored the production visual detector to the pretrained COCO `yolo11n.onnx` model. It runs through ONNX Runtime WebGPU with automatic WASM fallback and continues to detect faces locally.
- Kept identity-document protection OCR-first. A custom Aadhaar/PAN YOLO experiment was evaluated, then removed from the active product path because the small document dataset reduced reliability.
- Added multi-pass local OCR: native resolution plus enlarged grayscale/contrast processing. Duplicate OCR boxes are merged before redaction.
- Added bounded multi-frame scroll capture. Privvy samples long pages, runs OCR per viewport, and restores the user's original scroll position.
- Added Hindi OCR support with local `hin.traineddata.gz`, English + Hindi Tesseract recognition, Devanagari digit normalization, and Hindi name/address/DOB/Aadhaar/PAN label rules.
- Added a local Ollama WebSocket bridge at `ws://127.0.0.1:8788/agent/loop` for `qwen2.5vl:3b`. Only the approved sanitized image and DOM graph are sent.
- Added ordered Ollama action plans. The extension validates model-provided target IDs and maps `TYPE`, `CLICK`, and `COMPLETE` into the existing safe execution protocol.
- Added WebSocket CSP permission and a local VLM URL setting in the extension.
- Fixed data-URI screenshot decoding by allowing `data:` in the extension's `connect-src` policy.
- Added bridge smoke testing and rebuilt Chrome/Firefox distribution artifacts.

---

## 🏛️ System Architecture

Privvy is architected into three independently functioning, decoupled components:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BROWSER WORKSPACE                                    │
│                                                                                        │
│  ┌────────────────────────┐                   ┌─────────────────────────────────────┐  │
│  │   Active Web Tab       │                   │       Privvy Extension (v1.3.5)     │  │
│  │  (Synthetic Portal     │                   │                                     │  │
│  │   or Real Website)     │                   │  ┌───────────────────────────────┐  │  │
│  │                        │                   │  │ Background Service Worker     │  │  │
│  │  ┌──────────────────┐  │   activeTab /     │  │ - Ephemeral capture (60s TTL) │  │  │
│  │  │ Content Script   │◄─┼── messaging ──────┼─►│ - Memory-only storage         │  │  │
│  │  │ - DOM Walker     │  │                   │  └──────────────┬────────────────┘  │  │
│  │  │ - Regex Patterns │  │                   │                 │                   │  │
│  │  │ - Purpose Rules  │  │                   │  ┌──────────────▼────────────────┐  │  │
│  │  │ - Value Sentinel │  │                   │  │ Side Panel / Popup UI         │  │  │
│  │  │ - Local Executer │  │                   │  │ - Local YOLO + OCR Detectors  │  │  │
│  │  └──────────────────┘  │                   │  │ - Solid Redaction Canvas      │  │  │
│  └────────────────────────┘                   │  │ - Outbound Leak-Check Guard   │  │  │
│                                               │  │ - Local Deterministic Planner │  │  │
│                                               │  │ - Local Profile Vault         │  │  │
│                                               │  └──────────────┬────────────────┘  │  │
│                                               └─────────────────┼───────────────────┘  │
└─────────────────────────────────────────────────────────────────┼──────────────────────┘
                                                                  │ Sanitized Context Only
                                     HTTP POST /api/plan          │ (Redacted Image +
                                 (No Raw PII, Redacted Screenshot)│  Sanitized UI Graph)
                                                                  ▼
                                               ┌─────────────────────────────────────┐
                                               │        Privvy Planner Server        │
                                               │                                     │
                                               │  ┌───────────────────────────────┐  │
                                               │  │ Request Guard & Validation    │  │
                                               │  │ - Re-verifies leak check      │  │
                                               │  │ - Zero payload logging        │  │
                                               │  └──────────────┬────────────────┘  │
                                               │                 │                   │
                                               │  ┌──────────────▼────────────────┐  │
                                               │  │ Planning Backend Options:     │  │
                                               │  │ 1. Schema-Heuristic Fallback  │  │
                                               │  │ 2. Ollama Local VLM (Offline) │  │
                                               │  │ 3. OpenAI-Compatible API      │  │
                                               │  └──────────────┬────────────────┘  │
                                               │                 │                   │
                                               │  ┌──────────────▼────────────────┐  │
                                               │  │ Action Validator              │  │
                                               │  │ - Validates allowed targets   │  │
                                               │  │ - Flags high-risk clicks      │  │
                                               │  └───────────────────────────────┘  │
                                               └─────────────────────────────────────┘
```

---

## 🔑 Key Features & Privacy Invariants

### Security invariants

The normative privacy and safety behavior is defined in [UX-CONTRACT.md](UX-CONTRACT.md). The boundary map below summarizes the data allowed at each layer:

| Boundary | Allowed data | Never allowed |
|---|---|---|
| Content script | Local DOM structure, typed placeholders, detection metadata, ephemeral raw terms | Network transmission of raw values, raw OCR text, profile values, or placeholder mappings |
| Popup and extension storage | Sanitized graph, redacted image, plans, receipts, and user-managed profile values only at execution time | Raw detected terms, unredacted captures, or profile values in session snapshots |
| Server request | Sanitized graph, redacted image, category counts, metrics, state hash, and task | Raw page text, raw form values, raw OCR text, profile values, or placeholder mappings |
| Model request | Server-approved sanitized context only | Any raw value or unredacted image |
| Metrics and logs | Counts, timings, provider mode, status, and correlation metadata | Request bodies, secrets, raw values, or sensitive field contents |

Any outbound payload must pass the client leak check and server validation before planning. High-risk actions remain approval-gated even when the local or remote planner is unavailable.

| Feature | How Privvy Implements It | Privacy / Safety Guarantee |
|---|---|---|
| **Local Text & Pattern Detection** | Regex patterns (`EMAIL`, `PHONE`, `AADHAAR`, `PAN`, `PASSPORT`, `CARD`, `IP`) + DOM semantic traversal (`data-field-purpose`, `<label>`, `autocomplete`, `<dt>/<dd>`). | Raw terms are indexed locally into an ephemeral `Set` and never transmitted across the network. |
| **Visual Element & Face Classifier** | Local WebGPU ONNX Runtime Web inference (`VisualDetector` using YOLO11n) with automatic fallback to WebAssembly (WASM). | Detects facial regions and portraits directly on-device. Redaction masks original pixels completely. |
| **Solid Bounding-Box Redaction** | Bounding boxes are stamped with `#071A18` solid fills and tagged with token badges (`<FACE>`, `<EMAIL_1>`). | No translucent blur or reversible mosaic filtering. Zero raw image pixels leave the browser. |
| **Prefill Preservation (v1.3.5)** | Evaluated via portal presets (`One typed`, `Two typed`, `Many typed`). Assigns `<USER_INPUT_n>` placeholders to existing content. | Agent strictly preserves existing values and only fills empty target controls. |
| **Client-Side Outbound Leak Check** | Serializes the complete request JSON and performs substring search against all locally detected raw terms. | If a single raw term appears in the structured graph, network planning is immediately blocked (`status: 'blocked'`). |
| **Dual Plan Execution (v1.3.5)** | Separate action tracks for local deterministic baseline vs. remote VLM plans (`Execute local plan` / `Execute server plan`). | Users can compare plans side-by-side and choose which execution path to trigger. |
| **Local Profile Resolution** | User profiles are stored in `chrome.storage.local`. The server plan outputs token placeholders (e.g. `<USER_NAME>`). | Actual identity values (`Soumil Bhosle`, etc.) are resolved and injected locally by the extension runtime. |
| **Human-in-the-Loop Submissions** | Actions classified as `HIGH_RISK` (submit, complete, pay) are separated into a pending queue with **Confirm** and **Decline** actions. | Explicit user consent is mandatory prior to submitting synthetic forms. |
| **Safe Test Isolation** | High-risk automated submissions check `isSyntheticSafeTest()` and local origins (`127.0.0.1`, `localhost`, `0.0.0.0`). | Prevents unexpected form submissions on external, non-test websites. |

---

## 📂 Repository Structure

```
privacy-vision-sih-mvp/
├── README.md                      # Comprehensive documentation & setup guide (v1.3.5)
├── DESIGN.md                      # Design system tokens, color palettes & UX principles
├── UX-CONTRACT.md                 # Formal privacy invariants, form ownership & behaviors
├── .gitignore                     # Git exclusions for Python/macOS/editors
│
├── extension/                     # Extension source files (v1.3.5)
│   ├── manifest.json              # Chrome Manifest V3 (Side panel, activeTab, v1.3.5)
│   ├── manifest.firefox.json      # Firefox Manifest V3 (Toolbar action popup, v1.3.5)
│   ├── background.js              # Service worker (Ephemeral memory-only screenshot capture)
│   ├── content.js                 # Content script (DOM walker, pattern sanitizer, executor)
│   ├── popup.html                 # Extension side-panel / popup UI markup
│   ├── popup.css                  # Instrument-panel styling (Mint & deep-ink theme)
│   ├── popup.js                   # Client controller (WebGPU vision, dual planner, execution)
│   └── ocr.js                     # Local OCR PII extraction and bounding-box mapping
│
├── server/                        # Backend planner & test portal server
│   ├── server.py                  # Zero-dependency HTTP planner server
│   ├── vlm_bridge.py              # FastAPI WebSocket bridge for local Ollama/Qwen2.5-VL
│   ├── requirements-vlm.txt       # FastAPI, Uvicorn, and OpenAI-compatible client dependencies
│   ├── OLLAMA_CODEX_INSTRUCTIONS.md # Ollama bridge setup instructions
│   └── CONFIGURATION.md           # Limits, provider settings, and production guidance
│
├── test-website/                  # Standalone synthetic institutional test portal
│   ├── index.html                 # Accessible case dossier & multi-scenario form UI
│   ├── styles.css                 # Navy institutional styling
│   └── app.js                     # Dynamic scenario generator & preset test fixtures
│
├── scripts/                       # Setup and packaging utilities
│   ├── package_extensions.py      # Builds unpacked dist/ folders and distributable ZIPs
│   ├── setup_yolo_ort.py          # Packages ONNX Runtime and prepares YOLO weights
│   └── setup_ocr.py               # Packages Tesseract worker, cores, English, and Hindi data
│
├── tests/                         # Automated verification & test suite
│   └── run_tests.py               # Comprehensive unit & integration test runner
│
└── dist/                          # Packaged artifacts generated by package_extensions.py
    ├── chrome/                    # Unpacked Chrome extension folder (load in chrome://extensions)
    ├── firefox/                   # Unpacked Firefox extension folder (load in about:debugging)
    ├── privvy-chrome.zip          # Packaged Chrome ZIP archive
    └── privvy-firefox.zip         # Packaged Firefox ZIP archive
```

---

## 🚀 Quick Start Guide

### Prerequisites

- **Python 3.9+** (The server itself uses only the standard library).
- **Node.js 18+ with npm** (used by the one-time YOLO and OCR asset setup scripts).
- **Google Chrome** (v116+ recommended for native `sidePanel` support) or **Mozilla Firefox** (v121+).

---

### Step 1: Start the Local Portal & Planner Server

From the repository root, start the lightweight HTTP server:

```bash
python3 server/server.py
```

You should see:
```text
Privvy synthetic test website: http://127.0.0.1:8787
Planner provider: heuristic (schema-heuristic-v1)
Request bodies and raw page data are not logged.
```

Open your browser and visit: **[http://127.0.0.1:8787](http://127.0.0.1:8787)**.

---

### Step 2: Build & Package the Extensions

Ensure the distribution packages and unpacked folders are up-to-date:

```bash
python3 scripts/setup_yolo_ort.py
python3 scripts/setup_ocr.py
python3 scripts/package_extensions.py
```

This generates:
- `dist/chrome/` (Unpacked Chrome extension directory)
- `dist/firefox/` (Unpacked Firefox add-on directory)
- `dist/privvy-chrome.zip` & `dist/privvy-firefox.zip`

---

### Step 3: Install the Extension in Google Chrome

1. Open a new tab in Chrome and navigate to: `chrome://extensions`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left.
4. Select the **`dist/chrome`** directory inside this repository.
5. **Important:** Pin Privvy to your Chrome toolbar:
   - Click the puzzle piece icon (Extensions) in Chrome's top toolbar.
   - Click the pin icon next to **Privvy**.

> **Note on Permissions:** Privvy requests host permissions strictly for `127.0.0.1`, `localhost`, and `0.0.0.0`. It uses the `activeTab` permission when you click its toolbar icon to capture tab state safely into ephemeral memory (expires in 60s), eliminating the need for broad `<all_urls>` snooping.

---

### Step 4: Install the Extension in Mozilla Firefox (Alternative)

1. Open Firefox and navigate to: `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `dist/firefox/manifest.json`.
4. Privvy will appear in your Firefox toolbar.

---

## 🧪 Hands-On Demo & Walkthrough

Follow these steps to experience the complete end-to-end privacy workflow:

### 1. Open the Synthetic Portal
Navigate to **[http://127.0.0.1:8787](http://127.0.0.1:8787)**. Notice the four available scenarios in the top dropdown:
- **Internship Application** (`National Space Learning Portal`) — Contact and address form.
- **Aadhaar KYC Verification** (`CivicBank Verification Desk`) — Identity card and Aadhaar pattern.
- **Telehealth Consultation** (`CareBridge Telehealth`) — Patient profile with synthetic face photograph.
- **Research Visa Application** (`Voyager Research Visa Centre`) — Passport and signature artifacts.

### 2. Test Pre-Filled / User-Typed Fields (Prefill Preservation Test)
Click the **"One typed"**, **"Two typed"**, or **"Many typed"** preset buttons on the website, or type a custom value into one of the fields. Notice the field indicator highlights that a value is already present. Privvy will sanitize this value and guarantee it is never overwritten.

### 3. Open Privvy & Scan the Page
1. Click the **Privvy icon** in the Chrome toolbar. The Privvy persistent side panel opens.
2. Click **"Scan current page"**.
3. Observe what happens instantaneously in the extension:
   - **Detection Ledger:** Lists detected categories (e.g. `PERSON: 1`, `EMAIL: 1`, `PHONE: 1`, `ADDRESS: 1`, `USER_INPUT: 1`).
   - **Solid Redacted Preview:** Inspect the canvas preview. Every sensitive field and visual asset is masked with solid `#071A18` bounding boxes.
   - **Leak Check Status:** Displays `Passed` (green), certifying zero raw strings exist in the outbound payload.
   - **Telemetry Metrics:** Displays exact scan duration, WebGPU/Canvas vision engine timing, and JS Heap usage.

### 4. Inspect the Sanitized JSON Payload
Expand the **"Sanitized Payload (Ready for Server/Model)"** inspector in Privvy. Notice:
- Raw names and emails are completely replaced with `<USER_NAME>`, `<USER_EMAIL>`, etc.
- Any user-typed field is protected as `<USER_INPUT_1>`.
- The image data URL points only to the solid redacted screenshot.

### 5. Review the Generated Plans (Dual Planner)
- **Local Plan:** Immediately available after scan with zero network calls.
- **Server Plan (Optional):** Click **"Ask Server"** to send the sanitized JSON to the backend server. The server verifies the schema, queries the configured VLM (or heuristic), and returns validated actions in a separate server plan card.

### 6. Execute Safe Actions
Click **"Execute local plan"** or **"Execute server plan"**:
- Privvy inspects the live page state hash to prevent stale executions.
- Empty fields are populated using your local profile (e.g., `Soumil Bhosle`, `soumil.bhosle@example.test`).
- Pre-filled or user-typed fields are strictly **preserved and untouched**.
- The high-risk submit button is identified and placed in the **Pending Confirmation** queue.

### 7. Confirm or Decline Synthetic Submission
Review the highlighted confirmation card in Privvy:
- Click **"Confirm and execute submission"** to proceed, or click **"Decline submission"** to cancel safely.
- Upon confirmation, Privvy validates the submit button target and triggers the click.
- The portal renders a successful submission receipt with a unique transaction reference.

---

## 🤖 Configuring Vision-Language Models (VLMs)

Privvy supports three planner modes:

### Mode 1: Deterministic Heuristic (Default / Offline)
Runs out of the box with zero external dependencies or API keys.

```bash
python3 server/server.py
```

### Mode 2: Local Open-Weights VLM with Ollama
Run open multimodal vision models locally on your GPU (e.g., Qwen 2.5 VL, Llama 3.2 Vision):

1. Install and start [Ollama](https://ollama.com).
2. Pull your chosen vision model:
   ```bash
   ollama pull qwen2.5vl:3b
   ```
3. Start the Privvy server with the Ollama provider:
   ```bash
   PV_PROVIDER=ollama PV_MODEL=qwen2.5vl:3b python3 server/server.py
   ```
   *(Optionally specify `PV_OLLAMA_URL=http://127.0.0.1:11434` if Ollama is running on a non-default port)*.

### Mode 2b: Extension WebSocket VLM Bridge

The extension's **Plan with server** action uses the local FastAPI bridge for real-time Ollama planning:

```powershell
python -m pip install -r server/requirements-vlm.txt
python server/vlm_bridge.py
```

Defaults:

```text
Ollama:  http://127.0.0.1:11434/v1
Model:   qwen2.5vl:3b
Bridge:  ws://127.0.0.1:8788/agent/loop
```

Reload `dist/chrome` in `chrome://extensions`, scan a page, approve the redactions, enable sanitized server context, and choose **Plan with server**. The bridge returns an ordered action list; the extension rejects invented DOM target IDs before execution.

### Mode 3: Cloud / OpenAI-Compatible Multimodal API
Connect to any OpenAI-compatible multimodal endpoint (OpenAI GPT-4o, Groq, vLLM, LiteLLM, etc.):

```bash
PV_PROVIDER=openai-compatible \
PV_MODEL=gpt-4o-mini \
PV_API_KEY=your_api_key_here \
PV_OPENAI_BASE_URL=https://api.openai.com/v1 \
python3 server/server.py
```

> **Security Note:** The API key resides solely in server environment variables. It is **never** shared with or accessible by the browser extension or test website.

---

## 📊 Observability, Health & Auditing

The server provides built-in REST endpoints for telemetry and auditing:

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Returns server health, active model provider, and privacy status. |
| `/api/ready` | `GET` | Reports provider configuration readiness without calling the model. |
| `/api/plan` | `POST` | Receives sanitized graph & redacted screenshot; returns validated actions. |
| `/api/metrics` | `GET` | Aggregated non-PII performance metrics (average server time, model latency, request sizes). |

Server hardening is controlled through environment variables. Development mode defaults to loopback origins and extension origins; production mode requires an explicit `PV_ALLOWED_ORIGINS` list and `PV_AUTH_TOKEN` bearer token. `PV_MAX_BODY_BYTES`, `PV_MAX_IMAGE_BYTES`, `PV_MAX_IMAGE_WIDTH`, `PV_MAX_IMAGE_HEIGHT`, `PV_MAX_IMAGE_PIXELS`, `PV_MAX_CONCURRENT_REQUESTS`, `PV_RATE_LIMIT_COUNT`, `PV_RATE_LIMIT_WINDOW`, and `PV_REQUEST_TIMEOUT` bound resource use. Request bodies, API keys, and field values are never logged.

Example health check:
```bash
curl http://127.0.0.1:8787/api/health
```
```json
{
  "ok": true,
  "provider": "heuristic",
  "model": "schema-heuristic-v1",
  "modelConfigured": false,
  "privacy": "request bodies are not logged or persisted"
}
```

---

## 🧪 Testing & Verification

Privvy comes with a comprehensive automated test suite verifying:
- Schema validation, plan filtering, and placeholder constraints.
- Value preservation invariants (prefilled and user-typed fields).
- Immediate blocking of leaked payloads.
- Strict host permission boundaries and security policies.
- Version matching across manifests and scripts (`v1.3.5`).
- Syntax and script validity across all extension and portal files.
- CI runs JavaScript tests, packaging checks, Python tests, and the local heuristic server smoke test without external API keys.

Run the test suite:
```bash
python3 tests/run_tests.py
```

Expected output:
```text
All Privvy SIH tests passed.
```

---

## 📷 Local Visual Perception with YOLO

Privvy performs local visual perception inside the browser using **YOLO11n** running on **ONNX Runtime Web**. This replaces remote vision-based PII detection entirely.

### Key Details:
- **Model Used:** YOLO11-Nano (`yolo11n.onnx`, ~10.2 MB).
- **Backend Acceleration:** Attempts **WebGPU** for hardware acceleration, falling back automatically to **WebAssembly (WASM)**.
- **Preprocessing:** Resizes and letterboxes screenshots to `640x640` with standard grey padding, normalized pixels `[0, 1]`, and CHW Float32 layout.
- **Postprocessing & NMS:** Performs class filtering, runs custom Non-Maximum Suppression (NMS) to eliminate duplicate bounding boxes, and scales coordinates back to the original browser viewport.
- **Coordinate Contract:** YOLO screenshot-pixel boxes are clamped and converted to CSS viewport coordinates before they are merged with DOM and OCR detections, preventing DPR/browser-zoom double scaling.
- **Privacy Policy Integration:** Maps the YOLO `person` class directly to the `<FACE>` redaction category, stamping solid opaque `#071a18` badges to mask the visual area completely.
- **Pluggable Weights:** The pipeline is modularly designed so that custom weights (e.g., trained to detect ID cards or signatures) can be swapped in by replacing `yolo11n.onnx` and updating `PRIVACY_POLICY` class maps in `popup.js`.

---

## 🔤 Local OCR Redaction

Privvy runs Tesseract.js 7 entirely inside the extension after screenshot capture and before an outbound payload is created. The worker, matching WASM cores, and English language data are packaged locally, so OCR does not call a CDN.

- OCR words are grouped into lines so spaced phone, Aadhaar-like, and card values can be matched as one region.
- OCR runs in English + Hindi locally. A second enlarged grayscale/contrast pass improves small image text.
- Devanagari digits are normalized for Indian ID/date matching without storing the original OCR text.
- Email, phone, Aadhaar-like, PAN-like, passport, card-like, IP, date, Voter ID, GSTIN, driving licence, UPI, bank-account, and vehicle-registration patterns are detected.
- English and Hindi labelled name, address, date-of-birth, passport, Aadhaar, and PAN fields are detected from image text.
- OCR image coordinates are converted to CSS viewport coordinates before masks are merged with DOM and YOLO detections.
- Long pages are sampled through bounded scroll/multi-frame capture; the original scroll position is restored after scanning.
- Recognized raw terms remain ephemeral and are used only by the local leak guard; they are excluded from payload and session storage.
- OCR failure blocks payload creation rather than allowing an insufficiently inspected screenshot to leave the extension.

---

## 🛡️ Honest Limitations & Design Boundaries

- **Deterministic Pattern Scope:** Text detection uses rule-based heuristics, DOM accessibility semantics, and regular expressions rather than an in-browser heavy LLM NER model.
- **YOLO Pre-trained Weights:** Pre-trained YOLO11n (COCO dataset) only detects standard COCO classes (e.g., `person`) and does not natively identify signatures, passports, or ID cards. The extension is architected to allow custom weights for these specialized classes to be plugged in without refactoring.
- **Synthetic Portal Representation:** Standard weights will not detect CSS-drawn synthetic shapes representing face photos on the test portal. Test verification should use real photograph files containing people.
- **OCR Scope:** Hindi support covers printed Devanagari text and deterministic PII/label rules. Handwriting, low-resolution text, and other regional scripts require additional language data or specialized recognition models.
- **Controlled High-Risk Execution:** Full automated form submission is deliberately gated behind explicit user confirmation and restricted to authenticated local test origins (`127.0.0.1`, `localhost`, `0.0.0.0`).
- **Meaning of "Leak Check Passed":** The leak check confirms that no locally indexed raw terms appear in the outbound structured payload; it is an active security assertion rather than a claim of absolute mathematical impossibility of re-identification.

---

## 👥 Contributors & Acknowledgements

Developed for the **Smart India Hackathon (SIH)** prototype evaluation. Built with clean, standard-compliant JavaScript (ES2022) and Python 3.
