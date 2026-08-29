const api = globalThis.browser || globalThis.chrome;
const state = {
  tabId: null, windowId: null, scan: null, payload: null,
  localPlan: null, serverPlan: null, executionSource: null,
  pendingHighRisk: [], receipt: [], profile: null, requestStarted: 0
};
const $ = (selector) => document.querySelector(selector);
const PROFILE_VERSION = 2;
const SESSION_VERSION = 4;
const CONTENT_VERSION = '1.3.3';

const defaultProfile = {
  name: 'Soumil Bhosle', email: 'soumil.bhosle@example.test', phone: '+91 98765 43210',
  address: '14 Orbital View, Bengaluru 560001', dob: '2002-08-14', aadhaar: '1111 2222 3333', passport: 'Z0000007'
};
const legacyProfile = { name: ['Ananya', 'Rao'].join(' '), email: ['ananya.rao', 'example.test'].join('@') };
const placeholderByPurpose = {
  name: '<USER_NAME>', email: '<USER_EMAIL>', phone: '<USER_PHONE>', address: '<USER_ADDRESS>',
  dob: '<USER_DOB>', aadhaar: '<USER_AADHAAR>', passport: '<USER_PASSPORT>'
};

function setBoundary(title, copy, tone = 'idle') {
  $('#boundary-title').textContent = title;
  $('#boundary-copy').textContent = copy;
  $('#boundary').dataset.tone = tone;
}

function promiseCall(target, method, ...args) {
  try {
    const result = target[method](...args);
    if (result && typeof result.then === 'function') return result;
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    target[method](...args, (value) => {
      const error = api.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(value);
    });
  });
}

function sessionStore() {
  return api.storage.session || api.storage.local;
}

async function persistSession() {
  if (!state.tabId || !state.scan || !state.payload) return;
  const saved = {
    version: SESSION_VERSION,
    tabId: state.tabId,
    scan: { scanId: state.scan.scanId, stateHash: state.scan.stateHash },
    payload: state.payload,
    localPlan: state.localPlan,
    serverPlan: state.serverPlan,
    executionSource: state.executionSource,
    pendingHighRisk: state.pendingHighRisk,
    receipt: state.receipt,
    savedAt: Date.now()
  };
  try { await sessionStore().set({ pvActiveSession: saved }); } catch {}
}

async function discardPersistedSession() {
  try { await sessionStore().remove('pvActiveSession'); } catch {}
}

async function activeTab() {
  const tabs = await promiseCall(api.tabs, 'query', { active: true, currentWindow: true });
  const tab = tabs?.[0];
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || '')) throw new Error('Open a regular website before scanning.');
  state.tabId = tab.id;
  state.windowId = tab.windowId;
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    const response = await promiseCall(api.tabs, 'sendMessage', tabId, { type: 'PV_PING' });
    if (response?.contentVersion === CONTENT_VERSION) return;
  } catch {}
  await promiseCall(api.scripting, 'executeScript', { target: { tabId }, files: ['content.js'] });
}

async function sendToTab(message) {
  const tab = await activeTab();
  await ensureContentScript(tab.id);
  return promiseCall(api.tabs, 'sendMessage', tab.id, message);
}

