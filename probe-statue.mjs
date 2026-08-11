// 雕像电路触发验证：①史莱姆雕像(style4)→生成带 statue 标的怪；击杀不掉钱凝胶照掉
// ②心雕像(style37)→掉 pickup 心 ③雕像怪 type85(mimic,style27)击杀永无战利品
// ④王雕像新表 80([671,672]) 可触发
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const st = g.world.store;
  const res = {};
  const T105 = TILE_BY_KEY['v_105_statue'];
  const baseY = Math.floor(g.world.groundLevel) + 6;
  const baseX = Math.floor(g.world.w / 2);
  /** 放一座 style 雕像 + 拉杆 + 连线，拨拉杆触发 */
  const fire = (style, ox) => {
    const sx = baseX + ox, sy = baseY;
    st.setTile(sx, sy, T105, style * 36, 0);
    st.setTile(sx + 1, sy, T105, style * 36 + 18, 0);
    st.setTile(sx, sy + 1, T105, style * 36, 18);
    st.setTile(sx + 1, sy + 1, T105, style * 36 + 18, 18);
    st.setTile(sx, sy + 2, T105, style * 36, 36);
    st.setTile(sx + 1, sy + 2, T105, style * 36 + 18, 36);
    // 拉杆（132,2×2）放雕像右侧 4 格，红线从拉杆连到雕像锚点
    const T132 = TILE_BY_KEY['v_132_lever'];
    const lx = sx + 4, ly = sy;
    st.setTile(lx, ly, T132, 0, 0); st.setTile(lx + 1, ly, T132, 18, 0);
    st.setTile(lx, ly + 1, T132, 0, 18); st.setTile(lx + 1, ly + 1, T132, 18, 18);
    for (let x = sx; x <= lx; x++) st.setWire(x, sy, st.wire[st.idx(x, sy)] | 1);
    const before = g.entities.enemies.length;
    g.wiring.hitSwitch(lx, ly);
    return g.entities.enemies.slice(before);
  };
  // ① 史莱姆雕像（style 4 → npc 1）
  const slimes = fire(4, 0);
  res.slimeSpawned = slimes.filter((e) => e.vanillaId === 1).length;
  res.slimeFlagged = slimes.filter((e) => e.vanillaId === 1 && e.spawnedFromStatue).length;
  // 击杀：凝胶照掉、不掉钱
  if (res.slimeFlagged > 0) {
    const e = slimes.find((x) => x.vanillaId === 1);
    const d0 = g.entities.drops.length;
    e.hurt(1e9, 0, 0, g);
    const got = g.entities.drops.slice(d0).map((d) => ITEM_DEFS[d.itemId]?.key);
    res.slimeKill = { drops: got, coins: got.some((k) => (k ?? '').startsWith('coin')) };
  }
  // ② 心雕像（style 37 → item 58 pickup）
  const hd0 = g.entities.drops.length;
  for (let i = 0; i < 30; i++) fire(37, 20);
  const hearts = g.entities.drops.slice(hd0).filter((d) => d.pickup === 'heart').length;
  res.heartStatue = hearts > 0;
  // ③ mimic 雕像（style 27 → npc 85，rarity 0 → 击杀永无掉落）
  const mims = fire(27, 40);
  res.mimicSpawned = mims.filter((e) => e.vanillaId === 85).length;
  if (res.mimicSpawned > 0) {
    let any = 0;
    for (let k = 0; k < 10; k++) {
      const e = Enemy_fromVanilla ? null : null;
      break;
    }
    const m = mims.find((x) => x.vanillaId === 85);
    const d0 = g.entities.drops.length;
    m.hurt(1e9, 0, 0, g);
    res.mimicKillDrops = g.entities.drops.length - d0; // 应为 0（rarity 0）
  }
  // ④ 新雕像 80（[671,672]）
  const birds = fire(80, 60);
  res.statue80 = birds.filter((e) => e.vanillaId === 671 || e.vanillaId === 672).length;
  return res;
  function Enemy_fromVanilla() {}
});
console.log(JSON.stringify(out, null, 1));
const ok = out.slimeSpawned > 0 && out.slimeFlagged === out.slimeSpawned
  && out.slimeKill && !out.slimeKill.coins && out.slimeKill.drops.some((k) => k === 'gel')
  && out.heartStatue && out.mimicKillDrops === 0 && out.statue80 > 0;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
