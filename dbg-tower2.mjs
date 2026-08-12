// 批 E：⑦DD2 塔音效（素材翻案后落地）+ 狼人属性补全（def+3/move+5%/regen/jump）
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
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const r = {};
  // ⑦ DD2 音效：hook playWav 录音 → 召唤爆炸塔 + 靶 → 开火应录 dd2Flameburst
  const calls = []; let fireballs = 0;
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, b2) => { if (e?.projId === 668) fireballs++; return origAdd(e, b2); };
  const orig = g.sfx.playWav.bind(g.sfx);
  g.sfx.playWav = (n, v, x, y) => { calls.push(n); return orig(n, v, x, y); };
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const tgt = Enemy.fromVanilla(3, pl.cx + 200, pl.cy);
  tgt.id = g.entities.nextId++; tgt.maxHp = 1e9; tgt.hp = 1e9; tgt.def.defense = 0;
  g.entities.add(tgt, 'enemies');
  pl.inv.slots[0] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3818]], stack: 1 }; // 爆炸烈焰魔杖 T1
  pl.inv.selected = 0; pl.useTime = 0;
  g.input.mouseX = g.renderer.canvas.width / 2 + 100; g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true;
  await new Promise(s2 => setTimeout(s2, 500));
  g.input.mouseDown = false;
  await new Promise(s2 => setTimeout(s2, 2200)); // CD60t=1s 内开火
  g.sfx.playWav = orig;
  g.entities.add = origAdd;
  r.dd2 = { fired: calls.includes('dd2Flameburst'), fireballs, tail: calls.slice(-4) };
  r.spawned = g.entities.projectiles.filter((e) => e?.constructor?.name === 'MinionProj').map((m) => [m.projId, m.sentry, m.dead]);
  tgt.dead = true;
  for (const e of [...g.entities.projectiles]) e.dead = true;
  // 狼人属性补全：def+3 / move ×1.05 / regen 起效
  pl.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[485]], stack: 1 };
  g.world.clock.timeOfDay = 0.9;
  const d0 = pl.defense;
  await new Promise(s2 => setTimeout(s2, 400));
  r.wolf = { defense: pl.defense - d0, moveMult: Math.round(pl.buffs.moveSpeedMult * 100) / 100 };
  g.world.clock.timeOfDay = 0.5;
  pl.inv.armor[3] = null;
  return r;
});
console.log(JSON.stringify(out));
const ok = out.dd2.fired === true
  && out.wolf.defense === 3 && Math.abs(out.wolf.moveMult - 1.05) < 0.01;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
