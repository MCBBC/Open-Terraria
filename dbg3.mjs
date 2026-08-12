import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 400)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const r = {};
  const give = (vid) => {
    g.player.inv.slots[0] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]], stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
  };
  const tryUse = async (vid, ms = 600) => {
    give(vid);
    const held = g.player.inv.heldItem();
    const pre = { heldId: held?.id, useTime: g.player.useTime, mana: g.player.mana };
    g.input.mouseX = g.renderer.canvas.width / 2 + 100;
    g.input.mouseY = g.renderer.canvas.height / 2;
    g.input.mouseDown = true;
    await new Promise(s => setTimeout(s, ms));
    g.input.mouseDown = false;
    await new Promise(s => setTimeout(s, 300));
    return { pre, postUseTime: g.player.useTime, manaAfter: g.player.mana };
  };
  for (const vid of [3531, 4607, 5114, 4911]) {
    r[vid] = await tryUse(vid);
  }
  r.minionIds = g.entities.projectiles.filter((e) => e.constructor.name === 'MinionProj').map((m) => m.projId);
  return r;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
