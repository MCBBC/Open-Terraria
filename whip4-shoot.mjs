// 验证射击型召唤物：①黄蜂杖(2364→373)射 374 ②冰九头蛇杖(1572→308 哨兵)射 309
// ③Xeno 杖(2749→423 UFO)≤400px 射 433 ④俾格米杖(1157→191)掷 195
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const res = {};
  // 计数生成（弹幕生成即命中会瞬间死亡，事后采样漏计）
  res.spawned = {};
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, b) => { const pid = e?.projId; if (pid) res.spawned[pid] = (res.spawned[pid] ?? 0) + 1; return origAdd(e, b); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const give = (vid) => {
    const key = VANILLA_ITEM_KEY_BY_ID[vid];
    g.player.inv.slots[0] = { id: ITEM_BY_KEY[key], stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
  };
  g.input.mouseX = g.renderer.canvas.width / 2 + 100;
  g.input.mouseY = g.renderer.canvas.height / 2;
  // 固定靶（玩家右 260px——各族射程内）
  const tgt = Enemy.fromVanilla(3, g.player.cx + 260, g.player.cy - 10);
  tgt.id = g.entities.nextId++;
  tgt.def.defense = 0;
  tgt.maxHp = 1e9; tgt.hp = 1e9;   // 打不死的靶（死后会从列表移除，后续轮全空）
  g.entities.add(tgt, 'enemies');
  const shotProjIds = () => g.entities.projectiles.map((e) => e.projId ?? 0);
  const test = async (staffVid, minionId, shotId, waitMs, tag) => {
    // 清场（清召唤物与弹幕，保留靶）
    for (const e of [...g.entities.projectiles]) e.dead = true;
    await sleep(400);
    const before = res.spawned[shotId] ?? 0;
    give(staffVid);
    g.input.mouseDown = true;
    await sleep(500);
    g.input.mouseDown = false;
    await sleep(waitMs);
    res[tag] = { minionSpawned: shotProjIds().includes(minionId), shots: (res.spawned[shotId] ?? 0) - before };
    tgt.dead = false;
  };
  await test(2364, 373, 374, 1500, 'hornet');
  await test(1572, 308, 309, 2200, 'frostHydra');
  await test(2749, 423, 433, 1500, 'xenoUfo');
  await test(1157, 191, 195, 1500, 'pygmy');
  // 月门 641→642；彩虹水晶 643→AoE 落点（直接伤害，验 hp 掉落）
  await test(3569, 641, 642, 2200, 'lunarPortal');
  const hpBefore = tgt.hp;
  await test(3571, 643, 0, 2200, 'rainbowCrystal');
  res.rainbowCrystal.aoeDmg = Math.round(hpBefore - tgt.hp);
  tgt.dead = true;
  return res;
});
console.log(JSON.stringify(out, null, 1));
const ok = out.hornet.minionSpawned && out.hornet.shots > 0
  && out.frostHydra.minionSpawned && out.frostHydra.shots > 0
  && out.xenoUfo.minionSpawned && out.xenoUfo.shots > 0
  && out.pygmy.minionSpawned && out.pygmy.shots > 0&& out.lunarPortal.minionSpawned && out.lunarPortal.shots > 0&& out.rainbowCrystal.minionSpawned && out.rainbowCrystal.aoeDmg > 0;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
