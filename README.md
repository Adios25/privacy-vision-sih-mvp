# Privvy (v1.3.3) — Privacy-Preserving Visual Web Agent MVP

> **An institutional-grade, privacy-first browser extension and autonomous agent platform that inspects, redacts, sanitizes, plans, and executes web actions locally without leaking raw PII or unmasked visual data to external servers or AI models.**

---

## 🌟 Executive Summary & Problem Statement

Modern Vision-Language Models (VLMs) and browser automation agents offer immense productivity improvements for completing forms, processing workflows, and navigating complex institutional portals. However, sending unredacted web pages or raw screenshots to third-party cloud APIs presents serious privacy risks:

- **Data Leaks:** Plaintext PII (Names, Passwords, Aadhaar, SSN/PAN, Passport, Phone, Email, Medical info) is directly sent over the network.
- **Visual Privacy Violations:** Sensitive visual artifacts (faces, physical signatures, identity cards) are exposed to remote vision models.
- **Accidental Overwrites & Hijacking:** Unconstrained agents can overwrite user-typed data, follow untrusted page instructions (prompt injection), or trigger destructive actions (payments, deletions, uncontrolled form submissions).

### The Privvy Solution

**Privvy** (v1.3.3) introduces an **in-browser privacy boundary** that runs between the user's browser tab and any AI reasoning backend (local or cloud):

1. **Local-First Detection & Masking:** Identifies text patterns, form semantics, and visual regions locally inside the browser.
2. **Zero Raw PII Egress:** Replaces sensitive values with typed tokens (`<USER_NAME>`, `<USER_EMAIL>`, `<USER_INPUT_1>`) and applies solid, opaque bounding-box masks to screenshots.
3. **Structured Payload & Outbound Leak Guard:** Verifies that no known raw terms exist in the structured JSON payload before any data leaves the extension.
4. **Dual Plan Architecture (v1.3.3):** Generates an offline deterministic local plan immediately upon scan, while offering an optional server/VLM plan. Users can independently inspect and choose **"Execute local plan"** or **"Execute server plan"**.
5. **Local Profile Resolution:** Real user data resides strictly in browser-local extension storage. Token resolution occurs strictly on-device inside the DOM.
6. **Human-in-the-Loop Safety:** Critical high-risk actions (such as submissions) require explicit, separate user approval with **Confirm** and **Decline** controls.

---

## 🏛️ System Architecture

Privvy is architected into three independently functioning, decoupled components:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   BROWSER WORKSPACE                                    │
│                                                                                        │
│  ┌────────────────────────┐                   ┌─────────────────────────────────────┐  │
│  │   Active Web Tab       │                   │       Privvy Extension (v1.3.3)     │  │
│  │  (Synthetic Portal     │                   │                                     │  │
│  │   or Real Website)     │                   │  ┌───────────────────────────────┐  │  │
│  │                        │                   │  │ Background Service Worker     │  │  │
│  │  ┌──────────────────┐  │   activeTab /     │  │ - Ephemeral capture (60s TTL) │  │  │
│  │  │ Content Script   │◄─┼── messaging ──────┼─►│ - Memory-only storage         │  │  │
│  │  │ - DOM Walker     │  │                   │  └──────────────┬────────────────┘  │  │
│  │  │ - Regex Patterns │  │                   │                 │                   │  │
│  │  │ - Purpose Rules  │  │                   │  ┌──────────────▼────────────────┐  │  │
│  │  │ - Value Sentinel │  │                   │  │ Side Panel / Popup UI         │  │  │
│  │  │ - Local Executer │  │                   │  │ - WebGPU/Canvas Skin Detector │  │  │
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

| Feature | How Privvy Implements It | Privacy / Safety Guarantee |
|---|---|---|
| **Local Text & Pattern Detection** | Regex patterns (`EMAIL`, `PHONE`, `AADHAAR`, `PAN`, `PASSPORT`, `CARD`, `IP`) + DOM semantic traversal (`data-field-purpose`, `<label>`, `autocomplete`, `<dt>/<dd>`). | Raw terms are indexed locally into an ephemeral `Set` and never transmitted across the network. |
| **Visual Element & Face Classifier** | Local WebGPU ONNX Runtime Web inference (`VisualDetector` using YOLO11n) with automatic fallback to WebAssembly (WASM). | Detects facial regions and portraits directly on-device. Redaction masks original pixels completely. |
| **Solid Bounding-Box Redaction** | Bounding boxes are stamped with `#071A18` solid fills and tagged with token badges (`<FACE>`, `<EMAIL_1>`). | No translucent blur or reversible mosaic filtering. Zero raw image pixels leave the browser. |
| **Prefill Preservation (v1.3.3)** | Evaluated via portal presets (`One typed`, `Two typed`, `Many typed`). Assigns `<USER_INPUT_n>` placeholders to existing content. | Agent strictly preserves existing values and only fills empty target controls. |
| **Client-Side Outbound Leak Check** | Serializes the complete request JSON and performs substring search against all locally detected raw terms. | If a single raw term appears in the structured graph, network planning is immediately blocked (`status: 'blocked'`). |
| **Dual Plan Execution (v1.3.3)** | Separate action tracks for local deterministic baseline vs. remote VLM plans (`Execute local plan` / `Execute server plan`). | Users can compare plans side-by-side and choose which execution path to trigger. |
| **Local Profile Resolution** | User profiles are stored in `chrome.storage.local`. The server plan outputs token placeholders (e.g. `<USER_NAME>`). | Actual identity values (`Soumil Bhosle`, etc.) are resolved and injected locally by the extension runtime. |
| **Human-in-the-Loop Submissions** | Actions classified as `HIGH_RISK` (submit, complete, pay) are separated into a pending queue with **Confirm** and **Decline** actions. | Explicit user consent is mandatory prior to submitting synthetic forms. |
| **Safe Test Isolation** | High-risk automated submissions check `isSyntheticSafeTest()` and local origins (`127.0.0.1`, `localhost`, `0.0.0.0`). | Prevents unexpected form submissions on external, non-test websites. |

