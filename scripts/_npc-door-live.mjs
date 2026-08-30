// 城镇 NPC 自主开门/过门关闭 实测探针(生产路径):
// 天空沙盒构造"地板+整扇关着的木门",生成向导 NPC 贴门行走,
// 断言时序:关(10) → 开(11)+doorCarry → 越门±2 → 关回(10)。
// 结构=页面内 window.__doorProbeTick 闭包,Node 侧 120ms 轮询(闭包函数不可跨 evaluate)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = process.env.VFP_MAP ?? '/Users/vinlic/Downloads/map-FTW_V2 (8).json';
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
  // ---- 模板门 ----
  let tpl = null;
  outer:
  for (let y = 40; y < st.h - 20 && !tpl; y++) {
    for (let x = 200; x < st.w - 200; x += 2) {
      if (!st.flags[st.idx(x, y)]) continue;
      if (st.type[st.idx(x, y)] === DOOR_C
        && st.type[st.idx(x, y + 1)] === DOOR_C
        && st.type[st.idx(x, y + 2)] === DOOR_C) { tpl = { x, y }; break outer; }
    }
  }
  if (!tpl) return { error: 'no-template-door' };
  // ---- 天空沙盒(玩家旁偏移保证 active) ----
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  const Sx = px + 14, Sy = Math.max(60, py - 26);
  for (let yy = Sy - 3; yy < Sy + 10; yy++) {
    for (let xx = Sx - 4; xx < Sx + 36; xx++) {
      const i = st.idx(xx, yy);
      st.flags[i] = 0; st.type[i] = 0; st.wire[i] = 0;
    }
  }
  const FLOOR = Sy + 7;
  for (let xx = Sx; xx < Sx + 32; xx++) {
    const i = st.idx(xx, FLOOR);
    st.type[i] = WOOD; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  const dX = Sx + 10, dY0 = FLOOR - 3;
  for (let dy = 0; dy < 3; dy++) {
    const i = st.idx(dX, dY0 + dy);
    st.type[i] = DOOR_C; st.flags[i] = 1;
    st.frameX[i] = st.frameX[st.idx(tpl.x, tpl.y)];
    st.frameY[i] = st.frameY[st.idx(tpl.x, tpl.y + dy)];
  }
  // ---- 向导生成(右侧,朝左走) ----
  const n = new TN.TownNPC('guide', (Sx + 22) * 16 + 8, 0);
  n.y = FLOOR * 16 - n.h;
  n.vx = 0; n.vy = 0;
  g.entities.add(n, 'npcs');
  n.setWalking?.(3600);
  n.facing = -1;
  // net 单人=null,此包装仅记录事件参数(若未来单机也走事件可断言)
  // walkMode 清零元凶追踪:实例属性改 getter/setter 捕获赋值栈
  {
    let wm = n.walkMode;
    g.__wmLog = [];
    const stk = () => { try { throw new Error('t'); } catch (e) { return String(e.stack).split('\n').filter(l => l.includes('TownNPC.ts')).slice(0, 2).join(' | '); } };
    Object.defineProperty(n, 'walkMode', { configurable: true,
      get: () => wm,
      set: (v) => { if (wm === 1 && v === 0) g.__wmLog.push({ at: Math.round(performance.now() - t0Init), stack: stk() }); wm = v; } });
    var t0Init = performance.now();
  }
  g.__doorEvents = [];
  const origNet = g.npcDoorNet?.bind(g);
  g.npcDoorNet = (...a) => { g.__doorEvents.push(a); if (origNet) origNet(...a); };

  // ---- 页面内观测闭包 ----
  const t0 = performance.now();
  let openedAt = -1, closedAgainAt = -1, nudges = 0;
  let lastNudgeAt = -1000, lastStage = 0, crossed = false;
  window.__doorProbeTick = () => {
    const now = Math.round(performance.now() - t0);
    const at = st.type[st.idx(dX, dY0)];
    if (at === DOOR_O && openedAt < 0) { openedAt = now; seqPush('OPEN'); }
    function seqPush(tag) { (g.__doorSeq ||= []).push({ tag, at: now }); }
    let nudged = false;
    if (openedAt >= 0 && at === DOOR_C && closedAgainAt < 0) { closedAgainAt = now; seqPush('CLOSED'); }
    const ntx = Math.floor(n.cx / 16);
    // 阶梯逼近+穿越(机构级验证):开门前每 1.2s 推近一站;开门(carry)后直接
    // 挪到门外侧越过 ±2 触发回关;均重置锚点防离家回归/避坠停走干扰
    if (now - lastNudgeAt > 1200 && now > 1500) {
      const LADDER = [6, 4.5, 3.2, 2.4];
      if (!crossed && !(g.__doorEvents || []).length) {
        const stage = Math.min(LADDER.length - 1, lastStage);
        lastStage = Math.min(LADDER.length - 1, stage + 1);
        n.x = (dX + LADDER[stage]) * 16 - 8;
      } else if (!crossed && (g.__doorEvents || []).length) {
        crossed = true;   // 已开门:瞬移到门外侧(门左 −3 格),由 carry 关闭逻辑接管
        n.x = (dX - 3) * 16;
      }
      n.y = FLOOR * 16 - n.h; n.vx = 0; n.vy = 0;
      n.anchorTile = { x: Math.floor(n.x / 16), y: FLOOR };
      n.facing = -1; n.setWalking?.(3600); nudges++; nudged = true;
      lastNudgeAt = now;
    }
    const sample = { t: now, dist: Math.abs(ntx - dX), vx: +n.vx.toFixed(2), vy: +n.vy.toFixed(2),
      onGround: !!n.onGround, hitWall: !!n.hitWall, walkMode: n.walkMode, walkT: n.walkT,
      x: Math.round(n.x), y: Math.round(n.y), dead: !!n.dead };
    (g.__doorSamples ||= []).push(sample);
    return { openedAt, closedAgainAt, done: closedAgainAt >= 0,
      anchorType: at, carry: n.doorCarry === true,
      npcDistDoor: Math.abs(ntx - dX), nudges,
      samples: (g.__doorSamples || []).filter((_, i2) => i2 % 4 === 0).slice(-20),
      events: g.__doorEvents.map((e) => ({ kind: e[0], x: e[1], y: e[2], closing: e[3], dir: e[4] })),
      seq: g.__doorSeq ?? [], now, npcAlive: !n.dead, wmLog: (g.__wmLog || []).slice(-6) };
  };
  return { ok: true, dX, dY0, DOOR_C, DOOR_O, tpl: tpl, spawned: true };
});
if (!setup.ok) { console.log(JSON.stringify(setup)); await b.close(); process.exit(1); }
// ---- Node 轮询 25s ----
let final = null;
for (let k = 0; k < 100; k++) {
  await sleep(120);
  final = await p.evaluate(() => window.__doorProbeTick());
  if (final.done) break;
}
await p.evaluate(() => { try { window.__doorProbeCleanup?.(); } catch {} });
console.log(JSON.stringify({
  openedAtMs: final.openedAt, closedAgainAtMs: final.closedAgainAt,
  done: !!final.done, seq: final.seq, netEvents: final.events,
  npcDistDoorEnd: final.npcDistDoor, nudges: final.nudges,
  samples: (final.samples||[]).slice(-8), wmLog: (final.wmLog||[]).slice(-6),
}));
fs.writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/npc-door-live.json', JSON.stringify(final));
await b.close();
