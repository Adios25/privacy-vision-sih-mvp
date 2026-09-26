(() => {
  const CONTENT_VERSION = '1.3.5';
  if (globalThis.__privvyContentVersion === CONTENT_VERSION) return;
  globalThis.__privvyContentVersion = CONTENT_VERSION;

  const api = globalThis.browser || globalThis.chrome;
  const OVERLAY_ID = 'privacy-vision-sih-overlay';
  const PATTERNS = [
    { category: 'EMAIL', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { category: 'PHONE', regex: /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g },
    { category: 'AADHAAR_LIKE', regex: /(?<!\d)(?<!\d[ -])\d{4}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)/g },
    { category: 'PAN_LIKE', regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
    { category: 'IFSC_LIKE', regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, validator: (value) => globalThis.PrivvyIndiaPii?.validIfsc(value) !== false },
    { category: 'PASSPORT', regex: /\b[A-Z][0-9]{7}\b/g },
    { category: 'CARD_LIKE', regex: /(?<!\d)(?:\d{13,19}|(?:\d{3,6}[ -]){2,5}\d{3,6})(?!\d)/g, validator: validPaymentCard },
    { category: 'IP_ADDRESS', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { category: 'VOTER_ID', regex: /\b[A-Z]{3}\d{7}\b/g },
    { category: 'GSTIN', regex: /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/gi },
    { category: 'DL_NUMBER', regex: /\b[A-Z]{2}[\s-]?\d{2}[\s-]?\d{4}[\s-]?\d{7}\b/gi },
    { category: 'UPI_ID', regex: /\b[A-Z0-9.\-_]{2,256}@[A-Z]{2,64}\b/gi },
    { category: 'BANK_ACCOUNT', regex: /\b\d{9,18}\b/g },
    { category: 'VEHICLE_REG', regex: /\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{4}\b/gi }
  ];

  const PURPOSE_RULES = [
    ['email', 'EMAIL', /(e-?mail)/],
    ['phone', 'PHONE', /(phone|mobile|telephone|contact number|\btel\b)/],
    ['aadhaar', 'AADHAAR_LIKE', /(aadhaar|aadhar)/],
    ['passport', 'PASSPORT', /passport/],
    ['dob', 'DOB', /(date of birth|birth date|\bdob\b|birthday)/],
    ['address', 'ADDRESS', /(address|street|postal|residential)/],
    ['card', 'CARD_LIKE', /(card number|credit card|debit card|payment card)/],
    ['name', 'PERSON', /(full name|applicant name|patient name|candidate name|your name)/],
    ['voter_id', 'VOTER_ID', /(voter id|epic number|election card)/],
    ['gstin', 'GSTIN', /(gstin|gst number|gstin number)/],
    ['dl_number', 'DL_NUMBER', /(driving licen[sc]e|dl number|licence number)/],
    ['upi_id', 'UPI_ID', /(upi|vpa|upi id|payment address)/],
    ['bank_account', 'BANK_ACCOUNT', /(account number|bank account|a\/c no)/],
    ['vehicle_reg', 'VEHICLE_REG', /(vehicle number|registration number|reg no|vehicle reg)/]
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

  let lastScan = null;

  function rendered(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return element.isConnected && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
  }

  function visible(element) {
    if (!rendered(element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth;
  }

  function clippedBox(rect) {
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  function labelFor(element) {
    const aria = element.getAttribute('aria-label');
    if (aria) return aria.trim();
    if (element.labels?.length) return Array.from(element.labels).map((label) => label.innerText.trim()).filter(Boolean).join(' ');
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return label.innerText.trim();
    }
    const parentLabel = element.closest('label');
    if (parentLabel) return parentLabel.innerText.trim();
    return element.innerText?.trim() || element.getAttribute('placeholder') || element.getAttribute('name') || element.tagName.toLowerCase();
  }

  function nearbyContext(element) {
    const own = `${labelFor(element)} ${element.getAttribute('name') || ''} ${element.getAttribute('id') || ''} ${element.getAttribute('autocomplete') || ''} ${element.getAttribute('alt') || ''} ${element.getAttribute('aria-label') || ''}`;
    const row = element.closest('div, li, tr, section');
    const dt = row?.querySelector('dt');
    return `${own} ${dt?.innerText || ''}`.trim();
  }

  function inferPurpose(context, element) {
    const lowered = String(context || '').toLowerCase();
    if (element instanceof HTMLInputElement) {
      if (element.type === 'email') return { purpose: 'email', category: 'EMAIL' };
      if (element.type === 'tel') return { purpose: 'phone', category: 'PHONE' };
      if (element.type === 'date') return { purpose: 'dob', category: 'DOB' };
    }
    for (const [purpose, category, regex] of PURPOSE_RULES) {
      if (regex.test(lowered)) return { purpose, category };
    }
    return null;
  }

  function roleFor(element) {
    return element.getAttribute('role') || ({
      A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox',
      INPUT: element.type === 'checkbox' ? 'checkbox' : element.type === 'radio' ? 'radio' : 'textbox'
    }[element.tagName] || element.tagName.toLowerCase());
  }

  function token(category, counters) {
    counters[category] = (counters[category] || 0) + 1;
    return `<${category}_${counters[category]}>`;
  }

  function sanitizePatterns(value, counters, rawTerms) {
    let output = String(value || '');
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      output = output.replace(pattern.regex, (match) => {
        if (pattern.validator && !pattern.validator(match)) return match;
        rawTerms.add(match);
        return token(pattern.category, counters);
      });
    }
    return output;
  }

  function confidenceForCategory(category, value, context = '') {
    const validator = globalThis.PrivvyIndiaPii;
    const identityContext = /aadhaar|aadhar|identity/i.test(context) || context.toLowerCase().includes(['k', 'y', 'c'].join(''));
    if (category === 'AADHAAR_LIKE') return validator?.validVerhoeff(value) ? 0.99 : (identityContext ? 0.9 : 0.78);
    if (category === 'PAN_LIKE') return validator?.validPan(value) && validator.panHolderType(value) ? 0.99 : (/pan|tax|identity/i.test(context) || identityContext ? 0.88 : 0.76);
    if (category === 'IFSC_LIKE') return validator?.validIfsc(value) ? 0.97 : 0.7;
    return 0.98;
  }

  function sanitizeControlValue(element, purposeInfo, counters, rawTerms) {
    const value = String(element.value || '');
    if (!value.trim()) return '';
    rawTerms.add(value);
    if (purposeInfo) return token(purposeInfo.category, counters);
    const patterned = sanitizePatterns(value, counters, rawTerms);
    if (patterned !== value) return patterned;
    return token('USER_INPUT', counters);
  }

  function semanticTextContext(element) {
    if (element.matches('dd')) return element.previousElementSibling?.innerText || element.parentElement?.querySelector('dt')?.innerText || '';
    if (element.hasAttribute('data-record-purpose')) return element.getAttribute('data-record-purpose') || '';
    return '';
  }

  function collectTextBlocks(counters, rawTerms, detections) {
    const blocks = [];
    const nodes = globalThis.PrivvyShadowWalker?.textNodes(document) || (() => { const result = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (walker.nextNode()) result.push(walker.currentNode); return result; })();
    for (const node of nodes) {
      const parent = node.parentElement;
      if (blocks.length >= 100) break;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(parent.tagName) || !visible(parent) || !node.textContent?.trim()) continue;
      const original = node.textContent.trim();
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const context = semanticTextContext(parent);
      const purposeInfo = context ? inferPurpose(context, parent) : null;
      let sanitized = sanitizePatterns(original, counters, rawTerms);
      if (purposeInfo && sanitized === original) {
        rawTerms.add(original);
        sanitized = token(purposeInfo.category, counters);
      }
      if (sanitized !== original) {
        const matchedCategories = [...sanitized.matchAll(/<([A-Z_]+)_\d+>/g)].map((match) => match[1]);
        for (const category of matchedCategories) detections.push({ category, source: purposeInfo ? 'semantic-text' : 'local-pattern', confidence: purposeInfo ? 0.92 : confidenceForCategory(category, original, `${context} ${parent?.innerText || ''}`), shadowRoot: Boolean(node.__privvyInOpenShadow), coordinateSpace: 'css-viewport', rect: clippedBox(rect) });
      }
      blocks.push({ text: sanitized.slice(0, 280), rect: clippedBox(rect), shadowRoot: Boolean(node.__privvyInOpenShadow) });
    }
    return blocks;
  }

  function collectElements(counters, rawTerms, detections) {
    const selectors = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [tabindex]';
    const isSyntheticCompletionControl = (element) => (
      element instanceof HTMLButtonElement
      && element.type === 'submit'
      && rendered(element)
      && isSyntheticSafeTest()
    );
    // The redacted image remains viewport-only, while the local synthetic
    // completion control is retained in the sanitized graph even below the
    // fold so an explicitly approved task can finish after safe field fills.
    const nodes = (globalThis.PrivvyShadowWalker?.elements(document, selectors) || Array.from(document.querySelectorAll(selectors)))
      .filter((element) => visible(element) || isSyntheticCompletionControl(element))
      .slice(0, 160);
    const targetMap = new Map();
    const elements = nodes.map((element, index) => {
      const id = `e${index + 1}`;
      targetMap.set(id, element);
      const label = labelFor(element);
      const purposeInfo = inferPurpose(nearbyContext(element), element);
      const rect = clippedBox(element.getBoundingClientRect());
      let value = '';
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        value = sanitizeControlValue(element, purposeInfo, counters, rawTerms);
        if (element.value.trim() && purposeInfo) {
          detections.push({
            category: purposeInfo.category,
            source: 'editable-value',
            confidence: 0.96,
            coordinateSpace: 'css-viewport',
            rect
          });
        }
      } else if (element instanceof HTMLSelectElement) {
        value = sanitizePatterns(element.value, counters, rawTerms);
      } else {
        value = sanitizePatterns(element.innerText?.trim() || '', counters, rawTerms);
      }
      const isSubmitControl = (
        (element instanceof HTMLButtonElement && element.type === 'submit')
        || (element instanceof HTMLInputElement && element.type === 'submit')
      );
      const type = element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase();
      const text = `${label} ${element.innerText || ''}`.toLowerCase();
      const risk = type === 'file' ? 'UPLOAD'
        : type === 'password' ? 'PASSWORD'
          : isSubmitControl || /submit|complete|confirm|pay|delete|agree/.test(text) ? 'HIGH_RISK'
            : purposeInfo?.category || null;
      return {
        id,
        role: roleFor(element),
        label: sanitizePatterns(label, counters, rawTerms),
        value,
        inputType: type,
        purpose: purposeInfo?.purpose || null,
        required: Boolean(element.required || element.getAttribute('aria-required') === 'true'),
        enabled: !element.disabled,
        risk,
        shadowRoot: Boolean(element.__privvyInOpenShadow),
        rect
      };
    });
    return { elements, targetMap };
  }

  function collectVisualSemantics(detections) {
    const visuals = globalThis.PrivvyShadowWalker?.elements(document, 'img, canvas, svg, [role="img"], [data-visual-purpose]') || document.querySelectorAll('img, canvas, svg, [role="img"], [data-visual-purpose]');
    for (const element of visuals) {
      if (!visible(element)) continue;
      const directContext = `${element.getAttribute('alt') || ''} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-visual-purpose') || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('name') || ''} ${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase();
      const context = `${element.getAttribute('alt') || ''} ${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-visual-purpose') || ''} ${element.parentElement?.innerText || ''}`.toLowerCase();
      const category = context.includes('face') || context.includes('portrait') ? 'FACE'
        : context.includes('signature') ? 'SIGNATURE'
          : context.includes('aadhaar') || context.includes('identity document') ? 'IDENTITY_DOCUMENT'
            : isExplicitQrVisual(element, directContext) ? 'QR_BARCODE' : null;
      if (category) detections.push({
        category, source: 'visual-semantic', confidence: 0.88, coordinateSpace: 'css-viewport', rect: clippedBox(element.getBoundingClientRect()),
        ...(category === 'QR_BARCODE' ? { type: 'VISUAL', verified: false, active: false } : {})
      });
    }
  }

  function isExplicitQrVisual(element, directContext) {
    const tagName = element.tagName;
    if (tagName !== 'IMG' && tagName !== 'CANVAS') return false;
    if (!/\b(?:qr(?:\s+code)?|barcode)\b/.test(directContext)) return false;
    return !/\b(?:logo|generator|scanner|scan|menu|navigation|icon)\b/.test(directContext);
  }

  function intersectionOverUnion(a, b) {
    const left = Math.max(a.x, b.x); const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width); const bottom = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const union = a.width * a.height + b.width * b.height - intersection;
    return union ? intersection / union : 0;
  }

  function deduplicateDetections(items) {
    const sorted = items.filter((item) => item.rect.width > 1 && item.rect.height > 1).sort((a, b) => b.confidence - a.confidence);
    const output = [];
    for (const item of sorted) {
      if (!output.some((existing) => existing.category === item.category && intersectionOverUnion(existing.rect, item.rect) > 0.55)) output.push(item);
    }
    return output.slice(0, 100);
  }

  function fingerprint() {
    const nodes = (globalThis.PrivvyShadowWalker?.elements(document, 'a[href], button, input, textarea, select, [role="button"], [role="link"]') || Array.from(document.querySelectorAll('a[href], button, input, textarea, select, [role="button"], [role="link"]'))).filter(visible).slice(0, 160);
    return nodes.map((element) => `${element.tagName}|${element.id}|${element.getAttribute('name') || ''}|${labelFor(element)}|${'value' in element ? element.value : element.innerText || ''}|${element.disabled}`).join('\n');
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return `fnv1a:${(result >>> 0).toString(16).padStart(8, '0')}`;
  }

  function scanPage() {
    const started = performance.now();
    const counters = {};
    const rawTerms = new Set();
    const detections = [];
    const textStart = performance.now();
    const textBlocks = collectTextBlocks(counters, rawTerms, detections);
    const textMs = performance.now() - textStart;
    const graphStart = performance.now();
    const { elements, targetMap } = collectElements(counters, rawTerms, detections);
    collectVisualSemantics(detections);
    const graphMs = performance.now() - graphStart;
    const uniqueDetections = deduplicateDetections(detections);
    const categoryCounts = uniqueDetections.reduce((summary, item) => {
      summary[item.category] = (summary[item.category] || 0) + 1;
      return summary;
    }, {});
    const stateHash = hash(fingerprint());
    const scanId = crypto.randomUUID();
    lastScan = { scanId, stateHash, targetMap };
    document.getElementById(OVERLAY_ID)?.remove();
    return {
      scanId,
      stateHash,
      page: {
        title: sanitizePatterns(document.title, counters, rawTerms),
        urlClass: location.hostname || 'local-page',
        viewport: [innerWidth, innerHeight],
        elements,
        textBlocks,
        categoryCounts
      },
      detections: uniqueDetections,
      rawTerms: Array.from(rawTerms).filter((term) => term.trim().length >= 2).slice(0, 200),
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      clientMetrics: {
        textMs: Math.round(textMs * 10) / 10,
        graphMs: Math.round(graphMs * 10) / 10,
        totalScanMs: Math.round((performance.now() - started) * 10) / 10,
        domElementsConsidered: elements.length,
        visibleTextBlocks: textBlocks.length,
        deviceMemoryGb: navigator.deviceMemory || null,
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        jsHeapBytes: performance.memory?.usedJSHeapSize || null
      }
    };
  }

  function scrollMetrics() {
    return {
      x: window.scrollX,
      y: window.scrollY,
      maxY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      viewportHeight: innerHeight
    };
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value); else element.value = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isSyntheticSafeTest() {
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(location.hostname)
      && document.documentElement.dataset.demoSafeTest === 'true'
      && Boolean(document.querySelector('form[data-demo-application="true"]'));
  }

  function executeActions(message) {
    if (message.planVersion !== '1.0') throw new Error('This action plan version is unsupported. Scan and plan again.');
    if (!lastScan || message.scanId !== lastScan.scanId) throw new Error('This action plan does not match the latest scan. Scan the page again.');
    const currentHash = hash(fingerprint());
    if (message.expectedStateHash !== currentHash) throw new Error('The page changed after planning. Scan the current state again.');
    const profile = message.profile || {};
    const placeholderKeys = {
      '<USER_NAME>': 'name', '<USER_EMAIL>': 'email', '<USER_PHONE>': 'phone', '<USER_ADDRESS>': 'address',
      '<USER_DOB>': 'dob', '<USER_AADHAAR>': 'aadhaar', '<USER_PASSPORT>': 'passport'
    };
    const receipt = [];
    for (const action of message.actions || []) {
      const target = action.targetId ? lastScan.targetMap.get(action.targetId) : null;
      const preconditions = action.preconditions || {};
      if (target && (
        (preconditions.role && preconditions.role !== roleFor(target))
        || (preconditions.enabled === true && target.disabled)
        || (preconditions.visible === true && !rendered(target))
        || (preconditions.empty === true && 'value' in target && String(target.value).trim())
      )) {
        receipt.push({ ...action, status: 'blocked', reason: 'A safe action precondition no longer matches the current control.' });
        continue;
      }
      if (action.type === 'TYPE_PLACEHOLDER') {
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !visible(target) || target.disabled || target.readOnly) {
          receipt.push({ ...action, status: 'blocked', reason: 'Target is not an editable visible control.' }); continue;
        }
        if (['file', 'password', 'hidden', 'checkbox', 'radio', 'submit', 'button'].includes(target.type)) {
          receipt.push({ ...action, status: 'blocked', reason: 'Input type is not allowlisted.' }); continue;
        }
        if (target.value.trim()) {
          receipt.push({ ...action, status: 'preserved', reason: 'A value was already present.' }); continue;
        }
        const info = inferPurpose(nearbyContext(target), target);
        const profileKey = placeholderKeys[action.placeholder];
        if (!profileKey || info?.purpose !== profileKey || !String(profile[profileKey] || '').trim()) {
          receipt.push({ ...action, status: 'blocked', reason: 'Placeholder purpose did not match the target or local profile.' }); continue;
        }
        setNativeValue(target, profile[profileKey]);
        receipt.push({ ...action, status: target.value === profile[profileKey] ? 'executed' : 'blocked', reason: target.value === profile[profileKey] ? 'Value restored locally.' : 'Post-action verification failed.' });
      } else if (action.type === 'SCROLL') {
        const amount = Math.max(-innerHeight, Math.min(innerHeight, Number(action.amount || innerHeight * 0.7)));
        scrollBy({ top: amount, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        receipt.push({ ...action, status: 'executed', reason: 'Viewport scroll applied.' });
      } else if (action.type === 'CLICK') {
        if (!(target instanceof HTMLElement) || !rendered(target) || target.hasAttribute('disabled')) {
          receipt.push({ ...action, status: 'blocked', reason: 'The scanned click target is no longer rendered or enabled.' }); continue;
        }
        const highRisk = target.matches('button[type="submit"], input[type="submit"]') || /submit|pay|delete|agree|confirm/i.test(`${target.innerText || ''} ${target.getAttribute('aria-label') || ''}`);
        if (highRisk && !message.allowHighRisk) {
          receipt.push({ ...action, status: 'confirmation_required', reason: 'Explicit user approval is required.' }); continue;
        }
        if (highRisk && !isSyntheticSafeTest()) {
          receipt.push({ ...action, status: 'blocked', reason: 'Automated high-risk clicks are limited to the local synthetic portal.' }); continue;
        }
        if (!visible(target)) target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        const containingForm = target.closest('form');
        target.click();
        const syntheticSubmissionCompleted = !highRisk || !isSyntheticSafeTest()
          || !target.isConnected || Boolean(containingForm?.hidden) || !rendered(target);
        receipt.push({
          ...action,
          status: syntheticSubmissionCompleted ? 'executed' : 'blocked',
          reason: syntheticSubmissionCompleted
            ? (highRisk ? 'Synthetic submission executed after approval.' : 'Validated click executed.')
            : 'The submission control ran, but the synthetic portal did not enter its completed state.'
        });
      } else if (action.type === 'FINISH' || action.type === 'ABORT') {
        receipt.push({ ...action, status: action.type === 'FINISH' ? 'executed' : 'blocked', reason: action.reason || action.message || action.type });
      } else {
        receipt.push({ ...action, status: 'blocked', reason: 'Action type is not allowlisted.' });
      }
    }
    lastScan.stateHash = hash(fingerprint());
    return { receipt, nextStateHash: lastScan.stateHash };
  }

  function highlightTarget(message) {
    if (!lastScan || message.scanId !== lastScan.scanId) throw new Error('This highlight does not match the latest scan. Scan the page again.');
    if (message.expectedStateHash !== hash(fingerprint())) throw new Error('The page changed after planning. Scan the current state again.');
    const target = lastScan.targetMap.get(message.targetId);
    if (!(target instanceof HTMLElement) || !rendered(target) || target.disabled) throw new Error('The requested target is no longer visible or enabled.');
    const previousOutline = target.style.outline;
    const previousOffset = target.style.outlineOffset;
    target.style.outline = '3px solid #159d75';
    target.style.outlineOffset = '3px';
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    setTimeout(() => {
      if (target.isConnected) { target.style.outline = previousOutline; target.style.outlineOffset = previousOffset; }
    }, 8000);
    return { nextStateHash: hash(fingerprint()) };
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    try {
      if (message?.type === 'PV_PING') sendResponse({ ok: true, contentVersion: CONTENT_VERSION });
      else if (message?.type === 'PV_SCAN_PAGE') sendResponse({ ok: true, data: scanPage() });
      else if (message?.type === 'PV_GET_SCROLL_METRICS') sendResponse({ ok: true, data: scrollMetrics() });
      else if (message?.type === 'PV_SCROLL_TO') {
        window.scrollTo({ left: window.scrollX, top: Math.max(0, Math.min(scrollMetrics().maxY, Number(message.y) || 0)), behavior: 'auto' });
        sendResponse({ ok: true, data: scrollMetrics() });
      }
      else if (message?.type === 'PV_SHOW_OVERLAY') {
        if (!globalThis.PrivvyOverlayCanvas) throw new Error('Interactive overlay is unavailable; scan the page again.');
        sendResponse(globalThis.PrivvyOverlayCanvas.start({ masks: message.masks || [], scanId: message.scanId || null }));
      }
      else if (message?.type === 'PV_GET_REDACTION_REVIEW') sendResponse({ ok: true, review: globalThis.__privvyRedactionReview || null });
      else if (message?.type === 'PV_HIGHLIGHT_TARGET') sendResponse({ ok: true, data: highlightTarget(message) });
      else if (message?.type === 'PV_EXECUTE_ACTIONS') sendResponse({ ok: true, data: executeActions(message) });
      else if (message?.type === 'PV_HIDE_OVERLAY') {
        globalThis.PrivvyOverlayCanvas?.stop();
        document.getElementById(OVERLAY_ID)?.remove();
        sendResponse({ ok: true });
      }
      else if (message?.type === 'PV_CLEAR_OVERLAY') {
        globalThis.PrivvyOverlayCanvas?.stop();
        document.getElementById(OVERLAY_ID)?.remove();
        lastScan = null;
        sendResponse({ ok: true });
      } else return false;
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  });
})();
