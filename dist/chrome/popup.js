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

function clusterCells(active, cols, rows, cellSize, scaleX, scaleY) {
  const seen = new Set(); const boxes = [];
  for (const start of active) {
    if (seen.has(start)) continue;
    const queue = [start]; seen.add(start); let minX = cols; let minY = rows; let maxX = 0; let maxY = 0; let cells = 0;
    while (queue.length) {
      const index = queue.shift(); const x = index % cols; const y = Math.floor(index / cols); cells += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
        const next = ny * cols + nx;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && active.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
      });
    }
    if (cells >= 1) boxes.push({
      category: 'FACE', source: 'local-pixel-classifier', confidence: Math.min(.92, .66 + cells * .04),
      rect: { x: minX * cellSize * scaleX, y: minY * cellSize * scaleY, width: (maxX - minX + 1) * cellSize * scaleX, height: (maxY - minY + 1) * cellSize * scaleY }
    });
  }
  return boxes.filter((box) => box.rect.width >= 18 && box.rect.height >= 18 && box.rect.width < innerWidth * .7);
}

async function webGpuSkinModel(imageData, viewport) {
  if (!navigator.gpu) throw new Error('WebGPU unavailable');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  const pixels = new Uint32Array(imageData.data.buffer.slice(0));
  const width = imageData.width; const height = imageData.height; const cellSize = 24;
  const cols = Math.ceil(width / cellSize); const rows = Math.ceil(height / cellSize);
  const input = device.createBuffer({ size: pixels.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const counts = device.createBuffer({ size: cols * rows * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: cols * rows * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  device.queue.writeBuffer(input, 0, pixels);
  const shader = device.createShaderModule({ code: `
    @group(0) @binding(0) var<storage, read> px: array<u32>;
    @group(0) @binding(1) var<storage, read_write> score: array<atomic<u32>>;
    @compute @workgroup_size(64)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let i = gid.x;
      if (i >= ${pixels.length}u) { return; }
      let p = px[i]; let r = p & 255u; let g = (p >> 8u) & 255u; let b = (p >> 16u) & 255u;
      let maxc = max(r, max(g, b)); let minc = min(r, min(g, b));
      let skin = r > 95u && g > 40u && b > 20u && (maxc - minc) > 15u && r > g && r > b && (r - g) > 12u;
      if (skin) { let x = i % ${width}u; let y = i / ${width}u; let cell = (y / ${cellSize}u) * ${cols}u + (x / ${cellSize}u); atomicAdd(&score[cell], 1u); }
    }` });
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: shader, entryPoint: 'main' } });
  const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: counts } }] });
  const encoder = device.createCommandEncoder(); const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(Math.ceil(pixels.length / 64)); pass.end();
  encoder.copyBufferToBuffer(counts, 0, readback, 0, cols * rows * 4); device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const values = new Uint32Array(readback.getMappedRange().slice(0)); readback.unmap(); device.destroy();
  const active = new Set();
  values.forEach((count, index) => { if (count > cellSize * cellSize * .16) active.add(index); });
  return clusterCells(active, cols, rows, cellSize, viewport.width / width, viewport.height / height);
}

function cpuSkinModel(imageData, viewport) {
  const width = imageData.width; const height = imageData.height; const cellSize = 24;
  const cols = Math.ceil(width / cellSize); const rows = Math.ceil(height / cellSize); const counts = new Uint32Array(cols * rows);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4; const r = imageData.data[offset]; const g = imageData.data[offset + 1]; const b = imageData.data[offset + 2];
    if (r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && r > g && r > b && r - g > 12) counts[Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)] += 1;
  }
  const active = new Set(); counts.forEach((count, index) => { if (count > cellSize * cellSize * .16) active.add(index); });
  return clusterCells(active, cols, rows, cellSize, viewport.width / width, viewport.height / height);
}

async function localVisionModel(dataUrl, viewport) {
  const started = performance.now();
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const maxWidth = 640; const scale = Math.min(1, maxWidth / image.width);
  const canvas = new OffscreenCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let engine = 'Canvas CPU pixel classifier'; let detections;
  try { detections = await webGpuSkinModel(imageData, viewport); engine = 'WebGPU pixel classifier'; }
  catch { detections = cpuSkinModel(imageData, viewport); }
  return { detections, engine, ms: Math.round((performance.now() - started) * 10) / 10 };
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