function normalizedIncludes(haystack, needle) {
  const normalize = (value) => String(value).toLowerCase().replace(/[\s\-().]/g, '');
  const compact = normalize(needle);
  return compact.length >= 2 && normalize(haystack).includes(compact);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function targetSummary(action) {
  if (!action.targetId) return action.reason || action.message || '';
  const target = state.payload?.page?.elements?.find((element) => element.id === action.targetId);
  return target?.label ? `${action.targetId} · ${target.label}` : action.targetId;
}

function actionRows(actions, receipt = false) {
  return actions.map((action, index) => {
    const detail = `${targetSummary(action)} ${action.placeholder || ''}`.trim();
    const status = receipt ? action.status : 'planned';
    const reason = receipt && action.reason ? `<small>${escapeHtml(action.reason)}</small>` : '';
    return `<div class="action-item"><code>${String(index + 1).padStart(2, '0')}</code><div><strong>${escapeHtml(action.type)}</strong><small>${escapeHtml(detail)}</small>${reason}</div><span class="action-state" data-state="${escapeHtml(status)}">${escapeHtml(status)}</span></div>`;
  }).join('');
}

function mergeDetections(domDetections, visualDetections) {
  const output = [...domDetections];
  for (const item of visualDetections) {
    if (!output.some((existing) => {
      const left = Math.max(existing.rect.x, item.rect.x); const top = Math.max(existing.rect.y, item.rect.y);
      const right = Math.min(existing.rect.x + existing.rect.width, item.rect.x + item.rect.width);
      const bottom = Math.min(existing.rect.y + existing.rect.height, item.rect.y + item.rect.height);
      const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
      return existing.category === item.category && intersection > Math.min(existing.rect.width * existing.rect.height, item.rect.width * item.rect.height) * .45;
    })) output.push(item);
  }
  return output;
}

class VisualDetector {
  constructor() {
    this.session = null;
    this.backend = 'none';
    this.initialized = false;
    this._initPromise = null;
  }

  getBackend() {
    return this.backend;
  }

  async initialize() {
    // Guard against concurrent initialization calls (e.g. from React StrictMode or repeated scans)
    if (this.initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  async _doInitialize() {
    try {
      // Step 1: Configure WASM paths using chrome.runtime.getURL so the extension
      // can resolve its bundled WASM binary correctly regardless of context.
      // numThreads=1 avoids SharedArrayBuffer / crossOriginIsolated requirement
      // that Chrome extension side panels cannot satisfy.
      const wasmDir = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('')
        : './';

      ort.env.wasm.wasmPaths = wasmDir;
      ort.env.wasm.numThreads = 1;

      // Step 2: Resolve the model URL — must be an extension URL, not a bare path
      const modelUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('yolo11n.onnx')
        : './yolo11n.onnx';

      // Step 3: Try WebGPU (hardware-accelerated) only if navigator.gpu is available
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        try {
          this.session = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['webgpu']
          });
          this.backend = 'WebGPU';
          this.initialized = true;
          console.log('[Privvy YOLO] Initialized on WebGPU backend');
          return;
        } catch (gpuErr) {
          console.warn('[Privvy YOLO] WebGPU failed, falling back to WASM:', gpuErr.message);
        }
      } else {
        console.log('[Privvy YOLO] navigator.gpu not available, using WASM backend');
      }

      // Step 4: WASM fallback (single-threaded to avoid crossOriginIsolated requirement)
      this.session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm']
      });
      this.backend = 'WASM';
      this.initialized = true;
      console.log('[Privvy YOLO] Initialized on WASM backend');
    } catch (err) {
      this._initPromise = null; // Allow retry on next call
      console.error('[Privvy YOLO] All backends failed:', err);
      throw err;
    }
  }

  async detect(imageBitmap, confThreshold = 0.25, iouThreshold = 0.45) {
    const started = performance.now();
    await this.initialize();
    const initMs = performance.now() - started;

    const preprocessStart = performance.now();
    const imgWidth = imageBitmap.width;
    const imgHeight = imageBitmap.height;
    
    const scale = Math.min(640 / imgWidth, 640 / imgHeight);
    const newWidth = Math.round(imgWidth * scale);
    const newHeight = Math.round(imgHeight * scale);
    const padX = Math.floor((640 - newWidth) / 2);
    const padY = Math.floor((640 - newHeight) / 2);

    const canvas = new OffscreenCanvas(640, 640);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#727272';
    ctx.fillRect(0, 0, 640, 640);
    ctx.drawImage(imageBitmap, padX, padY, newWidth, newHeight);

    const imgData = ctx.getImageData(0, 0, 640, 640);
    const data = imgData.data;

    const float32Data = new Float32Array(3 * 640 * 640);
    for (let i = 0; i < 640 * 640; i++) {
      float32Data[i] = data[i * 4] / 255.0;
      float32Data[640 * 640 + i] = data[i * 4 + 1] / 255.0;
      float32Data[2 * 640 * 640 + i] = data[i * 4 + 2] / 255.0;
    }

    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
    const preprocessMs = performance.now() - preprocessStart;

    const inferenceStart = performance.now();
    const feeds = {};
    feeds[this.session.inputNames[0]] = inputTensor;
    const outputs = await this.session.run(feeds);
    const outputTensor = outputs[this.session.outputNames[0]];
    const outputData = outputTensor.data;
    const inferenceMs = performance.now() - inferenceStart;

    const postprocessStart = performance.now();
    const numBoxes = 8400;
    const numClasses = 80;
    const cocoClasses = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"];

    const candidates = [];
    for (let col = 0; col < numBoxes; col++) {
      let maxScore = -1;
      let maxClassId = -1;
      for (let cl = 0; cl < numClasses; cl++) {
        const score = outputData[(4 + cl) * numBoxes + col];
        if (score > maxScore) {
          maxScore = score;
          maxClassId = cl;
        }
      }

      if (maxScore >= confThreshold) {
        const xc = outputData[0 * numBoxes + col];
        const yc = outputData[1 * numBoxes + col];
        const w = outputData[2 * numBoxes + col];
        const h = outputData[3 * numBoxes + col];
        const left = xc - w / 2;
        const top = yc - h / 2;

        candidates.push({
          classId: maxClassId,
          className: cocoClasses[maxClassId] || `class_${maxClassId}`,
          confidence: maxScore,
          bbox: [left, top, w, h]
        });
      }
    }

    const nmsDetections = this.nms(candidates, iouThreshold);

    const finalDetections = nmsDetections.map(det => {
      const [x, y, w, h] = det.bbox;
      const origX = (x - padX) / scale;
      const origY = (y - padY) / scale;
      const origW = w / scale;
      const origH = h / scale;

      return {
        class: det.className,
        confidence: det.confidence,
        bbox: {
          x: Math.max(0, Math.round(origX)),
          y: Math.max(0, Math.round(origY)),
          width: Math.round(origW),
          height: Math.round(origH)
        }
      };
    });

    const postprocessMs = performance.now() - postprocessStart;
    const totalMs = performance.now() - started;

    return {
      detections: finalDetections,
      metrics: {
        initMs: Math.round(initMs),
        preprocessMs: Math.round(preprocessMs),
        inferenceMs: Math.round(inferenceMs),
        postprocessMs: Math.round(postprocessMs),
        totalMs: Math.round(totalMs)
      }
    };
  }

  nms(candidates, iouThreshold) {
    candidates.sort((a, b) => b.confidence - a.confidence);
    const selected = [];
    for (const cand of candidates) {
      let keep = true;
      for (const sel of selected) {
        if (this.iou(cand.bbox, sel.bbox) > iouThreshold) {
          keep = false;
          break;
        }
      }
      if (keep) {
        selected.push(cand);
      }
    }
    return selected;
  }

  iou(boxA, boxB) {
    const xA = Math.max(boxA[0], boxB[0]);
    const yA = Math.max(boxA[1], boxB[1]);
    const xB = Math.min(boxA[0] + boxA[2], boxB[0] + boxB[2]);
    const yB = Math.min(boxA[1] + boxA[3], boxB[1] + boxB[3]);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = boxA[2] * boxA[3];
    const boxBArea = boxB[2] * boxB[3];
    const unionArea = boxAArea + boxBArea - interArea;
    return unionArea > 0 ? interArea / unionArea : 0;
  }
}

