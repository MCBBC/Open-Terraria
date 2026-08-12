import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { WhipProj } = await import('/src/entities/WhipProj.ts');
  const r = {};
  // ③ 鞭 debuff：火鞭 913 命中 → onFireT
  const tgt = Enemy.fromVanilla(3, pl.cx + 120, pl.cy);
  tgt.id = g.entities.nextId++; tgt.maxHp = 1e9; tgt.hp = 1e9; tgt.def.defense = 0;
  g.entities.add(tgt, 'enemies');
  const wp = new WhipProj(pl.cx, pl.cy, 0, 913, 4912, 20, 2, 30, 4, () => pl);
  wp.id = g.entities.nextId++; g.entities.add(wp, 'projectiles');
  await new Promise(s2 => setTimeout(s2, 400));
  r.fireDebuff = tgt.onFireT > 0;
  tgt.dead = true; wp.dead = true;
  // ⑥ 月主鞭 1035：补鞭 2 条
  let lashes = 0;
  const orig = g.entities.add.bind(g.entities);
  g.entities.add = (e, b2) => { if (e?.projId === 1035) lashes++; return orig(e, b2); };
  const mw = new WhipProj(pl.cx, pl.cy, 0, 1035, 5480, 20, 2, 30, 4, () => pl);
  mw.id = g.entities.nextId++; g.entities.add(mw, 'projectiles');
  await new Promise(s2 => setTimeout(s2, 700));
  g.entities.add = orig;
  r.multiLash = lashes; // 主 1 + 补 2 = 3
  return r;
});
console.log(JSON.stringify(out));
const ok = out.fireDebuff === true && out.multiLash === 3;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
