// Compact layout (phones, tablets): small text gets a size floor. Rather than restating every rule,
// each font-size in the stylesheets is copied once under `.stage.compact` with the size raised.
// Every copy gains the same two classes, so the copies override each other exactly like the originals.

/** 12px → 17px, 14px → 18.5px, 16px → 19.5px; 24px and up unchanged. */
const floor = (px: number) => Math.round((px + Math.max(0, 24 - px) * 0.45) * 2) / 2;

const done = new WeakSet<CSSStyleSheet>();
let out: HTMLStyleElement | null = null;

/** Splits a selector list on its top-level commas. */
function selectors(list: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts;
}

const scope = (sel: string) => (sel.startsWith('.stage') && !/^\.stage[\w-]/.test(sel) ? `.stage.compact${sel.slice(6)}` : `.stage.compact ${sel}`);

function scan() {
  const sheet = out?.sheet;
  if (!sheet) return;
  for (const src of Array.from(document.styleSheets)) {
    if (src === sheet || done.has(src)) continue;
    let rules: CSSRuleList;
    try {
      rules = src.cssRules;
    } catch {
      continue;
    }
    done.add(src);
    for (const r of Array.from(rules)) {
      if (!(r instanceof CSSStyleRule)) continue;
      const m = /^([\d.]+)px$/.exec(r.style.fontSize);
      if (!m) continue;
      const size = floor(+m[1]);
      try {
        sheet.insertRule(`${selectors(r.selectorText).map(scope).join(', ')} { font-size: ${size}px; }`, sheet.cssRules.length);
      } catch {
        /* a selector this browser can't parse */
      }
    }
  }
}

export function installCompactText() {
  out = document.createElement('style');
  out.dataset.compactText = '';
  document.head.append(out);
  // Inline sizes (style={{ fontSize: 13 }}) too.
  for (let px = 9; px <= 18; px++) out.sheet?.insertRule(`.stage.compact [style*="font-size: ${px}px"] { font-size: ${floor(px)}px !important; }`);
  scan();
  // Stylesheets that arrive later (dev hot reload, a slow <link>).
  new MutationObserver(scan).observe(document.head, { childList: true });
  window.addEventListener('load', scan);
}