const PRIVACY_POLICY = {
  "person": { category: "FACE", action: "REDACT" },
  "face": { category: "FACE", action: "REDACT" },
  "signature": { category: "SIGNATURE", action: "REDACT" },
  "id card": { category: "IDENTITY_DOCUMENT", action: "REDACT" },
  "passport": { category: "IDENTITY_DOCUMENT", action: "REDACT" },
  "qr code": { category: "QR_BARCODE", action: "REDACT" }
};

const visualDetector = new VisualDetector();

async function localVisionModel(dataUrl, viewport) {
  const started = performance.now();

  // Convert the data URL to an ImageBitmap for ONNX input
  let image;
  try {
    image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  } catch (imgErr) {
    console.error('[Privvy YOLO] Failed to decode screenshot:', imgErr);
    return { detections: [], engine: 'YOLO11n (error)', ms: 0 };
  }

  let result;
  try {
    result = await visualDetector.detect(image);
  } catch (inferErr) {
    console.error('[Privvy YOLO] Inference failed:', inferErr);
    $('#yolo-backend').textContent = 'Error';
    $('#yolo-latency').textContent = '—';
    $('#yolo-detections').innerHTML = `<span style="color:#f87171">⚠ ${inferErr.message}</span>`;
    return { detections: [], engine: 'YOLO11n (error)', ms: 0 };
  }

  const detections = [];
  for (const det of result.detections) {
    const policy = PRIVACY_POLICY[det.class];
    if (policy && policy.action === 'REDACT') {
      detections.push({
        category: policy.category,
        source: 'YOLO11n',
        confidence: det.confidence,
        rect: det.bbox
      });
    }
  }

  const backend = visualDetector.getBackend();
  const latencyMs = Math.round(result.metrics.totalMs);

  $('#yolo-backend').textContent = backend;
  $('#yolo-latency').textContent = `${latencyMs} ms`;
  if (result.detections.length === 0) {
    $('#yolo-detections').innerHTML = '<span>No objects detected</span>';
  } else {
    $('#yolo-detections').innerHTML = result.detections.map(det =>
      `<span>✓ ${det.class.charAt(0).toUpperCase() + det.class.slice(1)} (${Math.round(det.confidence * 100)}%)</span>`
    ).join('');
  }

  return {
    detections,
    engine: `YOLO11n (${backend})`,
    ms: latencyMs
  };
}

