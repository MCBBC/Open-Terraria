// 城镇 NPC 开关门端到端实测 v3:
//   Phase1 自然游走 30s(零干预);Phase2 开启 __forceWalk 原型压制(仍走完整
//   fixedUpdate 流水线:碰撞/npcDoorUpdate/msg19 上行全真)。断言时序 关→开+carry
//   →过门±2→关回。附带用户场景对照:NPC 起点在门外、home 标注在门内侧。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = process.env.VFP_MAP ?? needInput(join(DOWNLOADS, 'map-FTW_V2 (8).json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 900, height: 640 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(3500);
const setup = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const td = await import('/src/data/tiles.ts');
  const TN = await import('/src/entities/TownNPC.ts');
  const DOOR_C = td.TILE_BY_KEY['door_closed'];
  const DOOR_O = td.TILE_BY_KEY['door_open'];
  const WOOD = td.TILE_BY_KEY['wood'] ?? td.TILE_BY_KEY['stone'] ?? 2;
  let tpl = null;
  outer:
  for (let y = 40; y < st.h - 20 && !tpl; y++) {
    for (let x = 200; x < st.w - 200; x += 2) {
      if (!st.flags[st.idx(x, y)]) continue;
      if (st.type[st.idx(x, y)] === DOOR_C && st.type[st.idx(x, y + 1)] === DOOR_C
        && st.type[st.idx(x, y + 2)] === DOOR_C) { tpl = { x, y }; break outer; }
    }
  }
  if (!tpl) return { error: 'no-template-door' };
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  const Sx = px + 14, Sy = Math.max(60, py - 26);
  for (let yy = Sy - 4; yy < Sy + 11; yy++) {
    for (let xx = Sx - 6; xx < Sx + 36; xx++) {
      const i = st.idx(xx, yy); st.flags[i] = 0; st.type[i] = 0; st.wire[i] = 0;
    }
  }
  const FLOOR = Sy + 7;
  for (let xx = Sx - 4; xx < Sx + 32; xx++) {
    const i = st.idx(xx, FLOOR); st.type[i] = WOOD; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  const dX = Sx + 10, dY0 = FLOOR - 3;
  for (let dy = 0; dy < 3; dy++) {
    const i = st.idx(dX, dY0 + dy);
    st.type[i] = DOOR_C; st.flags[i] = 1;
    st.frameX[i] = st.frameX[st.idx(tpl.x, tpl.y)];
    st.frameY[i] = st.frameY[st.idx(tpl.x, tpl.y + dy)];
  }
  const n = new TN.TownNPC('guide', 0, 0);
  n.x = (dX + 6) * 16; n.y = FLOOR * 16 - n.h;
  g.entities.add(n, 'npcs');
  // home 语义对齐用户场景:标注 home 在门内侧(左),起点在右(外)
  n.home = { x: dX - 4, y: FLOOR };
  n.anchorTile = null;
  n.onGround = true;

  const evs = [];
  const origNet = g.npcDoorNet?.bind(g);
  g.npcDoorNet = (...a) => { evs.push(a.map(String)); if (origNet) origNet(...a); };

  // 两阶段推进
  let phase = 'natural';       // natural -> forced -> crossWait -> done
  const t0 = performance.now();
  let openedAt = -1, closedAgainAt = -1;
  const P = TN.TownNPC.prototype;
  const origFU = P.fixedUpdate;
  const origWander = P.wanderUpdate;
  const origSocial = P.socialUpdate;
  const origAttack = P.attackUpdate;
  let forceOn = false;
  const samples = []; let scanCalls = 0, scanHandled = 0;
  const origScan = P.tryOpenDoorAhead;
  P.tryOpenDoorAhead = function (...a) {
    if (forceOn) { scanCalls++; const r2 = origScan.apply(this, a); if (r2) scanHandled++; return r2; }
    return origScan.apply(this, a);
  };
  // 决策源压制:旗开时固定"朝门走"(still 走真实速度应用/碰撞/门逻辑流水线)
  P.wanderUpdate = function (world, game2, sitFlag) {
    if (forceOn) {
      const dxTile = Math.floor(this.cx / 16) - dX;
      if (!this.closeDoor) { this.facing = -1; return -1; }
      if (dxTile > -3) { this.facing = -1; return -1; }   // 已开门继续向内走越 ±2
      return 0;
    }
    return origWander.call(this, world, game2, sitFlag);
  };
  P.socialUpdate = function (...a) { return forceOn ? false : origSocial.apply(this, a); };
  P.attackUpdate = function (...a) { return forceOn ? false : origAttack.apply(this, a); };
  P.fixedUpdate = function (dt2, gm) {
    if (forceOn) { this.stuckT = 0; }
    return origFU.call(this, dt2, gm);
  };

  window.__doorTick = () => {
    const now = Math.round(performance.now() - t0);
    const at = st.type[st.idx(dX, dY0)];
    if (at === DOOR_O && openedAt < 0) { openedAt = now; phase = 'crossWait'; }
    if (openedAt >= 0 && at === DOOR_C && closedAgainAt < 0) closedAgainAt = now;
    if (phase === 'natural' && now > 30000) { phase = 'forced'; P.fixedUpdate.toString(); this.__forceArm?.(); }
    if (phase === 'crossWait') {
      const cxTile = Math.floor(n.cx / 16);
      if (cxTile > dX) { n.facing = -1; }        // 门外侧走向门
      else if (cxTile <= dX - 3) { /* 已越过,等 carry 关 */ }
    }
    if (now % 400 < 130 || (forceOn && now % 100 < 30)) {
      samples.push({ t: now, ph: phase, x: Math.round(n.x), y: Math.round(n.y),
        cxT: Math.floor(n.cx / 16), vx: +n.vx.toFixed(2), facing: n.facing,
        wm: n.walkMode, hg: !!n.onGround, hw: !!n.hitWall, carry: n.doorCarry === true });
    }
    return { phase, openedAt, closedAgainAt, done: openedAt >= 0 && closedAgainAt >= 0,
      anchorType: at, carry: n.doorCarry === true,
      dist: Math.abs(Math.floor(n.cx / 16) - dX),
      alive: !n.dead, scanCalls, scanHandled,
      samplesTail: samples.slice(-10) };
  };
  window.__setPhaseForced = () => { phase = 'forced'; forceOn = true; };
  window.__doorCleanup = () => { try { n.dead = true; P.fixedUpdate = origFU; } catch {} };
  return { ok: true, dX, dY0, DOOR_C, DOOR_O, template: tpl };
});
if (!setup.ok) { console.log(JSON.stringify(setup)); await b.close(); process.exit(1); }

let final = null; let forcedStart = null;
for (let k = 0; k < 450; k++) {
  final = await p.evaluate(() => window.__doorTick());
  const cur = await p.evaluate(() => window.__phaseLive ?? null).catch(() => null);
  if (!final.done && !forcedStart && final.phase === 'forced') { /* phase 已切 */ }
  if (final.done) break;
  await sleep(120);
}
// 30s 未自然开 → 切强制段再 20s
if (!final.done) {
  forcedStart = true;
  await p.evaluate(() => window.__setPhaseForced());
  for (let k = 0; k < 170; k++) {
    final = await p.evaluate(() => window.__doorTick());
    if (final.done) break;
    await sleep(120);
  }
}
await p.evaluate(() => window.__doorCleanup());
console.log(JSON.stringify({
  done: !!final.done, phase: final.phase,
  openedAtMs: final.openedAt, closedAgainAtMs: final.closedAgainAt,
  scanCalls: final.scanCalls, scanHandled: final.scanHandled,
  tail: final.samplesTail,
}));
fs.writeFileSync(join(HOME, '.claude/jobs/4a66e745/tmp/npc-door-live.json'), JSON.stringify(final));
await b.close();
