// 揭幕时序端到端验收(2026-08-27):三条用户要求逐项核对
// ①指示器在向日葵幕阶段(过渡图之前)就出现 ②揭幕时 done>=total(全量)
// ③全程时间线记录(veil→splash→菜单)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const host = process.env.HOST ?? 'world.vinlic.com';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  userDataDir: process.env.SW_USERDIR ?? `/tmp/cdn-e2e-${Date.now() % 100000}`,
  args: ['--no-proxy-server'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const t0 = Date.now();
const marks = [];
const mark = (s) => marks.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);
page.on('console', (m) => { if (m.type() === 'error') mark(`console错误:${m.text().slice(0, 60)}`); });

await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

let splashed = false, unveiled = false, menuShown = false, lastDone = '';
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await page.evaluate(() => {
    const veil = !!document.getElementById('sw-boot-prime');
    const splash = !!document.getElementById('sw-splash');
    const badge = document.querySelector('.sw-asset-badge .txt')?.textContent ?? null;
    const menu = !!(document.querySelector('[data-act=sp]'));
    const h = globalThis.__swAssetCache;
    const st = (h && typeof h.state === 'function') ? h.state() : null;
    return { veil, splash, badge, menu, done: st?.done ?? 0, total: st?.total ?? 0, phase: st?.phase ?? '-' };
  }).catch(() => null);
  if (!s) continue;
  if (s.badge && !unveiled && !marks.some((m) => m.includes('指示器'))) mark(`指示器首现:"${s.badge}" (veil=${s.veil} splash=${s.splash})`);
  if (s.splash && !splashed) { splashed = true; mark(`过渡图出现 (done=${s.done}/${s.total})`); }
  if (s.menu && !menuShown) { menuShown = true; mark(`菜单DOM幕后就位(非揭幕) done=${s.done}/${s.total}`); }
  if (!s.veil && !unveiled && splashed === false) { /* veil 还在,继续 */ }
  if (!s.splash && splashed && !unveiled) { unveiled = true; mark(`★过渡页收场揭幕 (done=${s.done}/${s.total})`); }
  lastDone = `${s.done}/${s.total}`;
  if (menuShown && unveiled && s.phase === 'done') { mark(`warm 完成 (${lastDone})`); break; }
  if (i === 89) mark(`超时截断 (done=${lastDone})`);
}
console.log(marks.join('\n'));
const unveilLine = marks.find((m) => m.includes('★过渡页收场'));
const full = unveilLine && /done=(\d+)\/(\d+)/.exec(unveilLine);
console.log(full && full[1] === full[2] ? '\n✅ 揭幕时全量就位' : '\n❌ 揭幕时未全量');
await browser.close();
process.exit(0);
