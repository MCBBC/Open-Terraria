import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e?.stack ?? e).slice(0, 1200)));
page.on('console', async (m) => {
  if (m.type() !== 'error' && m.type() !== 'warning') return;
  const parts = [];
  try { for (const a of m.args()) parts.push(await a.evaluate((x) => (x && x.stack) ? String(x.stack).slice(0, 1400) : JSON.stringify(x).slice(0, 400)).catch(() => '⟨unserializable⟩')); } catch { parts.push('⟨args err⟩'); }
  errs.push(m.type().toUpperCase() + ': ' + (m.text().slice(0, 120)) + ' ⟪' + parts.join(' ∥ ') + '⟫');
});
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 3000)); if (await page.evaluate(() => !!(window.__swGame?.player)).catch(() => false)) break; }
await new Promise(r => setTimeout(r, 6000));
const f0 = await page.evaluate(() => window.__swGame && window.__swGame.tickCount);
await new Promise(r => setTimeout(r, 60000));   // 60s 长跑 soak
const st = await page.evaluate(() => ({ frame: window.__swGame && window.__swGame.tickCount, alive: !!window.__swGame && !!window.__swGame.player && !window.__swGame.player.dead })).catch((e) => ({ fail: String(e).slice(0, 100) }));
if (!st.fail) st.frameDelta = st.frame - f0;   // 60s 应 ≈3600 帧;停机=0
console.log(JSON.stringify({ st, errs: errs.slice(0, 8) }, null, 1));
await browser.close();
