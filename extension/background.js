const api = globalThis.browser || globalThis.chrome;
const pendingCaptures = new Map();
const CAPTURE_TTL_MS = 60_000;

function captureVisibleTab(windowId) {
  try {
    const result = api.tabs.captureVisibleTab(windowId, { format: 'png' });
    if (result && typeof result.then === 'function') return result;
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    api.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      const error = api.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(dataUrl);
    });
  });
}

function captureKey(windowId) {
  return String(windowId);
}

async function takeCachedCapture(message) {
  const key = captureKey(message.windowId);
  const cached = pendingCaptures.get(key);
  if (!cached) return null;
  if (Date.now() - cached.capturedAt > CAPTURE_TTL_MS || cached.tabId !== message.tabId) {
    pendingCaptures.delete(key);
    return null;
  }
  pendingCaptures.delete(key);
  try { return await cached.promise; } catch { return null; }
}

// Chrome side panels do not reliably retain the action's activeTab grant when
// they are opened by the generic side-panel picker. Capture during Privvy's own
// toolbar click, while the grant is definitely active, then open the panel.
if (api.sidePanel && api.action?.onClicked) {
  const behavior = api.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  behavior?.catch?.(() => {});

  api.action.onClicked.addListener((tab) => {
    if (!tab?.id || tab.windowId == null) return;
    const key = captureKey(tab.windowId);
    const record = {
      tabId: tab.id,
      capturedAt: Date.now(),
      promise: captureVisibleTab(tab.windowId)
    };
    pendingCaptures.set(key, record);
    record.promise.catch(() => {
      if (pendingCaptures.get(key) === record) pendingCaptures.delete(key);
    });
    setTimeout(() => {
      if (pendingCaptures.get(key) === record) pendingCaptures.delete(key);
    }, CAPTURE_TTL_MS);

    // Start opening synchronously inside the click handler so Chrome recognizes
    // it as a user gesture; do not wait for screenshot encoding first.
    const opened = api.sidePanel.open({ windowId: tab.windowId });
    opened?.catch?.(() => {});
  });
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'PV_CAPTURE_VISIBLE_TAB') return false;

  captureVisibleTab(message.windowId)
    .then((dataUrl) => sendResponse({ ok: true, dataUrl, captureMode: 'live' }))
    .catch(async (error) => {
      const cached = await takeCachedCapture(message);
      if (cached) {
        sendResponse({ ok: true, dataUrl: cached, captureMode: 'toolbar-click' });
      } else {
        sendResponse({
          ok: false,
          error: `Click Privvy's toolbar icon once to authorize this tab, then scan again. Chrome said: ${error.message}`
        });
      }
    });
  return true;
});
