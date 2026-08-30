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
  const [sx, sy] = g.camera.worldToScreen(P.cx, P.cy);
  g.input.mouseX = sx + 300; g.input.mouseY = sy;
  // 一帧内快照各谓词（在 mouseDown 置位后的第一个 fixedUpdate 边界读取）
  const snap = {};
  window.__snapGate = () => snap;
  g.input.mouseDown = true;
  await new Promise(r => setTimeout(r, 30));
  const hdef = P.inv.heldDef();
  Object.assign(snap, {
    heldKey: hdef?.key,
    useTime: P.useTime,
    dead: !!P.dead,
    buffsBlock: P.buffs.has?.(19) || undefined,
  });
  g.input.mouseDown = false;
  await new Promise(r => setTimeout(r, 80));
  Object.assign(snap, { afterUseTime: P.useTime, projsAlive: g.entities.projectiles.filter(e => !e.dead).length });
  // 直调内部：跳过输入分发，直接驱动 useCombatWeapon 类是否可达？改用可观测窗口期读取
  return snap;
}, readFileSync(process.env.BULB_MAP, 'utf8'));
console.log(JSON.stringify(out));
await b.close();
