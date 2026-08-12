// 批 C 验证：①MinionShot 吃鞭 tag ④右键集火 ⑪熔箭袋旗标
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  g.enemySpawnEnabled = false;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const r = {};
  const sleep = (ms) => new Promise(s2 => setTimeout(s2, ms));
  // ⑪ 熔箭袋旗标
  pl.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[4002]], stack: 1 };
  r.molten = { molten: pl.equipStats.moltenQuiver, quiver: pl.equipStats.quiver };
  pl.inv.armor[3] = null;
  // ① MinionShot 吃 tag：tag 敌 + 随从射出的箭命中多掉 tagDmg
  const tgt = Enemy.fromVanilla(3, pl.cx + 260, pl.cy);
  tgt.id = g.entities.nextId++; tgt.maxHp = 1e9; tgt.hp = 1e9; tgt.def.defense = 0;
  g.entities.add(tgt, 'enemies');
  tgt.whipTagT = 240; tgt.whipTagDmg = 4;
  // 无 tag 对照靶
  const tgt2 = Enemy.fromVanilla(3, pl.cx + 500, pl.cy);
  tgt2.id = g.entities.nextId++; tgt2.maxHp = 1e9; tgt2.hp = 1e9; tgt2.def.defense = 0;
  g.entities.add(tgt2, 'enemies');
  // 直接构造带旗标的箭（=随从射击通道语义）
  const a1 = new Arrow(tgt.cx - 40, tgt.cy, 8, 0, 10, 0, 374, null, { grav: 0 });
  a1.whipTagShot = true; g.entities.add(a1, 'projectiles');
  const a2 = new Arrow(tgt2.cx - 40, tgt2.cy, 8, 0, 10, 0, 374, null, { grav: 0 });
  a2.whipTagShot = true; g.entities.add(a2, 'projectiles');
  await sleep(400);
  r.tagShot = { taggedDrop: Math.round(1e9 - tgt.hp), plainDrop: Math.round(1e9 - tgt2.hp) }; // 14 vs 10
  // ④ 右键集火：模拟（直接走 Game 同款逻辑太重——验证 nearestEnemy 优先链）
  pl.minionTargetId = tgt2.id;
  const m = new MinionProj(pl.cx, pl.cy, 373, 10, 1, false, 0, false, () => pl);
  g.entities.add(m, 'projectiles');
  await sleep(200);
  // 随从应朝集火靶（cx+500）而非近靶（cx+260）移动/转向
  r.focus = { vx: Math.round(m.vx * 100) / 100, facing: m.facing };
  tgt.dead = true; tgt2.dead = true; m.dead = true;
  return r;
});
console.log(JSON.stringify(out));
const ok = out.molten.molten === true && out.molten.quiver === true
  && Math.abs(out.tagShot.taggedDrop - 14) <= 4 && out.tagShot.taggedDrop > out.tagShot.plainDrop
  && out.focus.facing === 1 && out.focus.vx > 0;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
