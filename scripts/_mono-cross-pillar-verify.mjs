// 修复验证探针：FilterTower per-type 四槽（SceneState.cs:108-111 对齐）。
// 断言：①交叠区双槽同显（双 opacity>0）②槽集合变化无「大小1→大小1 直接替换」
// （旧病灶=单产位换色不衰减）③移除槽 1/s 渐隐不截断 ④单塔区仅该槽。
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const OUT = '/tmp/mono-cross-pillar';
mkdirSync(OUT, { recursive: true });

async function boot(browser, tag) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ }
  });
  await page.goto(ORIGIN + '/?play=small&' + tag + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 1500));
  return { page, errors };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const out = { errors: [], checks: {} };

try {
  const { page, errors } = await boot(browser, 'monoxv');
  out.errors = errors.slice(0, 5);

  const placed = await page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    const midTx = Math.floor(st.w / 2);
    const midPx = midTx * 16;
    const findGround = (tx) => {
      tx = Math.max(4, Math.min(st.w - 5, tx));
      for (let y = 20; y < st.h - 20; y++) {
        if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) return y;
      }
      return Math.floor(g.world.groundLevel);
    };
    const ty = findGround(midTx);
    const tyPx = (ty - 6) * 16;
    const s517 = await window.__swFlow.spawnVanillaEnemy(517, midPx - 3000, tyPx);
    const s507 = await window.__swFlow.spawnVanillaEnemy(507, midPx + 3000, tyPx);
    return { midPx, tyPx, s517, s507 };
  });
  const L = { midPx: placed.midPx, tyPx: placed.tyPx };
  console.log('[layout]', JSON.stringify(placed));

  // ---- 扫掠采样：激活槽集合变化事件 + 每 30 帧快照 ----
  await page.evaluate(({ midPx, tyPx }) => {
    const g = window.__swGame, r = g.renderer, p = g.player;
    window.__probe = { rec: [], setFlips: [], running: true, t0: performance.now() };
    const KEYS = ['solar', 'vortex', 'nebula', 'stardust'];
    const towers = () => [517, 507].map((id) => [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === id) ?? null);
    const yBase = tyPx;
    const sample = () => {
      if (!window.__probe.running) return;
      const [t517, t507] = towers();
      const tows = r._lunarTowerFilterTargets(r._frameEntities, p.cx, p.cy, g.world);
      const ops = {}; for (const k of KEYS) ops[k] = +r._towerFilterOpacity[k].toFixed(3);
      const act = KEYS.filter((k) => tows[k] != null).sort().join('+') || '-';
      const rec = window.__probe.rec;
      const prev = rec.length ? rec[rec.length - 1].act : null;
      const entry = {
        t: Math.round(performance.now() - window.__probe.t0),
        act, ops,
        d517: t517 ? Math.round(Math.hypot(t517.cx - p.cx, t517.cy - p.cy)) : null,
        d507: t507 ? Math.round(Math.hypot(t507.cx - p.cx, t507.cy - p.cy)) : null,
        px: Math.round(p.cx - midPx), py: Math.round(p.cy - yBase),
        nearN: r.sky.towerSky.nebula.active, nearS: r.sky.towerSky.solar.active,
        atmo: +r.sky.atmoValue(p.cy).toFixed(3), farGate: !!r.sky.farDeferGate,
      };
      rec.push(entry);
      if (rec.length > 20000) rec.shift();
      if (prev && prev !== entry.act) window.__probe.setFlips.push({ at: entry.t, from: prev, to: entry.act, ops: entry.ops, d517: entry.d517, d507: entry.d507 });
      requestAnimationFrame(sample);
    };
    window.__probe.drive = () => {
      if (!window.__probe.running) return;
      const t = (performance.now() - window.__probe.t0) / 1000;
      const sweep = Math.sin(t * 0.35);
      const cx = midPx + sweep * 3600;
      const cy = yBase - 500 - 400 * Math.sin(t * 1.7);
      p.vx = 0; p.vy = 0;
      p.hp = p.maxHp ?? p.hp;
      p.x = cx - p.w / 2; p.y = cy - p.h / 2;
      setTimeout(window.__probe.drive, 16);
    };
    window.__probe.drive();
    sample();
  }, L);
  await new Promise((r) => setTimeout(r, 42000));
  const { setFlips, n } = await page.evaluate(() => { window.__probe.running = false; return { setFlips: window.__probe.setFlips, n: window.__probe.rec.length }; });
  const samples = await page.evaluate(() => window.__probe.rec);
  writeFileSync(OUT + '/verify-samples.json', JSON.stringify(samples));

  // ---- 断言 ②：无 1→1 直接替换（旧病灶签名：from 单槽 to 单槽 且成员不同）----
  const badReplacements = setFlips.filter((f) => f.from !== '-' && f.to !== '-' && !f.from.includes('+') && !f.to.includes('+'));
  out.checks.noSingleToSingleSwap = badReplacements.length === 0;
  console.log('[setFlips]', JSON.stringify(setFlips));
  console.log('[check② 无 1→1 跨族替换]', out.checks.noSingleToSingleSwap, badReplacements.length ? JSON.stringify(badReplacements) : '');

  // ---- 断言 ①：交叠区双槽同显（存在 act='nebula+solar' 的样本段）----
  const overlapFrames = samples.filter((s) => s.act === 'nebula+solar');
  out.checks.overlapDualActiveFrames = overlapFrames.length;
  const dualOpsOk = overlapFrames.length > 0 && overlapFrames.every((s) => s.ops.nebula > 0 && s.ops.solar > 0);
  out.checks.overlapDualOpacity = dualOpsOk;
  console.log('[check① 交叠区双槽同显] frames=', overlapFrames.length, ' dualOps=', dualOpsOk,
    overlapFrames.length ? JSON.stringify(overlapFrames[Math.floor(overlapFrames.length / 2)]) : '');

  // ---- 断言 ③：移除槽渐隐（任一 setFlip 移除槽后 1s 内 opacity 递减）----
  let fadeOutOk = true, fadeOutSeen = 0;
  for (const f of setFlips) {
    const removed = f.from.split('+').filter((k) => k !== '-' && !f.to.split('+').includes(k));
    for (const k of removed) {
      const at = samples.findIndex((s) => s.t >= f.at);
      if (at < 0 || at + 40 >= samples.length) continue;
      const op0 = samples[at].ops[k];
      const op1 = samples[Math.min(at + 40, samples.length - 1)].ops[k];
      if (op0 > 0.2) { fadeOutSeen++; if (op1 >= op0) fadeOutOk = false; }
    }
  }
  out.checks.fadeOutSeen = fadeOutSeen;
  out.checks.fadeOutDecreasing = fadeOutOk;
  console.log('[check③ 移除槽渐隐] seen=', fadeOutSeen, ' decreasing=', fadeOutOk);

  // ---- 停留点 A/B：单塔区仅该槽 + 交叠区截图（hp 持续保护）----
  const park = async (dx, dy, ms) => {
    await page.evaluate(({ midPx, tyPx, dx, dy, ms }) => {
      const g = window.__swGame, p = g.player;
      p.vx = 0; p.vy = 0;
      p.hp = p.maxHp ?? p.hp;
      p.x = midPx + dx - p.w / 2; p.y = tyPx + dy - p.h / 2;
      const iv = setInterval(() => { p.hp = p.maxHp ?? p.hp; }, 200);
      setTimeout(() => clearInterval(iv), ms + 500);
    }, { ...L, dx, dy, ms });
    await new Promise((r) => setTimeout(r, ms));
  };
  await park(2600, -300, 3000);
  out.checks.parkNebula = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, p = g.player;
    const tows = r._lunarTowerFilterTargets(r._frameEntities, p.cx, p.cy, g.world);
    return { act: Object.keys(tows), ops: { solar: +r._towerFilterOpacity.solar.toFixed(3), nebula: +r._towerFilterOpacity.nebula.toFixed(3) } };
  });
  await page.screenshot({ path: OUT + '/v2-at-nebula.png' });
  console.log('[parkNebula]', JSON.stringify(out.checks.parkNebula));
  await park(-2600, -300, 3000);
  out.checks.parkSolar = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, p = g.player;
    const tows = r._lunarTowerFilterTargets(r._frameEntities, p.cx, p.cy, g.world);
    return { act: Object.keys(tows), ops: { solar: +r._towerFilterOpacity.solar.toFixed(3), nebula: +r._towerFilterOpacity.nebula.toFixed(3) } };
  });
  await page.screenshot({ path: OUT + '/v2-at-solar.png' });
  console.log('[parkSolar]', JSON.stringify(out.checks.parkSolar));
  await park(500, -300, 3000);
  out.checks.parkOverlap = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, p = g.player;
    const tows = r._lunarTowerFilterTargets(r._frameEntities, p.cx, p.cy, g.world);
    return { act: Object.keys(tows), ops: { solar: +r._towerFilterOpacity.solar.toFixed(3), nebula: +r._towerFilterOpacity.nebula.toFixed(3) },
      nearN: r.sky.towerSky.nebula.active, nearS: r.sky.towerSky.solar.active };
  });
  await page.screenshot({ path: OUT + '/v2-at-overlap.png' });
  console.log('[parkOverlap]', JSON.stringify(out.checks.parkOverlap));
} finally {
  await browser.close();
}
console.log('VERIFY-DONE', JSON.stringify(out.checks));