---

## 📂 Repository Structure

```
privacy-vision-sih-mvp/
├── README.md                      # Comprehensive documentation & setup guide (v1.3.3)
├── DESIGN.md                      # Design system tokens, color palettes & UX principles
├── UX-CONTRACT.md                 # Formal privacy invariants, form ownership & behaviors
├── .gitignore                     # Git exclusions for Python/macOS/editors
│
├── extension/                     # Extension source files (v1.3.3)
│   ├── manifest.json              # Chrome Manifest V3 (Side panel, activeTab, v1.3.3)
│   ├── manifest.firefox.json      # Firefox Manifest V3 (Toolbar action popup, v1.3.3)
│   ├── background.js              # Service worker (Ephemeral memory-only screenshot capture)
│   ├── content.js                 # Content script (DOM walker, pattern sanitizer, executor)
│   ├── popup.html                 # Extension side-panel / popup UI markup
│   ├── popup.css                  # Instrument-panel styling (Mint & deep-ink theme)
│   └── popup.js                   # Client controller (WebGPU vision, dual planner, execution)
│
├── server/                        # Backend planner & test portal server
│   └── server.py                  # Zero-dependency Python server (HTTP, Ollama/OpenAI VLM, metrics)
│
├── test-website/                  # Standalone synthetic institutional test portal
│   ├── index.html                 # Accessible case dossier & multi-scenario form UI
│   ├── styles.css                 # Navy institutional styling
│   └── app.js                     # Dynamic scenario generator & preset test fixtures
│
├── scripts/                       # Build & packaging utilities
│   └── package_extensions.py      # Builds unpacked dist/ folders and distributable ZIPs
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

- **Python 3.9+** (No external `pip` packages required; uses standard library).
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
| `/api/plan` | `POST` | Receives sanitized graph & redacted screenshot; returns validated actions. |
| `/api/metrics` | `GET` | Aggregated non-PII performance metrics (average server time, model latency, request sizes). |

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
- Version matching across manifests and scripts (`v1.3.3`).
- Syntax and script validity across all extension and portal files.

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
- **Privacy Policy Integration:** Maps the YOLO `person` class directly to the `<FACE>` redaction category, stamping solid opaque `#071a18` badges to mask the visual area completely.
- **Pluggable Weights:** The pipeline is modularly designed so that custom weights (e.g., trained to detect ID cards or signatures) can be swapped in by replacing `yolo11n.onnx` and updating `PRIVACY_POLICY` class maps in `popup.js`.

---

## 🛡️ Honest Limitations & Design Boundaries

- **Deterministic Pattern Scope:** Text detection uses rule-based heuristics, DOM accessibility semantics, and regular expressions rather than an in-browser heavy LLM NER model.
- **YOLO Pre-trained Weights:** Pre-trained YOLO11n (COCO dataset) only detects standard COCO classes (e.g., `person`) and does not natively identify signatures, passports, or ID cards. The extension is architected to allow custom weights for these specialized classes to be plugged in without refactoring.
- **Synthetic Portal Representation:** Standard weights will not detect CSS-drawn synthetic shapes representing face photos on the test portal. Test verification should use real photograph files containing people.
- **Single-Pass Redaction:** Redaction precision matches detected DOM and visual bounding boxes; it does not currently execute a secondary in-browser OCR pass.
- **Controlled High-Risk Execution:** Full automated form submission is deliberately gated behind explicit user confirmation and restricted to authenticated local test origins (`127.0.0.1`, `localhost`, `0.0.0.0`).
- **Meaning of "Leak Check Passed":** The leak check confirms that no locally indexed raw terms appear in the outbound structured payload; it is an active security assertion rather than a claim of absolute mathematical impossibility of re-identification.

---

## 👥 Contributors & Acknowledgements

Developed for the **Smart India Hackathon (SIH)** prototype evaluation. Built with clean, standard-compliant JavaScript (ES2022) and Python 3.