async function drawRedactedPreview(dataUrl, scan, detections) {
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = $('#preview'); const ratio = Math.min(1, 780 / image.width);
  canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const scaleX = image.width / scan.viewport.width * ratio; const scaleY = image.height / scan.viewport.height * ratio;
  detections.forEach((detection) => {
    const x = detection.rect.x * scaleX; const y = detection.rect.y * scaleY; const width = detection.rect.width * scaleX; const height = detection.rect.height * scaleY;
    context.fillStyle = '#071a18'; context.fillRect(Math.max(0, x - 3), Math.max(0, y - 3), width + 6, height + 6);
    if (width > 32 && height > 12) { context.fillStyle = '#42e6b1'; context.font = '700 9px monospace'; context.fillText(`<${detection.category}>`, x + 3, y + 3); }
  });
  return canvas.toDataURL('image/jpeg', .78);
}

function buildPayload(scan, redactedImage, vision, detections) {
  const categoryCounts = detections.reduce((summary, item) => { summary[item.category] = (summary[item.category] || 0) + 1; return summary; }, {});
  const payload = {
    protocolVersion: '1.0',
    task: $('#task').value.trim(),
    page: { ...scan.page, categoryCounts },
    stateHash: scan.stateHash,
    imageDataUrl: redactedImage,
    redactionManifest: detections.map((item) => ({ category: item.category, source: item.source, confidence: item.confidence, rect: item.rect })),
    clientMetrics: { ...scan.clientMetrics, visionMs: vision.ms, visionEngine: vision.engine, webGpuAvailable: Boolean(navigator.gpu) },
    leakCheck: { status: 'pending', knownRawTermsInStructuredPayload: 0 }
  };
  const structured = JSON.stringify({ ...payload, imageDataUrl: '<REDACTED_IMAGE_DATA>' });
  const leaked = scan.rawTerms.filter((term) => normalizedIncludes(structured, term));
  payload.leakCheck = { status: leaked.length ? 'blocked' : 'passed', knownRawTermsInStructuredPayload: leaked.length };
  return payload;
}

