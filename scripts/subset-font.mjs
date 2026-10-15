// Subsets the CJK pixel font to only the characters used in the game source, producing a tiny woff2.
import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'assets-src/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2');
const OUT = path.join(ROOT, 'public/fonts/pixel.woff2');

const chars = new Set();
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(tsx?|css|html|json)$/.test(f.name)) for (const ch of fs.readFileSync(p, 'utf8')) chars.add(ch);
  }
};
walk(path.join(ROOT, 'src'));
for (const ch of fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) chars.add(ch);
// Always include printable ASCII, digits and common punctuation.
for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c));
for (const ch of '，。！？：；、“”‘’（）《》【】…—·×★☆♥❤←→↑↓▲▼●○■□◆◇✦✧♛⚔🛡✚✹➶☄') chars.add(ch);
const text = [...chars].join('');
const buf = fs.readFileSync(SRC);
const out = await subsetFont(buf, text, { targetFormat: 'woff2' });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`Subset font: ${chars.size} chars → ${(out.length / 1024).toFixed(1)} KB`);
