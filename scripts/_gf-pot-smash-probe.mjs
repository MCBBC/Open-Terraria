// 冰川之牙弹体砍瓦罐探针（2026-08-26 用户报：发射的冰矛穿罐不碎）。
// 原版链：Projectile.Damage→CutTiles(:12517/:15276)→CutTilesAt 弹盒扫 tileCut 物
// （CanCutTiles :15407 排除表无 1115）——瓦罐(28)非实心 decor，弹盒扫到即整罐碎。
// 断言：
//   A0 场景自洽：瓦罐已就位（POT）
//   A1 蓄力释放后 ≤4s 瓦罐被碎（两格均清零）+ 掉落物产生
//   A2 回归：同场景石墙仍能挡死弹体（撞实心消亡语义未坏）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);

// ---- 搭测试场：玩家左侧平地，右前方 2×2 瓦罐坐在石台上，直线弹道无遮挡 ----
const scene = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const POT = TILE_BY_KEY['pot'];
  const STONE = TILE_BY_KEY['stone'] ?? TILE_BY_KEY['v_1_stone'];
  const bx = Math.floor(g.player.cx / 16), by = Math.floor(g.player.cy / 16);
  // 清空矩形（含头顶），铺地板
  for (let dx = -8; dx <= 10; dx++) for (let dy = -9; dy <= 4; dy++) {
    const x = bx + dx, y = by + dy;
    if (st.inBounds(x, y)) st.setTile(x, y, 0);
  }
  const fy = by + 3;                       // 地板顶行
  for (let dx = -8; dx <= 10; dx++) if (st.inBounds(bx + dx, fy)) st.setTile(bx + dx, fy, STONE, 0, 0);
  // 瓦罐 2×2 坐台（锚=底行；底行 frameY=0 / 顶行 frameY=18——Game.ts 瓦罐分支注记）
  const px = bx + 6;
  st.setTile(px, fy - 1, POT, 0, 0);       // 底左
  st.setTile(px + 1, fy - 1, POT, 18, 0);  // 底右
  st.setTile(px, fy - 2, POT, 0, 18);      // 顶左
  st.setTile(px + 1, fy - 2, POT, 18, 18); // 顶右
  // A2 对照墙：更右侧竖一道 2×3 石墙（弹道穿过处）
  for (let dy = -1; dy <= 1; dy++) {
    st.setTile(bx + 12, fy - 1 + dy, STONE, 0, 0);
    st.setTile(bx + 13, fy - 1 + dy, STONE, 0, 0);
  }
  // 装备冰川之牙 + 满 蓝
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 300; g.player.baseMaxMana = 300;
  // 站位：瓦罐左 5 格
  g.player.x = (bx - 3) * 16 + 8 - g.player.w / 2;
  g.player.y = fy * 16 - g.player.h;                   // 脚踩在地板顶行上表面
  g.player.vx = 0; g.player.vy = 0;
  return { POT, potCells: [[px, fy - 1], [px + 1, fy - 1], [px, fy - 2], [px + 1, fy - 2]], wallCol: bx + 12 };
});
await sleep(600);

// 瞄准瓦罐下排中心（水平略下压，重力小可直中）
const aim = await p.evaluate((sc) => {
  const g = window.__swGame;
  const [ax, ay] = sc.potCells[0];
  const wx = ax * 16 + 16, wy = ay * 16 + 8;   // 瓦罐下排中心
  const [sx, sy] = g.camera.worldToScreen(wx, wy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  return { sx: Math.round(sx), sy: Math.round(sy) };
}, scene);

// ---- 蓄力释放 ----
await p.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.__pin = setInterval(() => { g.input.mouseDown = true; g.input.mouseHeld = true; }, 40);
});
let orbSeen = false;
for (let i = 0; i < 50 && !orbSeen; i++) {
  await sleep(50);
  orbSeen = await p.evaluate(() => (window.__swGame.entities?.all?.() ?? []).some((e) => e && e.projId === 1115));
}
await sleep(500);                              // charge≈35-45
await p.evaluate(() => { clearInterval(window.__swGame.__pin); window.__swGame.input.mouseDown = false; window.__swGame.input.mouseHeld = false; });

// ---- 轮询瓦罐碎裂 ----
let smashed = false, dropsSeen = 0;
for (let i = 0; i < 80 && !smashed; i++) {
  await sleep(50);
  const r = await p.evaluate((sc) => {
    const g = window.__swGame;
    const cleared = sc.potCells.filter(([x, y]) => g.world.store.get(x, y) === 0).length;
    const drops = (g.entities?.drops ?? []).length;
    return { cleared, drops };
  }, scene);
  dropsSeen = Math.max(dropsSeen, r.drops);
  if (r.cleared >= 4) { smashed = true; break; }
}
const afterShot = await p.evaluate(() => {
  const g = window.__swGame;
  return {
    shots: (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115).length,
  };
});

// ---- A2 回归：再发一发打石墙，弹体应亡且墙完好 ----
await sleep(1500);                             // 等上一发消亡
await p.evaluate(() => {
  const g = window.__swGame;
  const pl = g.player;
  const [sx, sy] = g.camera.worldToScreen(pl.cx + 13 * 16, pl.cy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.__pin2 = setInterval(() => { g.input.mouseDown = true; g.input.mouseHeld = true; }, 40);
});
await sleep(400);
await p.evaluate(() => { clearInterval(window.__swGame.__pin2); window.__swGame.input.mouseDown = false; window.__swGame.input.mouseHeld = false; });
await sleep(1200);
const wallTest = await p.evaluate(() => {
  const g = window.__swGame;
  const shots = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115).length;
  return { remainingShots: shots };
});

console.log(JSON.stringify({
  orbSeen, aim,
  A0_potPlaced: !!scene.POT,
  A1_potSmashed: smashed,
  dropsPeak: dropsSeen,
  shotsAliveAfter: afterShot.shots,
  A2_wallShotDead: wallTest.remainingShots === 0,
}, null, 2));
await b.close();