function renderScan() {
  const counts = state.payload.page.categoryCounts; const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  $('#detection-total').textContent = String(entries.reduce((sum, [, count]) => sum + count, 0));
  $('#category-list').innerHTML = entries.length ? entries.map(([category, count]) => `<span>${category}<b>${count}</b></span>`).join('') : '<span>No supported PII found</span>';
  const passed = state.payload.leakCheck.status === 'passed';
  $('#leak-status').textContent = passed ? 'Passed' : 'Blocked';
  $('#leak-status').style.color = passed ? '#087a55' : '#b42332';
  $('#scan-ms').textContent = `${state.payload.clientMetrics.totalScanMs} ms`;
  $('#vision-ms').textContent = `${state.payload.clientMetrics.visionMs} ms`;
  const payloadBytes = new Blob([JSON.stringify(state.payload)]).size;
  $('#payload-size').textContent = `${Math.round(payloadBytes / 1024)} KB`;
  $('#memory').textContent = state.payload.clientMetrics.jsHeapBytes ? `${Math.round(state.payload.clientMetrics.jsHeapBytes / 1048576)} MB` : 'N/A';
  const previewPayload = { ...state.payload, imageDataUrl: `<REDACTED_IMAGE_DATA:${Math.round(state.payload.imageDataUrl.length / 1024)}KB>` };
  $('#payload-json').textContent = JSON.stringify(previewPayload, null, 2);
  $('#scan-results').classList.remove('hidden');
  $('#plan').disabled = !passed;
  $('#local-plan-results').classList.add('hidden'); $('#server-plan-results').classList.add('hidden');
  $('#execution-results').classList.add('hidden'); $('#confirmation').classList.add('hidden');
  $('#engine-badge').textContent = state.payload.clientMetrics.visionEngine;
  setBoundary(passed ? 'Safe context ready' : 'Network planning blocked', passed ? 'Known raw page values are absent from the structured payload; review it before transmission.' : 'A locally detected raw value remains. Nothing will be sent.', passed ? 'safe' : 'blocked');
}

function createLocalPlan(page) {
  const actions = (page.elements || []).filter((element) => (
    element.role === 'textbox'
    && element.enabled
    && !element.value
    && placeholderByPurpose[element.purpose]
    && !['file', 'password', 'hidden', 'checkbox', 'radio'].includes(element.inputType)
  )).map((element) => ({
    type: 'TYPE_PLACEHOLDER', targetId: element.id, placeholder: placeholderByPurpose[element.purpose], highRisk: false
  }));
  const submit = (page.elements || []).find((element) => element.role === 'button' && element.enabled && element.risk === 'HIGH_RISK');
  if (submit) actions.push({ type: 'CLICK', targetId: submit.id, highRisk: true });
  if (!actions.length) actions.push({ type: 'ABORT', reason: 'No supported empty fields require a local action.', highRisk: false });
  return {
    provider: 'local', model: 'deterministic-schema-v1',
    message: 'Privvy planned these actions locally from the sanitized UI graph. The local profile and placeholder mapping were not provided to the planner.',
    actions, submissionTargetId: submit?.id || null,
    metrics: { serverMs: 0, modelMs: 0 }
  };
}

