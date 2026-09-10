(() => {
  async function detect(dataUrl, viewport) {
    if (typeof BarcodeDetector === 'undefined') return { detections: [], engine: 'unavailable', ms: 0 };
    const started = performance.now();
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'pdf417'] });
      const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const codes = await detector.detect(image); const imageSize = { width: image.width, height: image.height }; image.close();
      const detections = codes.map((code, index) => ({ id: `qr_${index + 1}`, type: 'QR', category: 'QR_BARCODE', label: '[QR_REDACTED]', active: true, isUserAdded: false, source: 'local-qr-detector', confidence: 1, coordinateSpace: 'css-viewport', rect: { x: code.boundingBox.x * viewport.width / imageSize.width, y: code.boundingBox.y * viewport.height / imageSize.height, width: code.boundingBox.width * viewport.width / imageSize.width, height: code.boundingBox.height * viewport.height / imageSize.height } }));
      return { detections, engine: 'BarcodeDetector', ms: Math.round(performance.now() - started) };
    } catch (error) { console.warn('[Privvy QR] Local detector unavailable:', error.message); return { detections: [], engine: 'unavailable', ms: Math.round(performance.now() - started) }; }
  }
  globalThis.PrivvyQrDetector = { detect };
})();
