// ★悬停背景消失案复现探针 v2（2026-10-03）——先定谳再动刀:
//  用户实报「光标指向 NPC/旗帜时,背景所有远景全部消失」+收敛线索:三触发
//  (星璇塔高度/群系切换 1-2 帧/NPC·旗帜悬停)共通消失集合=远景层集合(云+山+森林 bg)。
//  v2:向导设 home(挂入驻旗帜)+双悬停目标(旗/NPC)+层集合分离指纹
//  (云带 16%/山带 40%/森林带 55% × sky2D/glCanvas 两面)+flag 时间线落盘。
//  运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=280000 scripts/_hover-bg-probe.mjs
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const OUT = 'shots/hoverbg/';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
console.log('browser up');
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

await bootstrap(page, ORIGIN + '/');
console.log('bootstrapped');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261003 });
console.log('createGame:', gen?.ok, gen?.why ?? '');
if (!gen?.ok) { await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// ---- 场景搭建:白天 + 向导钉位 + home(挂旗) ----
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TownNPC } = await import('/src/entities/TownNPC.ts').catch(() => import('/src/entities/TownNPC'));
  const { findBannerAnchorY } = await import('/src/world/Housing.ts').catch(() => import('/src/world/Housing'));
  const { TILE_DEFS } = await import('/src/data/tiles.ts').catch(() => import('/src/data/tiles'));
  if (!g.lighting.clock.isDay) g.lighting.clock.timeOfDay = 270;
  out.isDay = g.lighting.clock.isDay;
  let guide = (g.entities.npcs ?? []).find((n) => !n.dead && n.vanillaId === 22);
  if (!guide) {
    guide = new TownNPC('guide', g.player.cx + 140, g.player.cy - 40);
    g.entities.add(guide, 'npcs');
    out.spawned = true;
  }
  for (let i = 0; i < 30; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
  guide.x = g.player.cx + 140 - guide.w / 2; guide.y = g.player.cy - guide.h / 2 - 4;
  guide.vx = 0; guide.vy = 0; guide.stationary = true;
  // home = 脚底实心格上方(旗锚=上方第一实心「房界」)
  const st = g.world.store;
  const htx = Math.floor((guide.x + guide.w / 2) / 16);
  const feetTy = Math.floor((guide.y + guide.h - 1) / 16);
  let solidTy = null;
  for (let dy = 0; dy < 8; dy++) {
    const t = st.type[st.idx(htx, feetTy + dy)];
    if (TILE_DEFS[t]?.solid) { solidTy = { y: feetTy + dy, type: t }; break; }
  }
  if (!solidTy) { out.fail = 'no-solid-below'; return out; }
  const hty = solidTy.y - 1;
  guide.home = { x: htx, y: hty };
  // 搭 5 宽屋顶(hty-5 行,同型实心)——findBannerAnchorY 需要 home 上方第一实心房界
  for (let dx = -2; dx <= 2; dx++) st.setTileSilent(htx + dx, hty - 5, solidTy.type);
  for (let i = 0; i < 10; i++) {
    guide.x = g.player.cx + 140 - guide.w / 2; guide.y = g.player.cy - guide.h / 2 - 4;
    guide.vx = 0; guide.vy = 0; g.fixedUpdate(1 / 60); await sleep(0);
  }
  out.guideAlive = !guide.dead;
  out.home = guide.home;
  // 旗几何(渲染同源;TS private 运行时可调)
  const r = g.renderer;
  const geom = r.houseBannerGeom ? r.houseBannerGeom(guide, 0, g.world) : null;
  out.bannerGeom = geom ? { bx: geom.bx, by: geom.by, w: geom.w, h: geom.h } : null;
  if (geom) {
    const [sx, sy] = g.camera.worldToScreen(geom.bx, geom.by);
    out.bannerScreen = { sx: Math.round(sx), sy: Math.round(sy) };
  }
  const [sx2, sy2] = g.camera.worldToScreen(guide.x + guide.w / 2, guide.y + guide.h * 0.4);
  out.guideScreen = { sx: Math.round(sx2), sy: Math.round(sy2) };
  out.canvasRect = (() => { const rc = r.canvas.getBoundingClientRect(); return { l: rc.left, t: rc.top, w: rc.width, h: rc.height }; })();
  out.givenName = guide.givenName ?? '';
  return out;
});
console.log('setup:', JSON.stringify(setup));
if (!setup.bannerGeom) { console.log('NO BANNER — abort'); await browser.close(); process.exit(2); }
await new Promise((r) => setTimeout(r, 1200));