async function scanPage() {
  $('#scan').disabled = true; setBoundary('Inspecting locally', 'Reading the active tab and running the local visual pipeline. No server request is being made.', 'working');
  try {
    const response = await sendToTab({ type: 'PV_SCAN_PAGE' });
    if (!response?.ok) throw new Error(response?.error || 'Page scan failed.');
    const capture = await promiseCall(api.runtime, 'sendMessage', {
      type: 'PV_CAPTURE_VISIBLE_TAB', tabId: state.tabId, windowId: state.windowId
    });
    if (!capture?.ok) throw new Error(capture?.error || 'Visible-tab capture failed.');
    const vision = await localVisionModel(capture.dataUrl, response.data.viewport);
    const detections = mergeDetections(response.data.detections, vision.detections);
    const redacted = await drawRedactedPreview(capture.dataUrl, response.data, detections);
    state.scan = response.data; state.payload = buildPayload(response.data, redacted, vision, detections);
    state.localPlan = null; state.serverPlan = null; state.executionSource = null; state.pendingHighRisk = []; state.receipt = [];
    renderScan();
    renderPlan(createLocalPlan(state.payload.page), 'local');
    await persistSession();
  } catch (error) { setBoundary('Scan stopped', error.message, 'blocked'); }
  finally { $('#scan').disabled = false; }
}

function renderPlan(response, source) {
  const isServer = source === 'server';
  state[isServer ? 'serverPlan' : 'localPlan'] = response;
  $(`#${source}-provider`).textContent = `${response.provider} · ${response.model}`;
  $(`#${source}-planner-message`).textContent = response.message || 'The planner returned a schema-constrained plan from sanitized context.';
  $(`#${source}-action-list`).innerHTML = actionRows(response.actions || []);
  if (isServer) {
    $('#server-ms').textContent = `${response.metrics?.serverMs || 0} ms`;
    $('#model-ms').textContent = `${response.metrics?.modelMs || 0} ms`;
    $('#e2e-ms').textContent = `${response.metrics?.e2eMs || 0} ms`;
  }
  $(`#${source}-plan-results`).classList.remove('hidden');
  $(`#execute-${source}`).disabled = Boolean(state.executionSource);
  setBoundary(isServer ? 'Server plan ready' : 'Local plan ready', `${response.actions.length} schema-constrained actions prepared by ${response.provider}.`, 'safe');
}

