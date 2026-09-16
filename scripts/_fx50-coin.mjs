// 一次性:钱币经济审计探针（2026-09-16 FX50）——私有 vite 5251。
// ① 杀 100 只肉前常见怪（僵尸40/蓝史莱姆30/恶魔眼20/洞穴蝙蝠10）走真实死亡掉落链;
// ② 摆 50 只罐并逐只 smashPot（地下 ×0.75 深度档,玩家携 20 火把 → num10∈{0,6} 币档 2/7）;
// ③ 总铜值 vs 原版期望带宽;截图 /tmp/fx50-coin.png。
// 旧 bug 基线:每只币档罐直掉 100-300 金币堆叠(=10⁶-3×10⁶ 铜)——修复后必落带宽内。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
const t0 = Date.now();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('GAME_NOT_READY'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const w = g.world;
  // ---- 掉落捕获：包一层 spawnDrop,只记钱币 vi_71/72/73/74_ ----
  const FACE = { 71: 1, 72: 100, 73: 10000, 74: 1000000 };
  const coinDrops = [];
  const realSpawnDrop = g.spawnDrop.bind(g);
  g.spawnDrop = (x, y, key, n, vx, vy) => {
    const m = /^vi_(7[1-4])_/.exec(key);
    if (m) coinDrops.push({ src: curSrc, vid: Number(m[1]), n });
    return realSpawnDrop(x, y, key, n, vx, vy);
  };
  let curSrc = 'monster';
  // ---- ① 杀 100 只肉前怪（真实 Enemy 死亡链,非直调 rollCoins）----
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const plan = [[3, 40], [1, 30], [2, 20], [49, 10]];   // 僵尸/蓝史莱姆/恶魔眼/洞穴蝙蝠
  let killed = 0;
  const px = g.player.cx, py = g.player.cy;
  for (const [id, count] of plan) {
    for (let i = 0; i < count; i++) {
      const e = Enemy.fromVanilla(id, px + 200 + (i % 10) * 40, py - 40);
      if (!e) continue;
      curSrc = `npc${id}`;
      e.hurt(e.hp + 500, 0, 0, g, 0, false, 1, true);   // 致死一发（pierce=1 豁免免疫帧）
      if (e.dead) killed++;
    }
  }
  const monsterCopper = coinDrops.reduce((s, d) => s + FACE[d.vid] * d.n, 0);
  const monsterByVid = {};
  for (const d of coinDrops) if (d.src.startsWith('npc')) monsterByVid[d.vid] = (monsterByVid[d.vid] ?? 0) + d.n;
  coinDrops.length = 0;

  // ---- ② 50 只罐（地下:地表下 30 格、岩石层上）----
  const tiles = await import('/src/data/tiles.ts');
  const POT = tiles.TILE_DEFS.findIndex((d) => d && d.vanilla && d.vanilla.sheet === 28);
  if (POT <= 0) return { error: 'POT_DEF_NOT_FOUND' };
  const st = w.store;
  const baseX = Math.floor(px / TILE) - 30;
  let baseY = Math.floor(w.groundLevel) + 30;          // 地下(≥surface,<rockLayer) → ×0.75
  if (baseY >= w.rockLevel) baseY = Math.floor((w.groundLevel + w.rockLevel) / 2);
  // 清场 + 地板
  for (let dy = -4; dy <= 1; dy++) for (let dx = -40; dx <= 40; dx++) {
    st.setTileSilent(baseX + dx, baseY + dy, 0, 0, 0);
    st.liquid[st.idx(baseX + dx, baseY + dy)] = 0;
  }
  for (let dx = -40; dx <= 40; dx++) st.setTileSilent(baseX + dx, baseY + 1, 1, 0, 0);
  // 玩家携 20 火把（:57487-57504 计数≥20 → num10==0 也走钱币,2/7 币档）
  const items = await import('/src/data/items.ts');
  const torchIdx = items.ITEM_DEFS.findIndex((d) => /^vi_8_/.test(d?.key ?? ''));
  for (let k = 0; k < 20; k++) g.player.inv.slots[10 + k] = { id: torchIdx, stack: 1 };
  curSrc = 'pot';
  let potsSmashed = 0;
  for (let i = 0; i < 50; i++) {
    const x = baseX + 4 + (i % 25) * 3, y = baseY - ((i / 25) | 0) * 3;
    // 摆 2×2 罐（帧 0/18）
    st.setTileSilent(x, y, POT, 0, 0);
    st.setTileSilent(x + 1, y, POT, 18, 0);
    st.setTileSilent(x, y + 1, POT, 0, 18);
    st.setTileSilent(x + 1, y + 1, POT, 18, 18);
    g.smashPot(x, y);
    potsSmashed++;
  }
  const potCopper = coinDrops.reduce((s, d) => s + FACE[d.vid] * d.n, 0);
  const potCoinPots = new Set(coinDrops.map((d, i) => i)).size; // 近似:有币掉落的次数
  const potByVid = {};
  for (const d of coinDrops) potByVid[d.vid] = (potByVid[d.vid] ?? 0) + d.n;
  g.spawnDrop = realSpawnDrop;

  // ---- ③ 期望对照（原版公式解析值）----
  // 怪:E[乘区链]≈1.275×1.0375²×1.0281×1.0188×1.0117×1.0117≈1.4714(拆币裂变小损→实测略低)
  // 罐:地下 ×0.75,E≈200×0.75×1.1375≈170.6/币档罐 × 2/7 × 50 ≈ 2437
  const monsterExp = (40 * 60 + 30 * 25 + 20 * 75 + 10 * 90) * 1.40;  // 裂变损耗后保守
  const potExp = 200 * 0.75 * 1.1375 * (2 / 7) * 50;
  return {
    killed, potsSmashed,
    monsterCopper, monsterExp, monsterRatio: +(monsterCopper / monsterExp).toFixed(3),
    potCopper, potExp, potRatio: +(potCopper / potExp).toFixed(3),
    monsterByVid, potByVid,
    oldBugCopperIfUnfixed: Math.round(potExp / 0.01),   // 旧 bug 量级提示(×10⁴/币档罐)
    depth: { groundLevel: w.groundLevel, rockLevel: w.rockLevel, potY: baseY },
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/fx50-coin.png' });
console.log('SHOT=/tmp/fx50-coin.png ms=' + (Date.now() - t0));
await browser.close();
