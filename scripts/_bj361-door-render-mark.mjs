// BJ361 定谳探针 v2：高门/活板门开关「贴图不变化」——状态链 vs 渲染 mark 链分离判别。
// 门合成要求（BJ322 测试同款）：双锚 StrictSolid（门列上下端实心锚）+ 全帧域，
// 否则 checkDecorSquareFrame 的 CheckTallGate/CheckTrapDoor 完整性守卫即时判坏（正确行为）。
// 判据：toggle 后 tile.type 已切换（状态链 OK），但 ChunkCache.markDirty 全程零调用
// （渲染 mark 链断=裸写窗吃掉 onTileChanged 派发，ChunkCache.ts:300 唯一订阅口）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('361361', 1200, 800));
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const STONE = 1;
  const out = {};
  // ---- markDirty spy（渲染 mark 唯一失效口） ----
  const markCalls = [];
  const origMark = g.chunks.markDirty.bind(g.chunks);
  g.chunks.markDirty = (cx, cy) => { markCalls.push([cx, cy]); return origMark(cx, cy); };

  // ===== 高门 388/389：门列 gx0，行 60..64，双锚（59/65 行 dirt=solid），帧=行累进 0/20/38/56/74 =====
  // 合成走 suppressListeners 窗（PlaceTile 的 _decorPlaceBuilding 抑制同义）——
  // 逐格裸写会让 CheckTallGate 在半写态正确判坏（守卫不是 bug）
  const G = TILE_BY_KEY['v_388_tall_gate_closed'];
  const GO = TILE_BY_KEY['v_389_tall_gate_open'];
  const gx0 = 70, gy = 60;
  const FY = [0, 20, 38, 56, 74];
  st.suppressListeners = true;
  try {
    st.setTile(gx0, gy - 1, STONE); st.setTile(gx0, gy + 5, STONE);
    for (let dy = 0; dy < 5; dy++) st.setTile(gx0, gy + dy, G, 0, FY[dy]);
  } finally { st.suppressListeners = false; }
  await new Promise(r => setTimeout(r, 200));
  const gateOk0 = st.type[st.idx(gx0, gy)] === G;
  // 玩家挪离门列（blocked=overlapsEntity 不得挡）
  g.player.x = (gx0 - 8) * 16; g.player.y = 58 * 16; g.player.vx = 0; g.player.vy = 0;
  await new Promise(r => setTimeout(r, 200));
  markCalls.length = 0;
  g.toggleTallGate(gx0, gy, false);   // closing=false → 388→389 开
  await new Promise(r => setTimeout(r, 300));
  const typeOpen = st.type[st.idx(gx0, gy)];
  const marksOpen = markCalls.length;
  const marksOpenAt = JSON.stringify(markCalls);
  const flushOpen = g.chunks.lastFlushCount;
  markCalls.length = 0;
  g.toggleTallGate(gx0, gy, true);    // 389→388 关
  await new Promise(r => setTimeout(r, 300));
  out.tallGate = {
    gateOk0, typeOpen, typeBack: st.type[st.idx(gx0, gy)],
    typeSwitched: typeOpen === GO && st.type[st.idx(gx0, gy)] === G,
    marksOpen, marksOpenAt, marksClose: markCalls.length,
    marksCloseAt: JSON.stringify(markCalls),
    flushOpen, flushClose: g.chunks.lastFlushCount,
  };
  for (let dy = -1; dy <= 5; dy++) st.setTile(gx0, gy + dy, 0);

  // ===== 活板门 386/387：2×2 开态（frameX 0/18、frameY 0/18）=====
  const TP = TILE_BY_KEY['v_386_trapdooropen'];
  const TPC = TILE_BY_KEY['v_387_trap_door_closed'];
  const tx = 90, ty = 60;
  // 关态 387 占 2×1（底行），开态 386 占 2×2；锚：底行 dirt（CheckTrapDoor 侧锚/支撑面）
  // 合成走 suppressListeners 窗（同高门,防半写态被 CheckTrapDoor 判坏）
  st.suppressListeners = true;
  try {
    // 左右外格 StrictSolid（CheckTrapDoor 386 侧锚 cnt1 / 387 锚=本行左右外格）
    st.setTile(tx - 1, ty, STONE); st.setTile(tx - 1, ty + 1, STONE);
    st.setTile(tx + 2, ty, STONE); st.setTile(tx + 2, ty + 1, STONE);
    st.setTile(tx, ty, TP, 0, 0); st.setTile(tx + 1, ty, TP, 18, 0);
    st.setTile(tx, ty + 1, TP, 0, 18); st.setTile(tx + 1, ty + 1, TP, 18, 18);
    st.setTile(tx, ty + 2, STONE); st.setTile(tx + 1, ty + 2, STONE);
  } finally { st.suppressListeners = false; }
  await new Promise(r => setTimeout(r, 200));
  const tpOk0 = st.type[st.idx(tx, ty)] === TP;
  g.player.x = (tx + 1) * 16; g.player.y = (ty - 4) * 16; g.player.vx = 0; g.player.vy = 0;  // 玩家在门上方=playerAbove
  await new Promise(r => setTimeout(r, 200));
  markCalls.length = 0;
  g.toggleTrapdoor(tx, ty);
  await new Promise(r => setTimeout(r, 300));
  out.trapdoor = {
    tpOk0, tpAfter: st.type[st.idx(tx, ty + 1)],
    typeSwitched: st.type[st.idx(tx, ty + 1)] === TPC,
    marks: markCalls.length,
    flush: g.chunks.lastFlushCount,
  };
  for (let dy = 0; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) st.setTile(tx + dx, ty + dy, 0);
  g.chunks.markDirty = origMark;
  return out;
});
console.log(JSON.stringify(res, null, 2));
const tg = res.tallGate, td = res.trapdoor;
console.log(`\n[verdict] 状态链: 高门=${tg.typeSwitched ? 'OK' : 'FAIL'} 活板门=${td.typeSwitched ? 'OK' : 'FAIL'}`);
console.log(`[verdict] 渲染mark: 高门开/关=${tg.marksOpen}/${tg.marksClose} 活板门=${td.marks} → ${(tg.marksOpen === 0 && tg.marksClose === 0 && td.marks === 0) ? '断链复现（贴图不变化定谳）' : '链路通畅'}`);
await browser.close();