async function requestPlan() {
  if (!state.payload || state.payload.leakCheck.status !== 'passed') { setBoundary('Planning blocked', 'Run a successful local scan first.', 'blocked'); return; }
  if (state.executionSource) { setBoundary('Planning locked', 'Clear or rescan the page before requesting another plan after execution begins.', 'blocked'); return; }
  $('#plan').disabled = true; state.requestStarted = performance.now(); setBoundary('Sending sanitized context', 'Only the redacted image, sanitized graph, metrics, and task are leaving the extension.', 'working');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const serverUrl = (await api.storage.local.get('pvSettings')).pvSettings?.serverUrl || 'http://127.0.0.1:8787';
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.payload), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Planner returned ${response.status}.`);
    data.metrics = { ...(data.metrics || {}), e2eMs: Math.round((performance.now() - state.requestStarted) * 10) / 10 };
    renderPlan(data, 'server');
    await persistSession();
  } catch (error) { setBoundary('Server planning stopped', error.name === 'AbortError' ? 'The server did not respond within 30 seconds.' : error.message, 'blocked'); }
  finally { clearTimeout(timer); $('#plan').disabled = false; }
}

function renderReceipt(receipt, source = state.executionSource) {
  state.receipt = receipt;
  $('#receipt-source').textContent = source === 'server' ? 'server plan' : 'local plan';
  $('#receipt-list').innerHTML = actionRows(receipt, true);
  $('#execution-results').classList.remove('hidden');
}

function requestSubmissionApproval() {
  const targets = state.pendingHighRisk.map((action) => targetSummary(action)).filter(Boolean).join(', ') || 'the synthetic completion control';
  $('#confirmation-copy').textContent = `Approve Privvy to activate ${targets} on the local synthetic portal? Safe field actions have already been applied.`;
  $('#confirmation').classList.remove('hidden');
  $('#confirm').disabled = false;
  $('#confirmation').scrollIntoView({
    block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  });
  $('#confirmation').focus({ preventScroll: true });
}

async function restoreSession() {
  let saved;
  try { saved = (await sessionStore().get('pvActiveSession')).pvActiveSession; } catch { return false; }
  if (!saved || saved.version !== SESSION_VERSION || !saved.scan || !saved.payload) return false;
  let tab;
  try { tab = await activeTab(); } catch { return false; }
  if (saved.tabId !== tab.id) {
    setBoundary('Session belongs to another tab', 'Return to the scanned tab to continue, or scan this page to start a new session.');
    return false;
  }
  state.scan = saved.scan;
  state.payload = saved.payload;
  state.localPlan = saved.localPlan || null;
  state.serverPlan = saved.serverPlan || null;
  state.executionSource = saved.executionSource || null;
  state.pendingHighRisk = saved.pendingHighRisk || [];
  state.receipt = saved.receipt || [];
  if (state.payload.task) $('#task').value = state.payload.task;
  renderScan();
  if (state.localPlan) renderPlan(state.localPlan, 'local');
  if (state.serverPlan) renderPlan(state.serverPlan, 'server');
  if (state.executionSource) $('#plan').disabled = true;
  if (state.receipt.length) renderReceipt(state.receipt, state.executionSource);
  if (state.pendingHighRisk.length) requestSubmissionApproval();
  setBoundary('Session restored', 'Privvy resumed the sanitized state for this tab. Raw detected terms and the local profile were not stored in the session.', 'safe');
  return true;
}

async function execute(actions, allowHighRisk, appendReceipt = false) {
  const response = await sendToTab({ type: 'PV_EXECUTE_ACTIONS', scanId: state.scan.scanId, expectedStateHash: state.scan.stateHash, actions, profile: state.profile, allowHighRisk });
  if (!response?.ok) throw new Error(response?.error || 'Action execution failed.');
  state.scan.stateHash = response.data.nextStateHash;
  const combinedReceipt = appendReceipt ? [...state.receipt, ...response.data.receipt] : response.data.receipt;
  renderReceipt(combinedReceipt, state.executionSource);
  await persistSession();
  return response.data.receipt;
}

async function executeSafeActions(source) {
  const plan = source === 'server' ? state.serverPlan : state.localPlan;
  if (!plan || state.executionSource) return;
  state.executionSource = source;
  $('#execute-local').disabled = true; $('#execute-server').disabled = true; $('#plan').disabled = true;
  setBoundary('Validating actions locally', `Targets from the ${source} plan are being checked before execution.`, 'working');
  try {
    state.pendingHighRisk = plan.actions.filter((action) => action.type === 'CLICK' && action.highRisk);
    if (!state.pendingHighRisk.length && plan.submissionTargetId) {
      state.pendingHighRisk = [{ type: 'CLICK', targetId: plan.submissionTargetId, highRisk: true }];
    }
    const receipt = await execute(plan.actions, false);
    const executed = receipt.filter((item) => item.status === 'executed').length;
    if (state.pendingHighRisk.length) {
      requestSubmissionApproval();
      setBoundary('Safe actions complete', `${executed} actions executed. Submission remains behind your approval.`, 'safe');
    } else setBoundary('Task actions complete', `${executed} validated actions executed locally.`, 'safe');
    await persistSession();
  } catch (error) {
    state.executionSource = null;
    $('#execute-local').disabled = !state.localPlan;
    $('#execute-server').disabled = !state.serverPlan;
    $('#plan').disabled = false;
    setBoundary('Execution stopped', error.message, 'blocked');
  } finally { await persistSession(); }
}

async function declineSubmission() {
  state.pendingHighRisk = [];
  $('#confirmation').classList.add('hidden');
  setBoundary('Submission not approved', 'Privvy left the synthetic form open. You may submit it manually or clear this session.', 'idle');
  await persistSession();
}

async function confirmSubmission() {
  $('#confirm').disabled = true; setBoundary('Executing approved submission', 'The current target is being revalidated on the synthetic portal.', 'working');
  try {
    const receipt = await execute(state.pendingHighRisk, true, true);
    const success = receipt.some((item) => item.status === 'executed');
    if (!success) throw new Error(receipt[0]?.reason || 'Submission was not executed.');
    $('#confirmation').classList.add('hidden'); state.pendingHighRisk = [];
    setBoundary('Synthetic task complete', 'Local values were restored and submission occurred only after approval. Raw profile values remained inside Privvy.', 'safe');
    await persistSession();
  } catch (error) { setBoundary('Submission stopped', error.message, 'blocked'); }
  finally { $('#confirm').disabled = false; }
}

async function clearSession() {
  try { if (state.tabId) await promiseCall(api.tabs, 'sendMessage', state.tabId, { type: 'PV_CLEAR_OVERLAY' }); } catch {}
  state.scan = null; state.payload = null; state.localPlan = null; state.serverPlan = null; state.executionSource = null; state.pendingHighRisk = []; state.receipt = [];
  await discardPersistedSession();
  $('#plan').disabled = true; $('#execute-local').disabled = true; $('#execute-server').disabled = true; $('#confirm').disabled = true;
  $('#scan-results').classList.add('hidden'); $('#local-plan-results').classList.add('hidden'); $('#server-plan-results').classList.add('hidden'); $('#execution-results').classList.add('hidden'); $('#confirmation').classList.add('hidden');
  $('#engine-badge').textContent = 'Ready'; setBoundary('Nothing inspected', 'Open a website, then choose when this extension may inspect the active tab.');
}

async function loadSettings() {
  const stored = await api.storage.local.get('pvSettings');
  const versionState = await api.storage.local.get('pvProfileVersion');
  const settings = { serverUrl: 'http://127.0.0.1:8787', ...defaultProfile, ...(stored.pvSettings || {}) };
  if (!versionState.pvProfileVersion || settings.name === legacyProfile.name || settings.email === legacyProfile.email) {
    if (!settings.name || settings.name === legacyProfile.name) settings.name = defaultProfile.name;
    if (!settings.email || settings.email === legacyProfile.email) settings.email = defaultProfile.email;
    await api.storage.local.set({ pvSettings: settings, pvProfileVersion: PROFILE_VERSION });
  }
  state.profile = Object.fromEntries(Object.keys(defaultProfile).map((key) => [key, settings[key] || defaultProfile[key]]));
  const form = $('#settings-form');
  Object.entries({ serverUrl: settings.serverUrl || 'http://127.0.0.1:8787', ...state.profile }).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
}

async function saveSettings(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  await api.storage.local.set({ pvSettings: values, pvProfileVersion: PROFILE_VERSION });
  state.profile = Object.fromEntries(Object.keys(defaultProfile).map((key) => [key, String(values[key] || '')]));
  setBoundary('Settings saved locally', 'Profile values remain inside browser extension storage.', 'safe');
}

$('#scan').addEventListener('click', scanPage);
$('#plan').addEventListener('click', requestPlan);
$('#execute-local').addEventListener('click', () => executeSafeActions('local'));
$('#execute-server').addEventListener('click', () => executeSafeActions('server'));
$('#confirm').addEventListener('click', confirmSubmission);
$('#cancel-confirmation').addEventListener('click', declineSubmission);
$('#clear').addEventListener('click', clearSession);
$('#settings-form').addEventListener('submit', saveSettings);
loadSettings().then(async () => {
  try { await sendToTab({ type: 'PV_HIDE_OVERLAY' }); } catch {}
  await restoreSession();
  $('#scan').disabled = false;
  $('#clear').disabled = false;
});
