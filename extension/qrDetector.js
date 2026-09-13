(() => {
  const FORMATS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'pdf417'];
  const TILE_COLUMNS = 3;
  const TILE_ROWS = 2;
  const TILE_SCALE = 2;

  function canvas(width, height) {
    if (typeof document !== 'undefined') {
      const element = document.createElement('canvas'); element.width = width; element.height = height;
      return element;
    }
    return new OffscreenCanvas(width, height);
  }

  function overlap(a, b) {
    const left = Math.max(a.x, b.x); const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width); const bottom = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const union = a.width * a.height + b.width * b.height - intersection;
    return union ? intersection / union : 0;
  }

  function toViewportRect(rect, imageSize, viewport) {
    return globalThis.PrivvyGeometry.screenshotRectToViewport(rect, imageSize, viewport);
  }

  function verifiedDetection(rect, imageSize, viewport, source, format, index) {
    return {
      id: `qr_${source.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${index + 1}`,
      type: 'QR', category: 'QR_BARCODE', label: '[QR_REDACTED]', active: true,
      isUserAdded: false, verified: true, source, format: String(format || 'unknown').toLowerCase(),
      confidence: 1, coordinateSpace: 'css-viewport', rect: toViewportRect(rect, imageSize, viewport)
    };
  }

  function dedupe(detections) {
    return detections.filter((item, index, all) => !all.slice(0, index).some((other) => overlap(item.rect, other.rect) > 0.55));
  }

  function supportedNativeFormats() {
    if (typeof BarcodeDetector === 'undefined') return Promise.resolve([]);
    if (typeof BarcodeDetector.getSupportedFormats !== 'function') return Promise.resolve(FORMATS);
    return BarcodeDetector.getSupportedFormats().then((supported) => FORMATS.filter((format) => supported.includes(format))).catch(() => FORMATS);
  }

  function tileRects(imageSize) {
    const tiles = [];
    for (let row = 0; row < TILE_ROWS; row += 1) for (let column = 0; column < TILE_COLUMNS; column += 1) {
      const left = Math.floor(column * imageSize.width / TILE_COLUMNS);
      const top = Math.floor(row * imageSize.height / TILE_ROWS);
      const right = Math.ceil((column + 1) * imageSize.width / TILE_COLUMNS);
      const bottom = Math.ceil((row + 1) * imageSize.height / TILE_ROWS);
      tiles.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
    return tiles;
  }

  function crop(image, tile) {
    const result = canvas(tile.width * TILE_SCALE, tile.height * TILE_SCALE);
    const context = result.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, tile.x, tile.y, tile.width, tile.height, 0, 0, result.width, result.height);
    return result;
  }

  function rectFromPoints(result, bounds) {
    const points = result?.getResultPoints?.() || [];
    const values = points.map((point) => ({ x: Number(point.getX?.() ?? point.x), y: Number(point.getY?.() ?? point.y) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (values.length < 2) return null;
    const left = Math.max(0, Math.min(...values.map((point) => point.x)));
    const top = Math.max(0, Math.min(...values.map((point) => point.y)));
    const right = Math.min(bounds.width, Math.max(...values.map((point) => point.x)));
    const bottom = Math.min(bounds.height, Math.max(...values.map((point) => point.y)));
    const width = right - left;
    const height = Math.max(12, bottom - top);
    return width > 1 ? { x: left, y: Math.max(0, top - 6), width, height: Math.min(bounds.height - Math.max(0, top - 6), height + 12) } : null;
  }

  async function detectNative(image, imageSize, viewport) {
    if (typeof BarcodeDetector === 'undefined') return { detections: [], available: false };
    const formats = await supportedNativeFormats();
    if (!formats.length) return { detections: [], available: false };
    const detector = new BarcodeDetector({ formats });
    const detections = [];
    const addCodes = async (source, offset = { x: 0, y: 0 }, scale = 1) => {
      const codes = await detector.detect(source);
      for (const code of codes) {
        const box = code.boundingBox;
        if (!box || box.width <= 1 || box.height <= 1) continue;
        detections.push(verifiedDetection({ x: offset.x + box.x / scale, y: offset.y + box.y / scale, width: box.width / scale, height: box.height / scale }, imageSize, viewport, 'local-barcode-detector', code.format, detections.length));
      }
    };
    await addCodes(image);
    for (const tile of tileRects(imageSize)) await addCodes(crop(image, tile), tile, TILE_SCALE);
    return { detections: dedupe(detections), available: true };
  }

  async function detectZxing(image, imageSize, viewport) {
    if (!globalThis.ZXingBrowser?.BrowserMultiFormatReader) return [];
    const reader = new globalThis.ZXingBrowser.BrowserMultiFormatReader();
    const detections = [];
    const decode = (source, offset = { x: 0, y: 0 }, scale = 1) => {
      try {
        const result = reader.decodeFromCanvas(source);
        const localRect = rectFromPoints(result, { width: source.width, height: source.height });
        if (!localRect) return;
        const format = result?.getBarcodeFormat?.() || 'unknown';
        detections.push(verifiedDetection({ x: offset.x + localRect.x / scale, y: offset.y + localRect.y / scale, width: localRect.width / scale, height: localRect.height / scale }, imageSize, viewport, 'local-zxing-decoder', format, detections.length));
      } catch (_error) {
        // Decode failures are expected for tiles that do not contain a code.
      }
    };
    const full = canvas(imageSize.width, imageSize.height); full.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0);
    decode(full);
    for (const tile of tileRects(imageSize)) decode(crop(image, tile), tile, TILE_SCALE);
    return dedupe(detections);
  }

  async function detect(dataUrl, viewport) {
    const started = performance.now();
    const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const imageSize = { width: image.width, height: image.height };
    try {
      let native;
      try { native = await detectNative(image, imageSize, viewport); } catch (error) { console.warn('[Privvy QR] Native detector failed:', error.message); native = { detections: [], available: false }; }
      const detections = native.detections.length ? native.detections : await detectZxing(image, imageSize, viewport);
      return {
        detections,
        engine: native.detections.length ? 'BarcodeDetector (full + tiles)' : globalThis.ZXingBrowser?.BrowserMultiFormatReader ? 'ZXing (full + tiles)' : 'unavailable',
        ms: Math.round(performance.now() - started)
      };
    } finally {
      image.close();
    }
  }

  globalThis.PrivvyQrDetector = { FORMATS, dedupe, rectFromPoints, verifiedDetection, detect };
})();
