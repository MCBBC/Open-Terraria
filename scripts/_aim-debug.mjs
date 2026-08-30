import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const logs = [];
p.on('console', (m) => { if (/error|warn|Trace/i.test(m.type())) logs.push(m.text().slice(0, 140)); });
p.on('pageerror', (e) => logs.push('PAGEERR:' + String(e.message).slice(0, 160)));
await p.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded' });
try { await p.waitForSelector('.sw-title-menu', { timeout: 60000 }); } catch { console.log('menu fail', JSON.stringify(logs.slice(0,4))); await b.close(); process.exit(2); }
await p.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 400));
const out = await p.evaluate(async (saveTxt) => {
  const txt = saveTxt;
  await window.__swLoadJson(txt);
  await new Promise(r => setTimeout(r, 1000));
  const g = window.__swGame;
  const seq = [];
  // 基线：不按键，观察 facing 是否被什么东西打回 -1
  g.player.facing = 1;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 40));
    seq.push(g.player.facing);
  }
  return {
    facingSeq: seq,
    hasHelper: typeof g.tryFaceHeldAim,
    protoHas: typeof Object.getPrototypeOf(g).tryFaceHeldAim,
    inputState: { down: g.input.mouseDown, held: g.input.mouseHeld, rd: g.input.rightDown,
      mx: g.input.mouseX, my: g.input.mouseY },
    playerCx: Math.round(g.player.cx), worldW: g.world.store.w,
  };
}, (process.env.BULB_MAP ? readFileSync(process.env.BULB_MAP, 'utf8') : ''));
console.log(JSON.stringify(out));
console.log('CONSOLE-ERRS:', JSON.stringify(logs.slice(0, 6)));
await b.close();
