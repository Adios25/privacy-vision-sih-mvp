(() => {
  const api = globalThis.browser || globalThis.chrome;
  const OVERLAY_ID = 'privacy-vision-sih-manual-overlay';

  function start(options = {}) {
    document.getElementById(OVERLAY_ID)?.remove();
    const canvas = document.createElement('canvas');
    canvas.id = OVERLAY_ID; canvas.width = innerWidth; canvas.height = innerHeight;
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: '2147483647', cursor: 'crosshair', background: 'transparent' });
    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, { position: 'fixed', top: '12px', right: '12px', zIndex: '2147483648', display: 'flex', gap: '6px', padding: '8px', borderRadius: '8px', background: 'rgba(7,26,24,.95)', color: '#fff', font: '12px system-ui' });
    toolbar.innerHTML = '<button data-action="add">➕ Add Mask</button><button data-action="approve">✅ Approve & Continue</button><button data-action="cancel">Cancel</button>';
    document.documentElement.append(canvas, toolbar);
    const masks = (options.masks || []).map((item, index) => globalThis.PrivvyRedaction.makeBoundingBox(item, index, item.type || 'VISUAL'));
    const manual = masks.filter((item) => item.type === 'MANUAL');
    const context = canvas.getContext('2d'); let drawing = false; let startPoint = null; let pending = null;
    const emit = (approved = false) => api.runtime.sendMessage({ type: 'PV_REDACTION_REVIEW', approved, autoDetections: masks.filter((item) => item.type !== 'MANUAL'), manualDetections: manual }).catch(() => {});
    const draw = () => {
      context.clearRect(0, 0, innerWidth, innerHeight);
      for (const mask of masks) {
        context.strokeStyle = mask.active ? '#ff4567' : '#9aa5a2'; context.fillStyle = mask.active ? 'rgba(255,69,103,.18)' : 'rgba(154,165,162,.08)';
        context.lineWidth = 2; context.setLineDash(mask.active ? [] : [5, 4]); context.fillRect(mask.x, mask.y, mask.width, mask.height); context.strokeRect(mask.x, mask.y, mask.width, mask.height); context.setLineDash([]);
        context.fillStyle = mask.active ? '#ff4567' : '#9aa5a2'; context.font = '700 11px system-ui'; context.fillText(mask.active ? String(masks.indexOf(mask) + 1) : 'Off', mask.x + 4, Math.max(14, mask.y + 14));
      }
      if (pending) { context.strokeStyle = '#42e6b1'; context.setLineDash([4, 3]); context.strokeRect(pending.x, pending.y, pending.width, pending.height); context.setLineDash([]); }
    };
    const hit = (x, y) => masks.find((item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
    canvas.addEventListener('pointerdown', (event) => { const found = hit(event.clientX, event.clientY); if (found) { found.active = !found.active; draw(); emit(); return; } drawing = true; startPoint = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => { if (!drawing) return; pending = { x: Math.min(startPoint.x, event.clientX), y: Math.min(startPoint.y, event.clientY), width: Math.abs(event.clientX - startPoint.x), height: Math.abs(event.clientY - startPoint.y) }; draw(); });
    canvas.addEventListener('pointerup', () => { if (!drawing) return; drawing = false; if (pending?.width > 3 && pending?.height > 3) { const index = manual.length + 1; const box = globalThis.PrivvyRedaction.makeBoundingBox({ ...pending, id: `manual_${Date.now()}_${index}`, type: 'MANUAL', category: 'PII_CUSTOM', label: `[REDACTED_MANUAL_${index}]`, isUserAdded: true }, index, 'MANUAL'); manual.push(box); masks.push(box); } pending = null; draw(); emit(); });
    toolbar.addEventListener('click', (event) => { const action = event.target.closest('button')?.dataset.action; if (action === 'approve') { emit(true); canvas.remove(); toolbar.remove(); } else if (action === 'cancel') { canvas.remove(); toolbar.remove(); } else if (action === 'add') canvas.style.cursor = 'crosshair'; });
    document.addEventListener('keydown', function escape(event) { if (event.key !== 'Escape') return; pending = null; drawing = false; draw(); document.removeEventListener('keydown', escape); });
    addEventListener('resize', () => { canvas.width = innerWidth; canvas.height = innerHeight; draw(); });
    draw(); emit(); return { ok: true };
  }
  function stop() { document.getElementById(OVERLAY_ID)?.remove(); document.querySelectorAll('body > div').forEach((node) => { if (node.textContent?.includes('Approve & Continue')) node.remove(); }); }
  globalThis.PrivvyOverlayCanvas = { start, stop };
})();
