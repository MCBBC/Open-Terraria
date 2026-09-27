// ★BJ370 旗帜 z 序定谳探针：场景=背景墙+击杀旗 91(1x3)+桌 14(2x1)+箱 21(2x2 solid)+石块对照。
// 产出：两张定格截图（旗摆相位差）+ 烘焙/摆层账本（91 应不在 bakes=sway 摘除生效）。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj370-banner-zorder.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { screenshot, camSnapToTile } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
L.chk('createGame', gen.ok, gen.why ?? '');

const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const tmap = (await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET;
  const byKey = (s) => tmap.get(s);
  const tStone = byKey(1), tBanner = byKey(91), tTable = byKey(14), tChest = byKey(21);
  if (!tBanner || !tTable || !tChest || !tStone) return { fail: 'def missing', tBanner, tTable, tChest, tStone };
  // 出生点（地表）附近找近平台地：以玩家坐标为锚向两侧扫
  const sx = Math.floor(g.player.x / 16), sy = Math.floor(g.player.y / 16);
  let ox = -1, oy = -1;
  outer:
  for (let y = Math.max(20, sy - 80); y < sy + 80; y++) for (let x = sx - 120; x < sx + 120; x++) {
    let ok = true;
    for (let dx = 0; dx < 6 && ok; dx++) {
      if (!st.flags[st.idx(x + dx, y)]) ok = false;
      for (let dy = 1; dy <= 2 && ok; dy++) if (st.flags[st.idx(x + dx, y - dy)]) ok = false;
    }
    if (ok) { ox = x + 2; oy = y; break outer; }
  }
  if (ox < 0) return { fail: 'no flat ground' };
  const gy = oy;                    // 地表行（第一行 solid）
  // 清空工作区 + 铺背景墙（1=石墙）
  for (let y = gy - 5; y <= gy - 1; y++) for (let x = ox - 4; x <= ox + 6; x++) {
    if (st.flags[st.idx(x, y)]) st.setTile(x, y, 0);
    st.setWall(x, y, 1);
  }
  // 击杀旗 91：1x3，根格 gy-3，底格 gy-1
  for (let dy = 0; dy < 3; dy++) st.setTile(ox, gy - 3 + dy, tBanner);
  // 桌 14：2x1，紧贴旗右（底行与旗底格同排 gy-1）
  for (let dx = 0; dx < 2; dx++) st.setTile(ox + 1 + dx, gy - 1, tTable);
  // 箱 21（solid）：旗左邻 2x2
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) st.setTile(ox - 2 + dx, gy - 2 + dy, tChest);
  // 石块对照柱（solid）
  for (let dy = 0; dy < 3; dy++) st.setTile(ox + 5, gy - 3 + dy, tStone);
  return { ox, gy, tBanner, tTable, tChest };
});
L.chk('场景落位', !!scene.ox, JSON.stringify(scene));
if (!scene.ox) { L.print(); process.exit(L.exitCode()); }

// 相机/玩家对准，zoom 拉近
await page.evaluate(({ ox, gy }) => {
  const g = window.__swGame;
  g.camera.zoom = 4;
  g.player.x = (ox + 1.5) * 16; g.player.y = (gy - 2) * 16;
}, scene);
await camSnapToTile(page, scene.ox + 1, scene.gy - 2, { player: false });
await freezeClock(page, { tod: 0.5 });
await pump(page, 10);

const s1 = await screenshot(page, "/tmp/bj370-banner-frozen", { time: 0.5, freeze: false, onDark: "auto", convergeTicks: 0 });
L.chk('定格截图', s1.ok, s1.why ?? '');

// 账本：91 应不在烘焙（sway 摘除）；WindSway 面自证
const books = await page.evaluate(async () => {
  const cap = window.__swTileCap;
  const WS = await import('/src/render/WindSway.ts');
  const id91 = (await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET.get(91);
  return {
    bake91: cap?.bakes?.get?.(id91)?.n ?? 'no-key',
    swaySkip91: WS.swayBakeSkip(id91, 0),
  };
});
const books2 = await page.evaluate(({ ox, gy }) => {
  const st = window.__swGame.world.store;
  return { flagTypes: [0, 1, 2].map((dy) => st.type[st.idx(ox, gy - 3 + dy)]),
           tableTypes: [0, 1].map((dx) => st.type[st.idx(ox + 1 + dx, gy - 1)]),
           wallBehind: st.wall[st.idx(ox, gy - 2)] };
}, scene);
console.log('BOOKS:', JSON.stringify({ bake91: books.bake91, swaySkip91: books.swaySkip91, ...books2 }));

// 第二张：特写（玩家挪开不挡桌；zoom 直写后立即拍，防 follow 重置）
await page.evaluate(({ ox, gy }) => {
  const g = window.__swGame;
  g.player.x = (ox + 4) * 16; g.player.y = (gy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = (ox + 1) * 16; g.camera.y = (gy - 2) * 16; g.camera.zoom = 6;
}, scene);
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(({ ox, gy }) => {
  const g = window.__swGame;
  g.camera.x = (ox + 1) * 16; g.camera.y = (gy - 2) * 16; g.camera.zoom = 6;
}, scene);
const s2 = await screenshot(page, "/tmp/bj370-banner-live", { time: 0.5, freeze: false, onDark: "off", convergeTicks: 0 });
L.chk('活摆特写', s2.ok, s2.why ?? '');

console.log(JSON.stringify(L.out(), null, 1));
process.exit(L.exitCode());
