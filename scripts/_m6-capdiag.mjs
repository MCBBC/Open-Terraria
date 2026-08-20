// M6 v3:dispatch 时同步回读 held + 帧流关联
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small&cwatch=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 90; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer).catch(() => false)) break; }
await sleep(2000);
const mouse = async (type, x, y, btn = 0) => p.evaluate(([t, x, y, btn]) => {
  const g = window.__swGame;
  const tgt = document.elementFromPoint(x, y) || document.body;
  tgt.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
  tgt.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, button: btn, buttons: btn === 2 ? 2 : 1, bubbles: true }));
  window.__evlog?.push(`${t}@${x},${y} → held=${g.input.mouseHeld} down=${g.input.mouseDown} mx=${g.input.mouseX}`);
  return { held: g.input.mouseHeld, mx: g.input.mouseX };
}, [type, x, y, btn]);
const key = (code) => p.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), code);
await p.evaluate(() => { window.__evlog = []; });
console.log('F4:', await key('F4')); await sleep(300);
await p.evaluate(() => { window.__log = []; window.__armed = true;
  const cm = window.__swGame.renderer.captureMode;
  const of = cm.frame.bind(cm);
  cm.frame = (r, bun, env) => { if (window.__armed) window.__log.push(`f ${env.mouseX},${env.mouseY} L=${env.mouseLeft} hover=${cm.hoveredMode} click=${cm.clickLeft} just=${cm.justActivated}`); return of(r, bun, env); };
  for (const m of ['pressButton', 'startCamera']) { const o = cm[m].bind(cm); cm[m] = (...a) => { window.__log.push(`>${m}`); return o(...a); }; }
});
console.log('md(640,400):', await mouse('mousedown', 640, 400)); await sleep(300);
console.log('mu(640,400):', await mouse('mouseup', 640, 400)); await sleep(300);
console.log('md(91,45):', await mouse('mousedown', 91, 45)); await sleep(300);
console.log('mu(91,45):', await mouse('mouseup', 91, 45)); await sleep(600);
console.log('--- evlog ---\n' + (await p.evaluate(() => window.__evlog)).join('\n'));
const log = await p.evaluate(() => window.__log);
console.log('--- frames (unique) ---');
const seen = new Set();
for (const l of log) { if (!seen.has(l)) { seen.add(l); console.log(l); } }
await b.close();
