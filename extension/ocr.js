(() => {
  const OCR_PATTERNS = [
    { category: 'EMAIL', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { category: 'PHONE', regex: /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g },
    { category: 'AADHAAR_LIKE', regex: /(?<!\d)(?<!\d[ -])\d{4}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g },
    { category: 'PAN_LIKE', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/gi },
    { category: 'PASSPORT', regex: /\b[A-Z][0-9]{7}\b/gi },
    { category: 'CARD_LIKE', regex: /(?<!\d)(?:\d{13,19}|(?:\d{3,6}[ -]){2,5}\d{3,6})(?!\d)/g, validator: validPaymentCard },
    { category: 'IP_ADDRESS', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { category: 'DOB', regex: /\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:19|20)\d{2}\b/g }
  ];

  const LABEL_VALUE_PATTERNS = [
    { category: 'PERSON', regex: /\b(?:full\s+name|applicant\s+name|patient\s+name|name)\s*[:\-]\s*(.{2,80})$/i },
    { category: 'ADDRESS', regex: /\b(?:postal\s+address|residential\s+address|address)\s*[:\-]\s*(.{4,160})$/i },
    { category: 'DOB', regex: /\b(?:date\s+of\s+birth|birth\s+date|dob)\s*[:\-]\s*(.{4,40})$/i },
    { category: 'PASSPORT', regex: /\b(?:passport(?:\s+number|\s+no\.?)?)\s*[:\-]\s*(.{2,40})$/i },
    { category: 'CARD_LIKE', regex: /\b(?:card(?:\s+number|\s+no\.?)?|credit\s+card|debit\s+card)\s*[:\-]\s*(.{4,40})$/i },
    { category: 'AADHAAR_LIKE', regex: /\b(?:aadhaar|aadhar)(?:\s+number|\s+no\.?)?\s*[:\-]\s*(.{4,40})$/i }
  ];

  function validPaymentCard(value) {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let doubleDigit = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      let digit = Number(digits[index]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  }

  function wordsFromBlocks(blocks) {
    const lines = [];
    for (const block of blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          if (Array.isArray(line.words) && line.words.length) lines.push(line.words);
        }
      }
    }
    return lines;
  }

  function lineIndex(words) {
    let text = '';
    const indexed = [];
    for (const word of words) {
      const value = String(word.text || '').trim();
      if (!value || !word.bbox) continue;
      if (text) text += ' ';
      const start = text.length;
      text += value;
      indexed.push({ word, start, end: text.length });
    }
    return { text, indexed };
  }

  function unionWordBoxes(indexed, start, end) {
    const selected = indexed.filter((item) => item.end > start && item.start < end);
    if (!selected.length) return null;
    const x0 = Math.min(...selected.map((item) => Number(item.word.bbox.x0)));
    const y0 = Math.min(...selected.map((item) => Number(item.word.bbox.y0)));
    const x1 = Math.max(...selected.map((item) => Number(item.word.bbox.x1)));
    const y1 = Math.max(...selected.map((item) => Number(item.word.bbox.y1)));
    if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
    const confidence = selected.reduce((sum, item) => sum + Number(item.word.confidence || 0), 0) / selected.length;
    return { bbox: { x0, y0, x1, y1 }, confidence };
  }

  function collectMatches(text) {
    const matches = [];
    for (const pattern of OCR_PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (const match of text.matchAll(pattern.regex)) {
        if (pattern.validator && !pattern.validator(match[0])) continue;
        matches.push({ category: pattern.category, value: match[0], start: match.index, end: match.index + match[0].length });
      }
    }
    for (const pattern of LABEL_VALUE_PATTERNS) {
      const match = pattern.regex.exec(text);
      const value = match?.[1]?.trim();
      if (!value) continue;
      const relative = match[0].lastIndexOf(match[1]);
      const start = (match.index || 0) + Math.max(0, relative) + (match[1].length - match[1].trimStart().length);
      matches.push({ category: pattern.category, value, start, end: start + value.length });
    }
    const preferred = matches.filter((match) => !(
      match.category === 'AADHAAR_LIKE' && matches.some((candidate) => (
        candidate.category === 'CARD_LIKE' && candidate.start <= match.start && candidate.end >= match.end
      ))
    ));
    const seen = new Set();
    return preferred.filter((match) => {
      const key = `${match.category}:${match.start}:${match.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function extractSensitiveOcr(blocks, imageSize, viewport) {
    const scaleX = Number(viewport?.width || imageSize.width) / imageSize.width;
    const scaleY = Number(viewport?.height || imageSize.height) / imageSize.height;
    const detections = [];
    const rawTerms = new Set();

    for (const words of wordsFromBlocks(blocks)) {
      const line = lineIndex(words);
      for (const match of collectMatches(line.text)) {
        const region = unionWordBoxes(line.indexed, match.start, match.end);
        if (!region) continue;
        rawTerms.add(match.value);
        detections.push({
          category: match.category,
          source: 'local-ocr',
          confidence: Math.max(0, Math.min(1, region.confidence / 100)),
          coordinateSpace: 'css-viewport',
          rect: {
            x: region.bbox.x0 * scaleX,
            y: region.bbox.y0 * scaleY,
            width: (region.bbox.x1 - region.bbox.x0) * scaleX,
            height: (region.bbox.y1 - region.bbox.y0) * scaleY
          }
        });
      }
    }

    return { detections, rawTerms: Array.from(rawTerms) };
  }

  class LocalOcrDetector {
    constructor() {
      this.worker = null;
      this.initializing = null;
    }

    async initialize() {
      if (this.worker) return this.worker;
      if (this.initializing) return this.initializing;
      this.initializing = this.createWorker();
      try {
        this.worker = await this.initializing;
        return this.worker;
      } finally {
        this.initializing = null;
      }
    }

    async createWorker() {
      if (!globalThis.Tesseract?.createWorker) throw new Error('The packaged Tesseract runtime did not load.');
      const getUrl = globalThis.chrome?.runtime?.getURL || globalThis.browser?.runtime?.getURL;
      if (!getUrl) throw new Error('Extension resource URLs are unavailable.');
      const baseUrl = getUrl.call(globalThis.chrome?.runtime || globalThis.browser.runtime, '');
      return globalThis.Tesseract.createWorker('eng', 1, {
        workerPath: `${baseUrl}tesseract.worker.min.js`,
        corePath: baseUrl,
        langPath: baseUrl,
        workerBlobURL: false,
        cacheMethod: 'readOnly'
      });
    }

    async detect(dataUrl, viewport) {
      const started = performance.now();
      const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const imageSize = { width: image.width, height: image.height };
      image.close();
      const worker = await this.initialize();
      const result = await worker.recognize(dataUrl, {}, { text: true, blocks: true });
      const sensitive = extractSensitiveOcr(result.data.blocks, imageSize, viewport);
      return {
        ...sensitive,
        engine: 'Tesseract.js 7 (local WASM)',
        ms: Math.round((performance.now() - started) * 10) / 10
      };
    }
  }

  globalThis.PrivvyOCR = { LocalOcrDetector, extractSensitiveOcr, collectMatches };
})();
