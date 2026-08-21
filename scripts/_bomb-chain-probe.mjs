// 爆炸物伤害链探针:雷管 167(弹29)/手雷 168(弹30)——各在独立页面状态下全链
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });

async function runOne(itemVid) {
  const page = await browser.newPage();
  await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  await page.waitForSelector('select', { timeout: 120000 });
  await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
  const r = await page.evaluate(async (vid) => {
    const g = window.__swGame;
    const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16);
    let gy = Math.floor(g.player.cy / 16);
    while (gy < st.h - 4 && !st.isSolid(px + 6, gy)) gy++;
    g.debugSpawnNpc(3, 1, false);
    for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
    const enemy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 3);
    if (!enemy) return { err: 'no enemy' };
    const hp0 = enemy.hp;
    g.player.inv.slots[g.player.inv.selected] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]], stack: 5 };
    g.cb.onInventoryChanged();
    const inp = g.input;
    const z = g.camera.zoom || 1;
    inp.mouseX = 640 + (enemy.cx - g.camera.x) * z;
    inp.mouseY = 400 + (enemy.cy - g.camera.y) * z;
    inp.mouseDown = true;
    let proj = null;
    const p0 = g.entities.projectiles.length;
    for (let t = 0; t < 15; t++) {
      g.fixedUpdate(1 / 60);
      if (!proj && g.entities.projectiles.length > p0) proj = g.entities.projectiles[g.entities.projectiles.length - 1];
    }
    inp.mouseDown = false;
    if (!proj) {
      // 兜底:任意 30 弹(可能已爆出列表)→ 用 dead 哨兵重测伤害
      const any30 = g.entities.projectiles.find((p) => p.projId === 30);
      if (any30) { proj = any30; }
      else return { err: 'no proj', hp0, useTime: g.player.useTime, mouseDown: inp.mouseDown,
        heldKey: (await import('/src/data/items.ts')).ITEM_DEFS[g.player.inv.slots[g.player.inv.selected]?.id]?.key };
    }
    for (let t = 0; t < 360; t++) { g.fixedUpdate(1 / 60); if (proj.dead) break; }
    return { hp0, hp1: enemy.hp, hurt: hp0 - enemy.hp, dead: enemy.dead, exploded: proj.dead };
  }, itemVid);
  await page.close();
  return r;
}
const dynamite = await runOne(167);
const grenade = await runOne(168);
console.log(JSON.stringify({ dynamite, grenade }, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('雷管 167 全链:引信爆→敌怪掉血', dynamite.hurt > 0, JSON.stringify(dynamite));
check('手雷 168 全链:hurtBox 64 修后掉血', grenade.hurt > 0 || grenade.dead, JSON.stringify(grenade));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
