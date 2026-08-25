// 500ms 延迟撤幕验证:过渡图挂载时刻起,向日葵幕应存活 ≥400ms 后才消失。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let artAt = -1, veilGoneAt = -1;
const t0 = Date.now();
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 100));
  const s = await p.evaluate(() => {
    const veil = !!document.getElementById('sw-boot-prime');
    const sp = document.getElementById('sw-splash');
    const back = sp?.querySelector('.back');
    return { veil, art: !!(sp && back && back.style.backgroundImage) };
  }).catch(() => ({ veil: false, art: false }));
  if (s.art && artAt < 0) { artAt = Date.now() - t0; console.log(`过渡图挂载 @${artAt}ms(幕仍在=${s.veil})`); }
  if (artAt >= 0 && !s.veil && veilGoneAt < 0) { veilGoneAt = Date.now() - t0; console.log(`向日葵幕撤除 @${veilGoneAt}ms`); break; }
}
const overlap = veilGoneAt - artAt;
console.log(JSON.stringify({ overlapMs: overlap, verdict: overlap >= 400 ? '延迟 500ms 生效 ✓' : `并存活续仅 ${overlap}ms ✗` }));
await b.close();
process.exit(overlap >= 400 ? 0 : 1);
