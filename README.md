# Privvy MVP — Independent Extension and Dynamic Test Website

This is a separate implementation from `privacy-vision-browser-agent`. It contains three independently useful artifacts:

- `test-website/` — a dynamic synthetic portal that works without the extension.
- `extension/` — an independent Chrome/Firefox WebExtension that locally scans, masks, sanitizes, plans, and validates actions under the Privvy name.
- `server/` — a centralized planner endpoint that accepts only the sanitized screenshot/UI graph and supports Ollama or an OpenAI-compatible multimodal model.

## What is real in this prototype

1. The extension reads the active page only after the user opens it and selects **Scan current page**.
2. Text-pattern, field-semantic, visual-semantic, and local screenshot processing run inside the browser.
3. Every non-empty input or textarea value is treated as private, including values typed by the user, autofilled by the browser, prefilled by HTML, or inserted by page JavaScript.
4. Known values become typed placeholders; an unknown typed value becomes `<USER_INPUT_n>`.
5. The screenshot uses solid local bounding-box masks. A small WebGPU pixel classifier detects skin-coloured regions in the synthetic face fixture; Firefox and browsers without WebGPU use the same classifier on Canvas CPU.
6. Only the redacted image, sanitized UI graph, task, category counts, state hash, and performance metrics are sent to the server.
7. A deterministic allowlisted plan is created locally from the sanitized graph. Optionally, the server can call a real VLM through Ollama or an OpenAI-compatible endpoint and validate its JSON action schema.
8. Profile values are resolved only inside the extension. Existing page values are preserved.
9. Submission remains behind a separate confirmation and is automated only on the local synthetic portal.

The deterministic server planner is a labelled fallback for setup and rehearsal. For the judged run, configure Ollama or an OpenAI-compatible VLM so the extension status shows the actual model provider.

## Quick start

### 1. Start the website and planner server

No Python packages are required.

```bash
cd privacy-vision-sih-mvp
python3 server/server.py
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787).

### 2. Load the Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the `privacy-vision-sih-mvp/dist/chrome` folder. Select the folder itself, not the ZIP; `manifest.json` must be directly inside the selected folder.
5. Return to the portal and click **Privvy's own toolbar icon** (pin it first if needed). Do not open it from Chrome's generic side-panel dropdown. The Privvy icon authorizes the current tab, captures its visible state locally, and opens the persistent side panel.

Privvy declares host access only for local test origins (`127.0.0.1`, `localhost`, and `0.0.0.0`). Chrome's temporary `activeTab` grant is acquired by clicking Privvy's toolbar icon; an in-memory capture is then available to the scan without requesting broad `<all_urls>` access. The raw capture is never written to extension storage and expires after 60 seconds if unused.

### 3. Run the end-to-end task

1. Select a portal scenario.
2. Optionally use **One typed** or type your own value.
3. Open the extension and scan the page.
4. Inspect the redacted preview and exact sanitized payload.
5. Review the local deterministic baseline. Optionally send the sanitized context to the server and compare its separately displayed validated plan.
6. Choose either the local or server plan, then execute its safe actions.
7. Review and approve the synthetic submission.
8. Change the website scenario and show that the previous plan is stale.

Privvy stores only the sanitized scan graph, redacted preview, plan, and receipts for same-tab session restoration. Closing and reopening the panel does not restart the workflow. Raw detected terms, unredacted captures, and the local profile are not included in that saved session.

The portal's **Prefill preservation test** is deliberate evaluation evidence: choose one, two, or three typed values before scanning. Those values must appear only as typed placeholders in the sanitized payload and must remain unchanged when Privvy fills the remaining empty fields.

## Use a real server-side VLM

### Offline/open-weights with Ollama

Run an Ollama multimodal model, then start the server with:

```bash
PV_PROVIDER=ollama PV_MODEL=qwen2.5vl:3b python3 server/server.py
```

Set `PV_OLLAMA_URL` if Ollama is not at `http://127.0.0.1:11434`.

### Cloud or self-hosted OpenAI-compatible endpoint

```bash
PV_PROVIDER=openai-compatible \
PV_MODEL=your-vision-model \
PV_API_KEY=your-key \
PV_OPENAI_BASE_URL=https://your-endpoint.example/v1 \
python3 server/server.py
```

The model endpoint must support chat-completions image inputs and JSON-object responses. The API key stays on the server and is never stored in the extension or website.

## Firefox package

Build browser-specific unpacked folders and ZIPs:

```bash
python3 scripts/package_extensions.py
```

Then open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the file `dist/firefox/manifest.json`. Firefox uses a toolbar popup, but reopening it on the same tab restores the sanitized session. Temporary add-ons must be reloaded after restarting Firefox.

## Metrics

- Client scan, graph, visual-processing, heap indicator, and payload size are shown in the extension.
- Server/model/end-to-end durations are returned with each plan.
- Aggregated non-PII run metrics are available at [http://127.0.0.1:8787/api/metrics](http://127.0.0.1:8787/api/metrics).
- Health and active model mode are available at [http://127.0.0.1:8787/api/health](http://127.0.0.1:8787/api/health).

## Verification

```bash
python3 tests/run_tests.py
python3 scripts/package_extensions.py
```

## Honest limitations

- The text detector uses deterministic patterns and page semantics rather than a trained multilingual NER model.
- The WebGPU/CPU pixel classifier is a small fixed visual classifier optimized for the synthetic face fixture, not a general face-recognition model.
- Screenshot redaction precision depends on detected DOM and visual regions; this MVP does not run a second OCR model.
- Firefox normally uses the Canvas CPU fallback when WebGPU is unavailable.
- Arbitrary-site high-risk actions remain blocked; the end-to-end submission proof is restricted to the local synthetic portal.
- “Leak check passed” means no locally known raw term remains in the structured payload. It is not a claim of perfect privacy.
