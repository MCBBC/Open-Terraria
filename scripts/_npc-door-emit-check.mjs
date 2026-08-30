// npcDoorNet 事件接线最小断言:复用 _npc-door-live 的沙盒(独立重跑),
// 冻结 Math.random=0 促概率门首击必中,单次 drive 后必须见到 1 条 open 事件。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = process.env.VFP_MAP ?? '/Users/vinlic/Downloads/map-FTW_V2 (8).json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(3500);
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const td = await import('/src/data/tiles.ts');
  const TN = await import('/src/entities/TownNPC.ts');
  const DOOR_C = td.TILE_BY_KEY['door_closed'];
  const DOOR_O = td.TILE_BY_KEY['door_open'];
  const WOOD = td.TILE_BY_KEY['wood'] ?? td.TILE_BY_KEY['stone'] ?? 2;
  let tpl = null;
  outer:
  for (let y = 40; y < st.h - 20 && !tpl; y++)
    for (let x = 200; x < st.w - 200 && !tpl; x += 2)
      if (st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] === DOOR_C
        && st.type[st.idx(x, y + 1)] === DOOR_C && st.type[st.idx(x, y + 2)] === DOOR_C) { tpl = { x, y }; break outer; }
  if (!tpl) return { error: 'no-door' };
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  const Sx = px + 14, Sy = Math.max(60, py - 26);
  for (let yy = Sy - 4; yy < Sy + 11; yy++) for (let xx = Sx - 6; xx < Sx + 36; xx++) {
    const i = st.idx(xx, yy); st.flags[i] = 0; st.type[i] = 0; st.wire[i] = 0;
  }
  const FLOOR = Sy + 7;
  for (let xx = Sx - 4; xx < Sx + 32; xx++) { const i = st.idx(xx, FLOOR); st.type[i] = WOOD; st.flags[i] = 1; }
  const dX = Sx + 10, dY0 = FLOOR - 3;
  for (let dy = 0; dy < 3; dy++) {
    const i = st.idx(dX, dY0 + dy); st.type[i] = DOOR_C; st.flags[i] = 1;
    st.frameX[i] = st.frameX[st.idx(tpl.x, tpl.y)]; st.frameY[i] = st.frameY[st.idx(tpl.x, tpl.y + dy)];
  }
  const n = new TN.TownNPC('guide', 0, 0);
  n.x = (dX + 1.05) * 16 - n.w / 2; n.y = FLOOR * 16 - n.h;
  g.entities.add(n, 'npcs');
  const evs = [];
  const origNet = g.npcDoorNet?.bind(g);
  g.npcDoorNet = (...a) => { evs.push(a.map(String)); if (origNet) origNet(...a); };
  const savedRandom = Math.random; Math.random = () => 0;   // 概率门必中
  let fatal = null;
  try { n.hitWall = true; n.facing = -1; n.npcDoorUpdate(g.world, g); } catch (e) { fatal = String(e); }
  Math.random = savedRandom;
  return {
    anchorAfter: st.type[st.idx(dX, dY0)], expectOpen: DOOR_O,
    carry: n.doorCarry === true, evs, fatal,
    npcDoorNetTypeOfOnGameBeforeRestore: typeof g.npcDoorNet,
    isSameGameRef: g === window.__swGame,
  };
});
console.log(JSON.stringify(out));
fs.writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/npc-door-emit.json', JSON.stringify(out));
await b.close();
