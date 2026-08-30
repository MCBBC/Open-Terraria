import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const pg = await b.newPage();
await pg.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded' });
await pg.waitForSelector('.sw-title-menu', { timeout: 60000 });
await pg.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 400));
const out = await pg.evaluate(async (saveTxt) => {
  await window.__swLoadJson(saveTxt);
  await new Promise(r => setTimeout(r, 900));
  const g = window.__swGame;
  const P = g.player;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  P.inv.slots.fill(null);
  P.inv.slots[0] = { id: ITEM_BY_KEY['vi_98_迷你鲨'], stack: 1 };
  P.inv.slots[54] = { id: ITEM_BY_KEY['vi_97_火枪子弹'], stack: 50 };
  P.inv.selected = 0;
  window.__t = [];
  const orig = P.pickAmmoSlot?.bind(P);
  if (orig) {
    P.pickAmmoSlot = (...a) => { const r = orig(...a); window.__t.push(['pick', ...a, '=>', r]); return r; };
  }
  // 分发链路探针：ranged 分支是否进入（借 useTime/useSwing 观测）
  const [sx, sy] = g.camera.worldToScreen(P.cx, P.cy);
  g.input.mouseX = sx + 300;
  g.input.mouseY = sy;
  g.input.mouseDown = true;
  await new Promise(r => setTimeout(r, 120));
  g.input.mouseDown = false;
  await new Promise(r => setTimeout(r, 60));
  return {
    typeofPick: typeof orig,
    trace: window.__t,
    useTimeAfter: P.useTime,
    swingAfter: !!g.swing,
    selectedDefKey: (() => { const s2 = P.inv.slots[P.inv.selected]; const id = s2?.id; void id; return 'slot0'; })(),
  };
}, readFileSync(process.env.BULB_MAP, 'utf8'));
console.log(JSON.stringify(out));
await b.close();
