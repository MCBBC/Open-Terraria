// SP 快速微探针：满背包封口后的部分拾取残余链是否成立（无网络干扰）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1200, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', String(e.stack || e.message).slice(0, 400)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const log = [];
  const pumpN = async (n) => {
    for (let i = 0; i < n; i++) {
      try { g.fixedUpdate(1 / 60); g.postUpdate(); }
      catch (e) { log.push('PUMP-ERR@' + i + ': ' + (e && e.message)); return false; }
      await new Promise((r) => setTimeout(r, 6));
    }
    return true;
  };
  const m = await import('/src/data/items.ts');
  const torchKey = m.VANILLA_ITEM_KEY_BY_ID[8];
  const iid = m.ITEM_BY_KEY[torchKey];
  const msDef = m.ITEM_DEFS[iid]?.maxStack;
  // 引擎侧实读（Game 自持模块可能在 dev fork 下与 import 实例不同——从一次试生成反查）
  const probeDrop = g.spawnDrop(g.player.x + 500, g.player.y - 10, torchKey, 7, 0, 0);
  const entId = probeDrop ? probeDrop.id : -1;
  // 封背包：全格同物满堆 + 一格留 25
  const engMs = msDef || 9999;
  for (let i = 0; i < 50; i++) g.player.inv.slots[i] = { id: iid, stack: engMs };
  g.player.inv.slots[3] = { id: iid, stack: engMs - 25 };   // 全封后仅此处余 25
  if (engMs === undefined) {
    // 从已存在堆反推引擎内的 maxStack：尝试 add 巨量看留在堆里的上限
    log.push('ms_def_undefined');
  }
  if (!probeDrop) return { fail: 'spawn null' };
  probeDrop.x = g.player.x + 4; probeDrop.y = g.player.y + 8; probeDrop.vx = 0; probeDrop.vy = 0;
  const before = { pSlotsHead: g.player.inv.slots.slice(0, 6).map((sl) => sl ? sl.id + ':' + sl.stack : '-'), dropStack: probeDrop.stack };
  const ok = await pumpN(80);
  const dropAfter = g.entities.drops.find((e) => e.id === entId);
  return {
    ok, log,
    msDef, engProbe: { iid, msDef },
    before,
    after: { dropDead: !dropAfter || dropAfter.dead, dropStack: dropAfter ? dropAfter.stack : null },
    pSlotsHeadAfter: g.player.inv.slots.slice(0, 6).map((sl) => sl ? sl.id + ':' + sl.stack : '-'),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
