// 城镇 NPC 地形通过能力探针(VFP_STAGE 选段):
//   slopeA/slopeB : 单行抬升台的左/右缘坡面(slope 字节 1|4 左缘 / 2|3 右缘)
//   halfbrick     : 同形但边缘列 half=true
//   platform      : 中段 3 列换平台(悬空跨越)
//   gapjump       : 中段挖 3 列深坑(靠 obstacleJump 自动跳)
//   doorreopen    : 关门在右侧,NPC 自然走向并开门(验证 family 修复后的到达性)
// 输出 {reached, maxX, minX, stuckMs, ascended} ——reached=越过目标线。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = process.env.VFP_MAP ?? '/Users/vinlic/Downloads/map-FTW_V2 (8).json';
const STAGE = process.env.VFP_STAGE ?? 'slopeA';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 900, height: 640 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(3500);
const setup = await p.evaluate(async (stage) => {
  const g = window.__swGame;
  const st = g.world.store;
  const td = await import('/src/data/tiles.ts');
  const TN = await import('/src/entities/TownNPC.ts');
  const SOLID = td.TILE_BY_KEY['stone'] ?? 2;
  // 平台内部 id:sheet19 首个 def
  let PLATFORM = -1;
  for (const d of td.TILE_DEFS) if (d?.vanilla?.sheet === 19) { PLATFORM = td.TILE_DEFS.indexOf(d); break; }
  const WOODP = (xx, yy, t = SOLID) => { const i = st.idx(xx, yy); st.type[i] = t; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0; };
  const AIRR = (xx, yy) => { const i = st.idx(xx, yy); st.flags[i] = 0; st.type[i] = 0; };
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  const Sx = px + 14, Sy = Math.max(60, py - 30);
  // 清空走廊 60×10
  for (let yy = Sy - 4; yy < Sy + 8; yy++) {
    for (let xx = Sx - 4; xx < Sx + 56; xx++) { const i = st.idx(xx, yy); st.flags[i] = 0; st.type[i] = 0; st.wire[i] = 0; }
  }
  const FLOOR = Sy + 6;
  const SPAN0 = Sx, SPAN1 = Sx + 48;                    // 走廊地横 [SPAN0,SPAN1]
  let GOAL = SPAN1 - 4;
  const isRaisedStage = stage === 'slopeA' || stage === 'slopeB' || stage === 'halfbrick';
  let doorX = -1;
  if (isRaisedStage) {
    for (let xx = SPAN0; xx <= SPAN1; xx++) WOODP(xx, FLOOR);
    const RX0 = Sx + 18, RX1 = Sx + 34;
    for (let xx = RX0; xx <= RX1; xx++) WOODP(xx, FLOOR - 1);
    GOAL = RX1 + 10;
    const edgeL = RX0 - 1, edgeR = RX1 + 1;
    if (stage === 'slopeA') {
      let iL = st.idx(edgeL, FLOOR - 1); st.flags[iL] = 1; st.type[iL] = SOLID; st.slope[iL] = 1;
      let iR = st.idx(edgeR, FLOOR - 1); st.flags[iR] = 1; st.type[iR] = SOLID; st.slope[iR] = 2;
      WOODP(edgeL, FLOOR); WOODP(edgeR, FLOOR);
    } else if (stage === 'slopeB') {
      let iL = st.idx(edgeL, FLOOR - 1); st.flags[iL] = 1; st.type[iL] = SOLID; st.slope[iL] = 4;
      let iR = st.idx(edgeR, FLOOR - 1); st.flags[iR] = 1; st.type[iR] = SOLID; st.slope[iR] = 3;
      WOODP(edgeL, FLOOR); WOODP(edgeR, FLOOR);
    } else {
      let iL = st.idx(edgeL, FLOOR - 1); st.flags[iL] = 1; st.type[iL] = SOLID; st.half[iL] = 1;
      let iR = st.idx(edgeR, FLOOR - 1); st.flags[iR] = 1; st.type[iR] = SOLID; st.half[iR] = 1;
      WOODP(edgeL, FLOOR); WOODP(edgeR, FLOOR);
    }
  } else if (stage === 'platform') {
    for (let xx = SPAN0; xx <= SPAN1; xx++) { if (xx < Sx + 20 || xx > Sx + 24) WOODP(xx, FLOOR); else WOODP(xx, FLOOR - 3, PLATFORM); }
    GOAL = Sx + 42;
  } else if (stage === 'gapjump') {
    for (let xx = SPAN0; xx <= SPAN1; xx++) { if (xx >= Sx + 20 && xx <= Sx + 23) continue; WOODP(xx, FLOOR); }
    GOAL = Sx + 42;
  } else { // doorreopen
    for (let xx = SPAN0; xx <= SPAN1; xx++) WOODP(xx, FLOOR);
    const DC = td.TILE_BY_KEY['door_closed'];
    let tpl = null;
    outer2:
    for (let y = 40; y < st.h - 20 && !tpl; y++)
      for (let x = 200; x < st.w - 200 && !tpl; x += 2)
        if (st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === DC
          && st.type[st.idx(x, y + 1)] === DC && st.type[st.idx(x, y + 2)] === DC) { tpl = { x, y }; break outer2; }
    if (!tpl) return { error: 'no-template-door' };
    doorX = SPAN1 - 12;
    for (let dy = 0; dy < 3; dy++) {
      const i = st.idx(doorX, FLOOR - 3 + dy);
      st.type[i] = DC; st.flags[i] = 1;
      st.frameX[i] = st.frameX[st.idx(tpl.x, tpl.y)];
      st.frameY[i] = st.frameY[st.idx(tpl.x, tpl.y + dy)];
    }
    GOAL = doorX + 3;
  }
  const startX = Sx + (stage === 'doorreopen' ? 4 : 2);
  const n = new TN.TownNPC('guide', 0, 0);
  n.x = startX * 16; n.y = FLOOR * 16 - n.h;
  g.entities.add(n, 'npcs');
  n.onGround = true;

  // 决策源压制:恒向右走(真实速度/碰撞/跳障流水线保留)
  const P = TN.TownNPC.prototype;
  const oW = P.wanderUpdate, oS = P.socialUpdate, oA = P.attackUpdate;
  P.wanderUpdate = function () { return 1; };
  P.socialUpdate = function () { return false; };
  P.attackUpdate = function () { return false; };

  // 页面内 tick:测量进度/卡死/开门(door 段)
  const t0 = performance.now();
  let maxX = n.cx, maxXAt = t0, minYTop = 1e9, openedAt = -1;
  const DOOR_O2 = td.TILE_BY_KEY['door_open'];
  window.__terrainTick = () => {
    if (!n.dead && n.onGround && n.stuckT !== undefined) { /* noop */ }
    if (n.cx > maxX + 0.5) { maxX = Math.max(maxX, n.cx); maxXAt = performance.now(); }
    minYTop = Math.min(minYTop, n.y);
    if (stage === 'doorreopen') {
      const atD = st.type[st.idx(doorX, FLOOR - 3)];
      if (atD === DOOR_O2 && openedAt < 0) openedAt = Math.round(performance.now() - t0);
    }
    const nowT2 = performance.now();
    const stuckMs = Math.round(nowT2 - maxXAt);
    const done = n.cx / 16 >= GOAL || (stage === 'doorreopen' && openedAt >= 0 && n.cx / 16 >= doorX + 2);
    return { done, progressPx: Math.round(n.cx - startX * 16), goalLeftPx: Math.round(GOAL * 16 - n.cx),
      maxX: Math.round(maxX), minXSeen: Math.round(Math.min(minYTop)), stuckMs,
      ascendedToRow: Math.round((FLOOR * 16 - n.y) / 16), openedAt, dead: !!n.dead };
  };
  window.__terrainCleanup = () => {
    try { n.dead = true; P.wanderUpdate = oW; P.socialUpdate = oS; P.attackUpdate = oA; } catch {}
  };
  return { ok: true, goal: GOAL, startTile: startX, platformId: PLATFORM };
})
if (!setup.ok) { console.log(JSON.stringify(setup)); await b.close(); process.exit(1); }

// Node 侧轮询 15s
let final = null;
for (let k = 0; k < 130; k++) {
  final = await p.evaluate(() => window.__terrainTick());
  if (final.done) break;
  await sleep(115);
}
await p.evaluate(() => window.__terrainCleanup());
console.log(JSON.stringify({ stage: STAGE, ...final }));
fs.writeFileSync(`/Users/vinlic/.claude/jobs/4a66e745/tmp/npc-terrain-${STAGE}.json`, JSON.stringify({ stage: STAGE, ...final }));
await b.close();