// ---- 旗时间线采样器(纯 JS 读,30Hz,中立) ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__tl = [];
  window.__tlOn = true;
  const tick = () => {
    if (!window.__tlOn) return;
    const sky = r.sky;
    let stack = '-';
    try { stack = (r.swPipe?.screenStackView ?? []).map((f) => f.name).join('|'); } catch { stack = 'ERR'; }
    let fl = 0;
    try { fl = Math.max(...r.biomeBg.bgFlash); } catch { fl = -1; }
    window.__tl.push({
      c10e: !!r._c10eFrame, inter: !!r._c10eWorldToHud, comp: !!r._c10eComposited,
      fp: r._c10eFilterPending === true, opSky: !!r._opresentSky, op: !!r.opresentUsed,
      sm: !!r.swPipe?.screenStackMode, stack,
      cp: r.cloudPathUsed, cm: r.cloudMergeUsed, compo: r.composePathUsed, sfx: r.sfxPathUsed,
      fdg: !!sky.farDeferGate, wxTint: sky.hasSkyWeatherTint(), flash: r.hasBgFlash(),
      fil: sky.farInterlayerActive(g.camera.y), wK: r._worldLowK,
      atmo: +sky.atmoValue(g.camera.y).toFixed(3), fl: +fl.toFixed(2),
      claim: g.player.cursorItemIconText || '',
      mx: g.input.mouseX | 0, my: g.input.mouseY | 0,
    });
    setTimeout(tick, 33);
  };
  tick();
});
const stopTl = () => page.evaluate(() => { window.__tlOn = false; });
const dumpTl = async (tag) => {
  const rows = await page.evaluate(() => { const a = window.__tl; window.__tl = []; return a; });
  const comp = [];
  for (const row of rows) {
    const prev = comp[comp.length - 1];
    if (prev && JSON.stringify(prev.row) === JSON.stringify(row)) { prev.n++; continue; }
    comp.push({ n: 1, row });
  }
  console.log(`---- timeline[${tag}] ${rows.length} samples ----`);
  for (const { n, row } of comp) {
    console.log(`x${String(n).padStart(3)} c10e:${row.c10e ? 1 : 0} int:${row.inter ? 1 : 0} cmp:${row.comp ? 1 : 0} fp:${row.fp ? 1 : 0} opSky:${row.opSky ? 1 : 0} op:${row.op ? 1 : 0} sm:${row.sm ? 1 : 0} stack:[${row.stack}] cp:${row.cp} cm:${row.cm} compo:${row.compo} sfx:${row.sfx} fdg:${row.fdg ? 1 : 0} tint:${row.wxTint ? 1 : 0} flash:${row.flash ? 1 : 0}(${row.fl}) fil:${row.fil ? 1 : 0} wK:${row.wK} atmo:${row.atmo} claim:${JSON.stringify(row.claim).slice(0, 34)} m:${row.mx},${row.my}`);
  }
};

// ---- 层集合分离指纹:云带/山带/森林带 × sky2D/glCanvas(全分辨率步进条带) ----
const spot = (tag) => page.evaluate((tag2) => {
  const g = window.__swGame;
  const r = g.renderer;
  const strip = (cv, yFrac, name) => {
    if (!cv || !cv.width) return `${name}:no-cv`;
    const y0 = Math.floor(cv.height * yFrac);
    const h = Math.max(2, Math.floor(cv.height * 0.03));
    const s = document.createElement('canvas');
    s.width = Math.floor(cv.width / 4); s.height = h;
    const c = s.getContext('2d', { willReadFrequently: true });
    c.drawImage(cv, 0, y0, cv.width, h, 0, 0, s.width, h);
    const d = c.getImageData(0, 0, s.width, h).data;
    let nz = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 8) nz++;
    const total = d.length / 16;
    return `${name}:nz=${((nz / total) * 100) | 0}%`;
  };
  return {
    tag: tag2,
    gl: [strip(r.glCanvasEl, 0.16, 'cloud'), strip(r.glCanvasEl, 0.40, 'mtn'), strip(r.glCanvasEl, 0.55, 'forest')].join(' '),
    sky: [strip(r.skyCanvas, 0.16, 'cloud'), strip(r.skyCanvas, 0.40, 'mtn'), strip(r.skyCanvas, 0.55, 'forest')].join(' '),
    flags: { c10e: r._c10eFrame, cp: r.cloudPathUsed, cm: r.cloudMergeUsed, fdg: r.sky.farDeferGate, op: r.opresentUsed },
  };
}, tag);

const cr = setup.canvasRect;
const bs = setup.bannerScreen;
const gs = setup.guideScreen;
const seq = async (label, x, y, shot) => {
  await page.mouse.move(cr.l + x, cr.t + y, { steps: 6 });
  // 悬停期间微抖保持 mousemove 流
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(cr.l + x + (i % 2 ? 2 : -2), cr.t + y + (i % 2 ? 1 : -1), { steps: 1 });
    await new Promise((r) => setTimeout(r, 260));
  }
  console.log(`=== ${label} ===`);
  console.log(JSON.stringify(await spot(label)));
  await page.screenshot({ path: `${OUT}${shot}` });
};

// 基线:鼠标移到左上角天空区(远离旗/NPC)
await seq('baseline-far', 60, 60, 'v2-1-baseline.png');
// 悬停旗帜中心
await seq('hover-banner', bs.sx, bs.sy, 'v2-2-banner.png');
// 悬停 NPC
await seq('hover-npc', gs.sx, gs.sy, 'v2-3-npc.png');
// 恢复
await seq('recovery-far', 60, 60, 'v2-4-recovery.png');

await dumpTl('whole-run');
await stopTl();
console.log('errs:', errs.slice(0, 8));
await browser.close();
process.exit(0);
