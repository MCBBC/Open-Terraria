// 定谳探针：多柱同活 FilterTower 串柱（星云 507 + 耀斑 517 双柱同活，
// 玩家在柱区边界上下飞时突闪洋红冲屏）。只读采样 + 截图证据，不改任何状态
// （除玩家位置/两塔 spawn 位——纯布局操作）。
// 采样面：r._lunarTowerFilterTarget 单产位 key / _towerFilterOpacity 斜坡 /
//         双塔距离序 / 塔天空 fade（per-family near 门）/ monoScan.activeMonolithType /
//         atmoValue / farDeferGate / cloudPath（协同问题：远景层共享门排查）。
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
const out = { errors: [], scenes: {} };

try {
  const { page, errors } = await boot(browser, 'monoxp');
  out.errors = errors.slice(0, 5);

  // ---- 布局：517 耀斑塔与 507 星云塔同 y 相距 6000px（两 4000px 圈交叠 2000px）----
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
    let tile410 = 0;
    for (let i = 0; i < st.type.length; i++) if (st.type[i] === 410 && st.flags[i]) tile410++;
    return { midPx, tyPx, s517, s507, tile410, worldW: st.w };
  });
  out.scenes.layout = placed;
  console.log('[layout]', JSON.stringify(placed));
  const L = { midPx: placed.midPx, tyPx: placed.tyPx };

  // ---- rAF 采样器 + 玩家沿两塔连线水平扫掠 + y 正弦上下振荡（模拟「上下飞穿越边界」）----
  await page.evaluate(({ midPx, tyPx }) => {
    const g = window.__swGame, r = g.renderer, p = g.player;
    window.__probe = { rec: [], flips: [], running: true, t0: performance.now() };
    const towers = () => [517, 507].map((id) => [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === id) ?? null);
    const yBase = tyPx;
    const sample = () => {
      if (!window.__probe.running) return;
      const [t517, t507] = towers();
      const tow = r._lunarTowerFilterTarget(r._frameEntities, p.cx, p.cy, g.world);
      const rec = window.__probe.rec;
      const prev = rec.length ? rec[rec.length - 1].key : null;
      const entry = {
        t: Math.round(performance.now() - window.__probe.t0),
        key: tow ? tow.key : null,
        op: +r._towerFilterOpacity.toFixed(3),
        d517: t517 ? Math.round(Math.hypot(t517.cx - p.cx, t517.cy - p.cy)) : null,
        d507: t507 ? Math.round(Math.hypot(t507.cx - p.cx, t507.cy - p.cy)) : null,
        px: Math.round(p.cx - midPx), py: Math.round(p.cy - yBase),
        fadeN: +r.sky.towerSky.nebula.fade.toFixed(3),
        fadeS: +r.sky.towerSky.solar.fade.toFixed(3),
        mono: r.monoScan ? r.monoScan.activeMonolithType : 'na',
        nearN: r.sky.towerSky.nebula.active, nearS: r.sky.towerSky.solar.active,
        atmo: +r.sky.atmoValue(p.cy).toFixed(3),
        farGate: !!r.sky.farDeferGate,
        cloudA: +(g.world.weather?.cloudAlpha ?? 0).toFixed(3),
      };
      rec.push(entry);
      if (rec.length > 20000) rec.shift();
      if (prev && prev !== entry.key) window.__probe.flips.push({ at: entry.t, from: prev, to: entry.key, op: entry.op, d517: entry.d517, d507: entry.d507, px: entry.px, py: entry.py });
      requestAnimationFrame(sample);
    };
    window.__probe.drive = () => {
      if (!window.__probe.running) return;
      const t = (performance.now() - window.__probe.t0) / 1000;
      const sweep = Math.sin(t * 0.35);             // ~18s 全周期往返
      const cx = midPx + sweep * 3600;              // ±3600px：完整穿越两圈与中点
      const cy = yBase - 500 - 400 * Math.sin(t * 1.7); // 上下振荡（飞行 100..900px 上空）
      p.vx = 0; p.vy = 0;
      p.hp = p.maxHp ?? p.hp;                       // 防柱怪打死干扰
      // ★Entity.cx/cy 是只读 getter（Entity.ts:79-80）——直写左上角 x/y
      p.x = cx - p.w / 2; p.y = cy - p.h / 2;
      if (window.__probe.rec.length % 60 === 0) {
        const tw = towers();
        window.__probe.towerPos = tw.map((e) => e ? Math.round(e.cx) : null);
      }
      setTimeout(window.__probe.drive, 16);
    };
    window.__probe.drive();
    sample();
  }, L);
  await new Promise((r) => setTimeout(r, 40000));   // ~2 个往返周期
  const rec = await page.evaluate(() => { window.__probe.running = false; return { n: window.__probe.rec.length, flips: window.__probe.flips }; });
  const samples = await page.evaluate(() => window.__probe.rec);
  out.scenes.cross = { flips: rec.flips, sampleCount: rec.n };
  console.log('[cross] flips:', JSON.stringify(rec.flips));
  writeFileSync(OUT + '/samples.json', JSON.stringify(samples.slice(0, 6000)));
  const windows = [];
  for (const f of rec.flips.slice(0, 6)) {
    const idx = samples.findIndex((s) => s.t >= f.at);
    if (idx >= 0) windows.push(samples.slice(Math.max(0, idx - 30), idx + 30));
  }
  writeFileSync(OUT + '/flip-windows.json', JSON.stringify(windows));

  // ---- 截图 A/B：三个稳定停留位 ----
  const park = async (dx, dy) => {
    await page.evaluate(({ midPx, tyPx, dx, dy }) => {
      const g = window.__swGame, p = g.player;
      p.vx = 0; p.vy = 0;
      p.hp = p.maxHp ?? p.hp;
      p.x = midPx + dx - p.w / 2; p.y = tyPx + dy - p.h / 2;
    }, { ...L, dx, dy });
    await new Promise((r) => setTimeout(r, 3500));
    return page.evaluate(() => {
      const g = window.__swGame, r = g.renderer, p = g.player;
      const tow = r._lunarTowerFilterTarget(r._frameEntities, p.cx, p.cy, g.world);
      return { key: tow?.key ?? null, op: +r._towerFilterOpacity.toFixed(3),
        fadeN: +r.sky.towerSky.nebula.fade.toFixed(3), fadeS: +r.sky.towerSky.solar.fade.toFixed(3),
        nearN: r.sky.towerSky.nebula.active, nearS: r.sky.towerSky.solar.active,
        atmo: +r.sky.atmoValue(p.cy).toFixed(3), farGate: !!r.sky.farDeferGate };
    });
  };
  out.scenes.atNebula = await park(2600, -400);
  await page.screenshot({ path: OUT + '/at-nebula-side.png' });
  console.log('[atNebula]', JSON.stringify(out.scenes.atNebula));
  out.scenes.atSolar = await park(-2600, -400);
  await page.screenshot({ path: OUT + '/at-solar-side.png' });
  console.log('[atSolar]', JSON.stringify(out.scenes.atSolar));
  out.scenes.atOverlap = await park(500, -400);
  await page.screenshot({ path: OUT + '/at-overlap.png' });
  console.log('[atOverlap]', JSON.stringify(out.scenes.atOverlap));

  // ---- 器件面阴性：玩家拉到两圈外（>4000px），无 tile 410 世界 → mono 恒 -1、miniTower 全关 ----
  out.scenes.outside = await park(0, -5600);
  const outsideDetail = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const fN = r.monoFilters.state('MonolithNebula');
    return { mono: r.monoScan.activeMonolithType, monNebActive: !!fN?.active, monNebOpacity: +(fN?.opacity ?? 0).toFixed(3) };
  });
  out.scenes.outsideDetail = outsideDetail;
  console.log('[outside]', JSON.stringify({ ...out.scenes.outside, ...outsideDetail }));
} finally {
  await browser.close();
}
console.log('DONE', JSON.stringify(out.scenes.cross?.flips?.length ?? 0));
