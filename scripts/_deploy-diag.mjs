// HOLD 行为专项验证:下载未完时过渡图保持可见(不早退),完成后渐隐揭幕。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
let splash404 = 0;
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
p.on('response', (r) => { if (r.status() === 404 && /SplashScreens/.test(r.url())) splash404++; });
const t0 = Date.now();
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

let sawArtDuringHold = false, holdSampled = false, revealed = false, removed = false;
let lastOpacity = '0', transparentAtReveal = 'n/a';
for (let i = 0; i < 80; i++) {
  await new Promise((r) => setTimeout(r, 250));
  const s = await p.evaluate(() => {
    const v = document.getElementById('sw-splash');
    if (!v) return { present: false };
    const layers = ['back', 'tree', 'front'].map((c) => {
      const el = v.querySelector('.' + c);
      return el ? Number(el.style.opacity || '0') : 0;
    });
    return {
      present: true,
      maxOpacity: Math.max(...layers),
      transparent: v.style.background === 'transparent',
    };
  }).catch(() => ({ present: false }));
  const now = Date.now() - t0;
  if (!s.present) {
    if (holdSampled) { removed = true; console.log(`移除 @${now}ms`); }
    continue;   // 启动期未创建≠已移除:持续轮询
  }
  lastOpacity = String(s.maxOpacity);
  // HOLD 判据:过渡页在、未透出菜单(未 transparent)、层透明度仍高=冻结可见
  if (!s.transparent && s.maxOpacity >= 0.5 && !revealed) {
    holdSampled = true;
    sawArtDuringHold = true;
  }
  if (s.transparent && !revealed && holdSampled) {
    revealed = true;
    transparentAtReveal = 'transparent';
    console.log(`揭幕(transparent) @${now}ms,此前 HOLD 采样到过可见过渡图 ✓`);
  }
}
console.log(JSON.stringify({
  sawArtDuringHold, revealed, removed,
  lastOpacity, transparentAtReveal,
  splash404, pageErrors: errs.length,
}));
await b.close();
process.exit(sawArtDuringHold && revealed && removed && splash404 === 0 ? 0 : 1);
