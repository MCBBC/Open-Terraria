// ★BJ647 真机复现：导入用户 .wld，夜晚逐拍采样巫医/海盗全状态，抓瞬移时刻断环。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏(小世界底座没起来)', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// ---- 导入用户 .wld 进世界 ----
const buf = readFileSync(WLD);
const b64 = buf.toString('base64');
console.log('wld bytes:', buf.length);
const imported = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  try {
    await window.__swFlow.importWld(u8);
    return { ok: true };
  } catch (e) { return { ok: false, err: String(e) }; }
}, b64);
console.log('importWld:', JSON.stringify(imported));
if (!imported.ok) { console.error('导入失败', errors.slice(0, 5)); process.exit(1); }
// 等世界就绪
for (let i = 0; i < 120; i++) {
  const ready = await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g && g.world && g.world.store && g.world.store.type && g.world.store.type.length > 1000000);
  }).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 3000));

// ---- 定位与快照 ----
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const npcs = g.entities.npcs.filter((n) => !n.dead).map((n) => ({
    key: n.npcKey, id: n.vanillaId, cx: Math.round(n.cx), cy: Math.round(n.cy),
    home: n.home ? { ...n.home } : null,
  }));
  const wd = npcs.find((n) => n.key === 'witch_doctor');
  const pi = npcs.find((n) => n.key === 'pirate');
  const report = { npcs, clock: { isDay: g.world.clock.isDay, timeOfDay: g.world.clock.timeOfDay } };
  // 椅格带全扫（巫医/海盗 home 附近 ±10 列）：tile 15/79/497 + 帧值
  const chairs = [];
  if (wd?.home) {
    for (let x = wd.home.x - 10; x <= wd.home.x + 10; x++) {
      for (let y = wd.home.y - 4; y <= wd.home.y + 4; y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        const t = st.type[i];
        if (t === 15 || t === 79 || t === 497) chairs.push({ x, y, t, fx: st.frameX[i], fy: st.frameY[i] });
      }
    }
  }
  report.chairsNearWitchDoctor = chairs;
  // 玩家传送到家附近观察位（站在地面上）
  if (wd?.home) {
    g.player.x = (wd.home.x + 2) * 16;
    g.player.y = (wd.home.y - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
  }
  return report;
});
console.log('setup:', JSON.stringify(setup));

// ---- 逐拍采样（每 6 tick ≈ 100ms 现实墙钟不可靠，改用 tick 钩子：轮询 game.tickCount）----
// 采样器：在页面里装 interval 30ms 轮询 tickCount，变了才记——tick 固定 60/s。
await page.evaluate(() => {
  const g = window.__swGame;
  window.__bj647 = [];
  window.__bj647Stop = false;
  const rec = window.__bj647;
  let lastTick = -1;
  const keys = ['witch_doctor', 'pirate'];
  window.__bj647Timer = setInterval(() => {
    if (window.__bj647Stop) return;
    if (g.tickCount === lastTick) return;
    lastTick = g.tickCount;
    for (const k of keys) {
      const n = g.entities.npcs.find((x) => x.npcKey === k && !x.dead);
      if (!n) { rec.push({ t: g.tickCount, k, missing: true }); continue; }
      rec.push({
        t: g.tickCount, k,
        x: +n.cx.toFixed(2), y: +n.cy.toFixed(2), vx: +n.vx.toFixed(3), vy: +n.vy.toFixed(3),
        dir: n.facing, wm: n.walkMode, wT: n.walkT, tl: n.turnLock,
        sit: n.sitting ? 1 : 0, sitT: n.sitTimer, kick: n.sitKickLock,
        atk: n.atkState, corn: n.corneredT, danger: n.dangerNear ? 1 : 0, threat: n.threatRaw ? 1 : 0,
        talk: n.talking ? 1 : 0, soc: n.social ? n.social.kind : 0,
        home: n.home ? `${n.home.x},${n.home.y}` : null,
        rest: (n.restSpot) ? `${n.restSpot.x},${n.restSpot.y}` : null,
        tpH: n.teleportedHome ? 1 : 0, g: n.onGround ? 1 : 0,
        flee: n.fleeing ? 1 : 0,
      });
    }
    if (rec.length > 60000) rec.splice(0, 20000);
  }, 4);
});
console.log('sampling... 45s');
// 每 5s 清敌+回血（防夜晚围殴打断观察）
for (let s = 0; s < 9; s++) {
  await new Promise((r) => setTimeout(r, 5000));
  await page.evaluate(() => {
    const g = window.__swGame;
    for (const e of g.entities.enemies) e.dead = true;
    g.player.hp = g.player.hpMax ?? 500;
  }).catch(() => {});
}
await page.evaluate(() => { window.__bj647Stop = true; clearInterval(window.__bj647Timer); });
const rec = await page.evaluate(() => window.__bj647);
console.log('samples:', rec.length);
// ---- 离线分析：找瞬移拍（x 跳变）并打印前后窗口 ----
const byKey = { witch_doctor: [], pirate: [] };
for (const r of rec) if (byKey[r.k]) byKey[r.k].push(r);
for (const [k, ser] of Object.entries(byKey)) {
  console.log(`==== ${k} (${ser.length} samples) ====`);
  // 位置基线 = 众数左端（重置点）
  let jumps = [];
  for (let i = 1; i < ser.length; i++) {
    const dx = ser[i].x - ser[i - 1].x;
    if (Math.abs(dx) > 6) jumps.push({ i, t0: ser[i - 1].t, t1: ser[i].t, x0: ser[i - 1].x, x1: ser[i].x, dx });
  }
  console.log('jumps>6px:', JSON.stringify(jumps.slice(0, 20)));
  // 打印首个瞬移前后 40 拍（含 2 个跳）完整状态
  if (jumps.length) {
    const j = jumps[0];
    const lo = Math.max(0, j.i - 30), hi = Math.min(ser.length, j.i + 60);
    for (let i = lo; i < hi; i++) {
      const s = ser[i];
      console.log(`t=${s.t} x=${s.x} vx=${s.vx} dir=${s.dir} wm=${s.wm} wT=${s.wT} tl=${s.tl} sit=${s.sit} sitT=${s.sitT} kick=${s.kick} atk=${s.atk} corn=${s.corn} dgr=${s.danger} thr=${s.threat} talk=${s.talk} soc=${s.soc} rest=${s.rest} tpH=${s.tpH} g=${s.g} flee=${s.flee}`);
    }
  }
  // 统计 sit 态时长分布
  let sitRuns = [];
  let run = 0;
  for (const s of ser) { if (s.sit) run++; else { if (run) sitRuns.push(run); run = 0; } }
  if (run) sitRuns.push(run);
  console.log('sit-run lengths (tick):', JSON.stringify(sitRuns.slice(0, 30)));
}
console.log('pageerrors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
