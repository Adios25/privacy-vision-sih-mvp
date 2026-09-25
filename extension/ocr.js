(() => {
  const OCR_PATTERNS = [
    { category: 'EMAIL', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { category: 'PHONE', regex: /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g },
    { category: 'AADHAAR_LIKE', regex: /(?<!\d)(?<!\d[ -])\d{4}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g },
    { category: 'PAN_LIKE', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/gi },
    { category: 'PASSPORT', regex: /\b[A-Z][0-9]{7}\b/gi },
    { category: 'CARD_LIKE', regex: /(?<!\d)(?:\d{13,19}|(?:\d{3,6}[ -]){2,5}\d{3,6})(?!\d)/g, validator: validPaymentCard },
    { category: 'IP_ADDRESS', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { category: 'DOB', regex: /\b(?:0?[1-9]|[12]\d|3[01])[\/\.\-](?:0?[1-9]|1[0-2])[\/\.\-](?:19|20)\d{2}\b/g },
    { category: 'VOTER_ID', regex: /\b[A-Z]{3}\d{7}\b/gi },
    { category: 'GSTIN', regex: /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/gi },
    { category: 'DL_NUMBER', regex: /\b[A-Z]{2}[\s-]?\d{2}[\s-]?\d{4}[\s-]?\d{7}\b/gi },
    { category: 'UPI_ID', regex: /\b[A-Z0-9.\-_]{2,256}@[A-Z]{2,64}\b/gi },
    { category: 'BANK_ACCOUNT', regex: /\b\d{9,18}\b/g },
    { category: 'VEHICLE_REG', regex: /\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{4}\b/gi }
  ];

  const LABEL_VALUE_PATTERNS = [
    { category: 'PERSON', regex: /\b(?:full\s+name|applicant\s+name|patient\s+name|name)(?:\s*:\s*|\s+-\s+)(.{2,80})$/i },
    { category: 'ADDRESS', regex: /\b(?:postal\s+address|residential\s+address|address)(?:\s*:\s*|\s+-\s+)(.{4,160})$/i },
    { category: 'DOB', regex: /\b(?:date\s+of\s+birth|birth\s+date|dob)(?:\s*:\s*|\s+-\s+)(.{4,40})$/i },
    { category: 'PASSPORT', regex: /\b(?:passport(?:\s+number|\s+no\.?)?)(?:\s*:\s*|\s+-\s+)(.{2,40})$/i },
    { category: 'CARD_LIKE', regex: /\b(?:card(?:\s+number|\s+no\.?)?|credit\s+card|debit\s+card)(?:\s*:\s*|\s+-\s+)(.{4,40})$/i },
    { category: 'AADHAAR_LIKE', regex: /\b(?:aadhaar|aadhar)(?:\s+number|\s+no\.?)?(?:\s*:\s*|\s+-\s+)(.{4,40})$/i },
    { category: 'VOTER_ID', regex: /\b(?:voter\s+id|epic\s+number|election\s+card)(?:\s*:\s*|\s+-\s+)(.{2,40})$/i },
    { category: 'GSTIN', regex: /\b(?:gstin|gst\s+number)(?:\s*:\s*|\s+-\s+)(.{4,20})$/i },
    { category: 'DL_NUMBER', regex: /\b(?:driving\s+licen[sc]e|dl\s+number|licence\s+number)(?:\s*:\s*|\s+-\s+)(.{4,40})$/i },
    { category: 'UPI_ID', regex: /\b(?:upi|vpa|upi\s+id|payment\s+address)(?:\s*:\s*|\s+-\s+)(.{4,60})$/i },
    { category: 'BANK_ACCOUNT', regex: /\b(?:account\s+number|bank\s+account|a\/c\s+no)(?:\s*:\s*|\s+-\s+)(.{8,20})$/i },
    { category: 'VEHICLE_REG', regex: /\b(?:vehicle\s+number|registration\s+number|reg\s+no)(?:\s*:\s*|\s+-\s+)(.{4,20})$/i }
    ,{ category: 'PERSON', regex: /(?:नाम|पूरा\s+नाम|आवेदक\s+का\s+नाम|पिता\s+का\s+नाम)\s*(?:[:\-]\s*|है\s+)(.{2,80})$/u }
    ,{ category: 'ADDRESS', regex: /(?:पता|स्थायी\s+पता|निवास\s+का\s+पता)\s*(?:[:\-]\s*|है\s+)(.{4,160})$/u }
    ,{ category: 'DOB', regex: /(?:जन्म\s+तिथि|जन्म\s+दिनांक|जन्म)\s*(?:[:\-]\s*|है\s+)(.{4,40})$/u }
    ,{ category: 'AADHAAR_LIKE', regex: /(?:आधार\s+(?:संख्या|नंबर|क्रमांक))\s*(?:[:\-]\s*|है\s+)(.{4,40})$/u }
    ,{ category: 'PAN_LIKE', regex: /(?:पैन\s+(?:संख्या|नंबर|क्रमांक))\s*(?:[:\-]\s*|है\s+)(.{4,20})$/u }
  ];

  const DEVANAGARI_DIGITS = String.fromCodePoint(...Array.from('०१२३४५६७८९').map((digit) => digit.codePointAt(0)));
  function normalizeIndicDigits(value) {
    return String(value || '').replace(/[०-९]/gu, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)));
  }

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
      for (const match of collectMatches(normalizeIndicDigits(line.text))) {
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
      return globalThis.Tesseract.createWorker('eng+hin', 1, {
        workerPath: `${baseUrl}tesseract-worker.min.js`,
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
      const worker = await this.initialize();
      const passes = [{ source: dataUrl, scale: 1, label: 'native' }];
      const upscale = Math.min(2, 1600 / Math.max(image.width, image.height));
      if (upscale > 1.05) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * upscale);
        canvas.height = Math.round(image.height * upscale);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.filter = 'grayscale(1) contrast(1.25)';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        passes.push({ source: canvas.toDataURL('image/png'), scale: upscale, label: 'upscaled' });
        canvas.width = 1;
        canvas.height = 1;
      }
      image.close();

      const detections = [];
      const rawTerms = new Set();
      for (const pass of passes) {
        const result = await worker.recognize(pass.source, {}, { text: true, blocks: true });
        const passSize = { width: imageSize.width * pass.scale, height: imageSize.height * pass.scale };
        const sensitive = extractSensitiveOcr(result.data.blocks, passSize, viewport);
        for (const detection of sensitive.detections) {
          detection.rect.x /= pass.scale;
          detection.rect.y /= pass.scale;
          detection.rect.width /= pass.scale;
          detection.rect.height /= pass.scale;
          detection.source = `local-ocr-${pass.label}`;
          detections.push(detection);
        }
        for (const term of sensitive.rawTerms) rawTerms.add(term);
      }

      const unique = detections.filter((item, index, items) => !items.some((other, otherIndex) => (
        otherIndex < index && other.category === item.category
          && overlap(other.rect, item.rect) > 0.55
          && other.confidence >= item.confidence
      )));
      return {
        detections: unique,
        rawTerms: Array.from(rawTerms),
        engine: 'Tesseract.js 7 (English + Hindi, local WASM)',
        passes: passes.length,
        ms: Math.round((performance.now() - started) * 10) / 10
      };
    }
  }

  function overlap(a, b) {
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
  }

  globalThis.PrivvyOCR = { LocalOcrDetector, extractSensitiveOcr, collectMatches };
})();
