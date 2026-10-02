// BJ437 实机探针：着火敌怪火焰粒子四族实拍（onFire 6 / hellfire 6 / cursed 75 / frostburn 135）
// + vanillaDust 池逐型计数（定量面）。SW_ORIGIN=http://localhost:5830
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1200));

const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  g.setupDevMode();
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const DIRT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 0);
  const m = await import('/src/entities/Enemy.ts');
  const p0x = Math.floor(g.world.spawnX), p0y = Math.floor(g.world.spawnY);
  // 平地垫（spawn 下方右移）：清 40×10 → 铺 3 行泥土
  const S = p0x + 6, base = p0y + 2;
  for (let x = S - 20; x <= S + 20; x++) {
    for (let y = base - 8; y <= base + 4; y++) {
      if (st.inBounds(x, y)) st.setTileSilent(x, y, 0, 0, 0);
    }
  }
  for (let x = S - 20; x <= S + 20; x++) {
    for (let y = base; y <= base + 2; y++) if (st.inBounds(x, y)) st.setTileSilent(x, y, DIRT, 0, 0);
  }
  if (g.chunks?.markDirtyArea) g.chunks.markDirtyArea(S - 21, base - 9, S + 21, base + 5);
  // 四只僵尸横排（每只间隔 6 格），玩家站位让相机覆盖全排
  const ids = [];
  const buffs = ['onFire', 'hellfire', 'cursed', 'frostburn'];
  for (let i = 0; i < 4; i++) {
    const e = m.Enemy.fromVanilla(3, (S - 9 + i * 6) * 16, (base - 3) * 16);
    if (!e) return { fail: `spawn ${i} failed` };
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    ids.push(e.id);
    e.onFireT = 0; e.onFire3T = 0; e.cursedT = 0; e.frostburnT = 0;
    if (buffs[i] === 'onFire') e.onFireT = 600;
    if (buffs[i] === 'hellfire') e.onFire3T = 600;
    if (buffs[i] === 'cursed') e.cursedT = 600;
    if (buffs[i] === 'frostburn') e.frostburnT = 600;
  }
  const p = g.player;
  p.x = (S + 8) * 16; p.y = (base - 3) * 16;
  p.vx = 0; p.vy = 0; p.immune = 120;
  window.__bj437 = { ids, buffs, S, base };
  return { ok: true, ids, buffs, spawn: { S, base } };
});
console.log('[prep]', JSON.stringify(prep));
if (prep.fail) { await browser.close(); process.exit(1); }

// 关欢迎覆层（WelcomeAnnounce 未 ack 会整幅压在画面上）
const acked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
  if (btn) { btn.click(); return true; }
  return false;
});
console.log('[ack]', acked);
await new Promise((r) => setTimeout(r, 400));

// 燃烧 1.2s 后抓拍（火焰尘 75%/拍 → 满屏火焰）
await new Promise((r) => setTimeout(r, 1200));
const census = await page.evaluate(() => {
  const g = window.__swGame;
  const pool = g.vanillaDust?.pool ?? [];
  const byType = {};
  for (const d of pool) if (d.active) byType[d.type] = (byType[d.type] ?? 0) + 1;
  const ids = window.__bj437.ids;
  const ents = (g.enemies?.() ?? []).filter((e) => ids.includes(e.id));
  return {
    dustByType: byType,
    enemies: ents.map((e) => ({
      id: e.id, onFireT: Math.round(e.onFireT), onFire3T: Math.round(e.onFire3T),
      cursedT: Math.round(e.cursedT), frostburnT: Math.round(e.frostburnT),
      lightRGB: e.lightRGB, x: Math.round(e.x), y: Math.round(e.y),
    })),
  };
});
console.log('[census]', JSON.stringify(census));
await page.screenshot({ path: 'docs/evidence/bj437/burn-family-4panel.png' });

// 近景：相机怼住第一只（onFire 僵尸）
const closeup = await page.evaluate(async () => {
  const g = window.__swGame;
  const ids = window.__bj437.ids;
  const e = (g.enemies?.() ?? []).find((x) => x.id === ids[0]);
  if (!e) return { fail: 'burn enemy gone' };
  e.onFireT = 600;                      // 续燃
  g.player.x = e.x + 60; g.player.y = e.y - 10;
  g.player.vx = 0; g.player.vy = 0; g.player.immune = 120;
  return { ok: true, at: { x: Math.round(e.x), y: Math.round(e.y) } };
});
console.log('[closeup]', JSON.stringify(closeup));
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'docs/evidence/bj437/burn-closeup.png' });

// 尾拍普查（近景下 dust 6 活性数）
const tail = await page.evaluate(() => {
  const g = window.__swGame;
  const pool = g.vanillaDust?.pool ?? [];
  let n6 = 0;
  for (const d of pool) if (d.active && d.type === 6) n6++;
  return { activeDust6: n6 };
});
console.log('[tail]', JSON.stringify(tail));
await browser.close();
console.log('[done] evidence at game/docs/evidence/bj437/');
