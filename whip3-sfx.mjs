// 验证：①用鞭 → playWav('whipCrack')（Item_152）②召唤杖 → playWav('summon')（Item_44）
// ③随从朝向随目标水平方向翻转（AI_062 :62975 spriteDirection 语义）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5200/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { combatWeapon } = await import('/src/data/vanillaItemCombat.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const res = { calls: [] };
  const orig = g.sfx.playWav.bind(g.sfx);
  g.sfx.playWav = (n, v, x, y) => { res.calls.push(n); return orig(n, v, x, y); };
  const give = (vid) => {
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    const id = ITEM_BY_KEY[key];
    g.player.inv.slots[0] = { id, stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    return ITEM_DEFS[id];
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 瞄准：鼠标指向玩家右侧（ WhipProj 飞出方向与声效无关，仅需触发 use）
  g.input.mouseX = g.renderer.canvas.width / 2 + 100;
  g.input.mouseY = g.renderer.canvas.height / 2;
  // ①皮鞭 4672（proj 841）
  const whipDef = give(4672);
  res.whipKind = combatWeapon(whipDef).kind;
  g.input.mouseDown = true;
  await sleep(300);
  g.input.mouseDown = false;
  await sleep(400);
  // ②史莱姆法杖 1309（proj 266 随从）
  const sumDef = give(1309);
  res.sumKind = combatWeapon(sumDef).kind;
  await sleep(700); // 等鞭的 useTime(30t=500ms) 冷却走完
  g.input.mouseDown = true;
  await sleep(700);
  g.input.mouseDown = false;
  await sleep(400);
  // ③随从朝向：把敌放到随从左侧 → facing 应翻 -1
  const minion = g.entities.projectiles.find((e) => e?.constructor?.name === 'MinionProj' && !e.sentry);
  res.minionSpawned = !!minion;
  if (minion) {
    res.f0 = minion.facing;
    const tgt = Enemy.fromVanilla(3, minion.cx - 300, minion.cy);
    tgt.id = g.entities.nextId++;
    tgt.def.defense = 0;
    g.entities.add(tgt, 'enemies');
    await sleep(600);
    res.f1 = minion.facing;
    // 反向断言：目标移到右侧 → facing 翻回 +1
    tgt.dead = true;
    tgt.x = minion.cx + 400; tgt.y = minion.cy;
    tgt.dead = false;
    tgt.hp = tgt.maxHp;
    await sleep(600);
    res.f2 = minion.facing;
    tgt.dead = true;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
const ok = out.whipKind === 'whip' && out.sumKind === 'summon'
  && out.calls.includes('whipCrack') && out.calls.includes('summon')
  && out.minionSpawned && out.f1 === -1 && out.f2 === 1;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
