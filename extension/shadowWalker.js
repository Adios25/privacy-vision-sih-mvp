(() => {
  function roots(root = document) {
    const output = [root];
    const visit = (current) => {
      for (const element of current.querySelectorAll ? current.querySelectorAll('*') : []) {
        if (element.shadowRoot) { output.push(element.shadowRoot); visit(element.shadowRoot); }
      }
    };
    visit(root); return output;
  }
  function elements(root, selectors) { return roots(root).flatMap((item) => Array.from(item.querySelectorAll?.(selectors) || []).map((element) => { if (item !== root) element.__privvyInOpenShadow = true; return element; })); }
  function textNodes(root = document) {
    const output = [];
    for (const current of roots(root)) {
      const ownerDocument = current.nodeType === 9 ? current : current.ownerDocument;
      if (!ownerDocument) continue;
      const walker = ownerDocument.createTreeWalker(current, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) { if (current !== root) walker.currentNode.__privvyInOpenShadow = true; output.push(walker.currentNode); }
    }
    return output;
  }
  globalThis.PrivvyShadowWalker = { roots, elements, textNodes };
})();
