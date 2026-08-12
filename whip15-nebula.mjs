// ⑯ 星云 booster：穿套装 + 魔法弹命中 1/3 掉 booster → 拾取 → 三族 Levelup
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
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const r = {};
  const wear = (vids) => vids.forEach((v, i) => { pl.inv.armor[i] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]], stack: 1 }; });
  wear([2760, 2761, 2762]); // 星云套
  r.set = pl.equipStats.nebulaSet;
  let bolts = 0;
  const oa = g.entities.add.bind(g.entities);
  g.entities.add = (e, b2) => { if (e?.projId === 7) bolts++; return oa(e, b2); };
  g.entities.add0 = null;
  const aim = g.camera.screenToWorld(g.renderer.canvas.width / 2 + 120, g.renderer.canvas.height / 2);
  const tgt = Enemy.fromVanilla(3, aim.x, aim.y); // 靶放鼠标射线落点（箭走射线）
  tgt.id = g.entities.nextId++; tgt.maxHp = 1e9; tgt.hp = 1e9; tgt.def.defense = 0;
  g.entities.add(tgt, 'enemies');
  // 魔法杖 64（紫晶杖）
  pl.inv.slots[0] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[64]], stack: 1 };
  pl.inv.selected = 0;
  const hold = setInterval(() => {
    pl.useTime = 0;
    g.input.mouseX = g.renderer.canvas.width / 2 + 120; g.input.mouseY = g.renderer.canvas.height / 2;
    g.input.mouseDown = true;
  }, 60);
  await new Promise(s2 => setTimeout(s2, 4000)); // 多轮命中 → booster 掉落+吸附拾取
  clearInterval(hold);
  g.input.mouseDown = false;
  pl.x = tgt.x - 30; pl.y = tgt.y; // 走到 booster 掉落点（原版 42px 抓取需近身）
  await new Promise(s2 => setTimeout(s2, 1500)); // 等吸附拾取
  g.entities.add = oa;
  r.bolts = bolts; r.cd = pl.nebulaCD;
  r.nebula = [...pl.nebula];
  r.levels = pl.nebula[0] + pl.nebula[1] + pl.nebula[2];
  r.summonMult = Math.round(pl.summonDamageMult * 100) / 100; // 1+0.66+0.15×dmg级
  tgt.dead = true;
  for (const e of [...g.entities.projectiles]) e.dead = true;
  return r;
});
console.log(JSON.stringify(out));
const ok = out.set === true && out.levels >= 1 && out.levels <= 9
  && Math.abs(out.summonMult - (1.66 + 0.15 * out.nebula[0])) < 0.01;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
