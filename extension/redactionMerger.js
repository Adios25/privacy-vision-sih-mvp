(() => {
  function rect(value) {
    return {
      x: Math.max(0, Number(value?.x) || 0),
      y: Math.max(0, Number(value?.y) || 0),
      width: Math.max(0, Number(value?.width) || 0),
      height: Math.max(0, Number(value?.height) || 0)
    };
  }

  function intersects(a, b) {
    const left = Math.max(a.x, b.x); const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return right > left && bottom > top;
  }

  function makeBoundingBox(item, index = 0, type = 'VISUAL') {
    const normalizedType = ['DOM', 'OCR', 'VISUAL', 'MANUAL'].includes(item?.type) ? item.type : type;
    const normalizedRect = rect(item?.rect || item);
    return {
      id: String(item?.id || `${normalizedType.toLowerCase()}_${Date.now()}_${index}`),
      ...normalizedRect,
      rect: normalizedRect,
      type: normalizedType,
      category: String(item?.category || (normalizedType === 'MANUAL' ? 'PII_CUSTOM' : 'SENSITIVE_TEXT')),
      label: String(item?.label || (normalizedType === 'MANUAL' ? `[REDACTED_MANUAL_${index + 1}]` : `<${item?.category || 'REDACTED'}>`)),
      active: item?.active !== false,
      isUserAdded: Boolean(item?.isUserAdded || normalizedType === 'MANUAL'),
      source: item?.source || (normalizedType === 'MANUAL' ? 'user' : 'unknown'),
      confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : (normalizedType === 'MANUAL' ? 1 : 0)
    };
  }

  function createRedactionState(autoDetections = [], manualDetections = []) {
    return {
      autoDetections: autoDetections.map((item, index) => makeBoundingBox(item, index, item?.type || 'VISUAL')),
      manualDetections: manualDetections.map((item, index) => makeBoundingBox(item, index, 'MANUAL')),
      mergedActiveMasks: []
    };
  }

  function mergeRedactionState(state) {
    const auto = (state?.autoDetections || []).map((item, index) => makeBoundingBox(item, index, item?.type || 'VISUAL'));
    const manual = (state?.manualDetections || []).map((item, index) => makeBoundingBox(item, index, 'MANUAL'));
    const mergedActiveMasks = [...auto, ...manual].filter((item) => item.active && item.width > 1 && item.height > 1);
    return { autoDetections: auto, manualDetections: manual, mergedActiveMasks };
  }

  function manualLabel(mask, index) { return mask.label || `[REDACTED_MANUAL_${index + 1}]`; }

  function applyMasksToPage(page, masks) {
    const activeManual = masks.filter((item) => item.type === 'MANUAL' && item.active);
    if (!activeManual.length) return page;
    const replacement = (value, item, index) => ({ ...value, text: manualLabel(item, index), redactedBy: item.id });
    const textBlocks = (page.textBlocks || []).map((block) => {
      const index = activeManual.findIndex((item) => intersects(item, block.rect));
      return index >= 0 ? replacement(block, activeManual[index], index) : block;
    });
    const elements = (page.elements || []).map((element) => {
      const index = activeManual.findIndex((item) => intersects(item, element.rect));
      if (index < 0) return element;
      const label = manualLabel(activeManual[index], index);
      return { ...element, label, value: element.value ? label : element.value, redactedBy: activeManual[index].id };
    });
    return { ...page, textBlocks, elements };
  }

  function redactCanvas(ctx, imageSize, viewport, masks, ratio = 1, padding = 0) {
    if (!ctx) return;
    const scaleX = imageSize.width / Math.max(1, viewport.width) * ratio;
    const scaleY = imageSize.height / Math.max(1, viewport.height) * ratio;
    ctx.fillStyle = '#000000';
    for (const mask of masks.filter((item) => item.active)) {
      const x = Math.max(0, mask.x * scaleX - padding);
      const y = Math.max(0, mask.y * scaleY - padding);
      const width = Math.min(imageSize.width * ratio - x, mask.width * scaleX + padding * 2);
      const height = Math.min(imageSize.height * ratio - y, mask.height * scaleY + padding * 2);
      if (width > 0 && height > 0) ctx.fillRect(x, y, width, height);
    }
  }

  globalThis.PrivvyRedaction = { rect, intersects, makeBoundingBox, createRedactionState, mergeRedactionState, applyMasksToPage, redactCanvas };
})();
