import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e?.stack ?? e).slice(0, 900)));
page.on('console', async (m) => {
  const parts = [];
  try { for (const a of m.args()) parts.push(await a.evaluate((x) => (x && x.stack) ? String(x.stack).slice(0, 700) : JSON.stringify(x).slice(0, 200)).catch(() => '?')); } catch { /* */ }
  errs.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 120) + ' ⟪' + parts.join(' ∥ ').slice(0, 700) + '⟫');
});
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
await page.evaluate(async () => {
  const buf = await fetch('mods/dist/calamity.swmod').then((r) => r.arrayBuffer());
  await window.__swMods.install(new Uint8Array(buf));
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 3000)); if (await page.evaluate(() => !!(window.__swGame?.player)).catch(() => false)) break; }
// 关欢迎幕
for (let a = 0; a < 2; a++) {
  const bb = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div, button')];
    const b = els.filter((x) => x.textContent?.trim() === '我已知晓' && x.offsetParent).pop();
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }).catch(() => null);
  if (!bb) break; await page.mouse.click(bb.x, bb.y); await new Promise(r => setTimeout(r, 700));
}
errs.length = 0;   // 清启动噪音
const r1 = await page.evaluate(() => {
  const g = window.__swGame;
  const alloc = window.__swMods?.result?.()?.allocation;
  const headId = alloc?.npcs?.get('mod_calamity_desert_scourge_head');
  const err = g.debugSpawnNpc(headId, 1, false);
  const m = (g.entities?.enemies ?? []).filter((e) => !e.dead && (e.vanillaId ?? -1) >= 800);
  return { headId, err, spawned: m.length, bossSlot: !!g.boss };
});
await new Promise(r => setTimeout(r, 800));
const rMid = await page.evaluate(() => {
  const g = window.__swGame;
  const m = (g.entities?.enemies ?? []).filter((e) => (e.vanillaId ?? -1) >= 800);
  return { t: 100, alive: m.filter((e) => !e.dead).length, hp: m[0]?.hp, boss: !!g.boss, y: m[0]?.y, vy: m[0]?.vy };
});
await new Promise(r2 => setTimeout(r2, 1500));
const r2 = await page.evaluate(() => {
  const g = window.__swGame;
  const m = (g.entities?.enemies ?? []).filter((e) => (e.vanillaId ?? -1) >= 800);
  return { alive: m.filter((e) => !e.dead).length, dead: m.filter((e) => e.dead).length,
    hp: m[0]?.hp, deadCause: m[0] && m[0].lastDamageCause, x: m[0] && Math.round(m[0].cx), y: m[0] && Math.round(m[0].cy),
    wormNext: !!(m[0] && m[0].wormNext) };
});
console.log(JSON.stringify({ r1, rMid, r2, errs: errs.slice(0, 6) }, null, 1));
await browser.close();
