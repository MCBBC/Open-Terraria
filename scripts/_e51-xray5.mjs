// ★E51 xray3:活体 EoL 长窗(600 帧)——AI 自由选招(atk8/9/10 环自然出现),
// pin 最小面:位置+despawnTimer+hp=1(断白天满血暴怒离场门)+spawnAlpha=0(免渐显),
// 死了即 respawn。量化:TintAtlas churn / 切片接管率 / GL er: 首建 / swpipe 带宽。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-xray3.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51_FRAMES || 1200);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51x3', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);
await sleep(1200);

await page.evaluate(async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const GLS = (await import('/src/render/GLSpriteLayer.ts')).GLSpriteLayer;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const ren = g.renderer;
  const C = globalThis.__e51 = {
    empress: 0, tinted: 0, respawns: 0,
    allocs: 0, recycled: 0, recycledKB: 0, bakeMiss: 0, bakeMissKB: 0, missKeys: new Map(),
    sliceOk: 0, sliceFail: 0, cutNull: 0, ghostAddN: 0, whiteN: 0,
    erFirstBytes: 0, erFirstN: 0, otherFirstBytes: 0, otherFirstN: 0,
    refreshN: 0, refreshBytes: 0, atkSeen: new Map(),
  };
  const oEmp = ren.drawEmpress;
  ren.drawEmpress = function (e) {
    C.empress++;
    C.atkSeen.set(`${e.ai0}`, (C.atkSeen.get(`${e.ai0}`) ?? 0) + 1);
    return oEmp.call(this, e);
  };
  const oTint = ren.tintedSprite;
  ren.tintedSprite = function (k, f, c) { C.tinted++; return oTint.call(this, k, f, c); };
  const oMk = ren.markWorldDynamicScratch;
  ren.markWorldDynamicScratch = function (img, key, tint) {
    const r = oMk.call(this, img, key, tint);
    if (key && tint) { if (r) C.sliceOk++; else C.sliceFail++; }
    return r;
  };
  const taProto = TA.TintAtlas.prototype;
  const oAlloc = taProto.alloc;
  taProto.alloc = function (w, h) {
    const r = oAlloc.call(this, w, h);
    C.allocs++;
    if (r && r[3]) { C.recycled++; C.recycledKB += w * h * 4 / 1024; }
    return r;
  };
  const oBake = taProto.bake;
  taProto.bake = function (key, w, h, paint) {
    const had = this.entries.has(key);
    const r = oBake.call(this, key, w, h, paint);
    if (!had) {
      C.bakeMiss++; C.bakeMissKB += w * h * 4 / 1024;
      const pref = String(key).split('|').slice(0, 2).join('|').replace(/\d+/g, '#');
      C.missKeys.set(pref, (C.missKeys.get(pref) ?? 0) + 1);
    }
    return r;
  };
  const glProto = GLS.prototype;
  const oTFI = glProto.texFromImage;
  glProto.texFromImage = function (key, img, a, b) {
    const before = this.texs ? this.texs.size : -1;
    const r = oTFI.call(this, key, img, a, b);
    if (r && before >= 0 && this.texs.size > before) {
      if (String(key).startsWith('er:')) { C.erFirstN++; C.erFirstBytes += (r.bytes ?? r.w * r.h * 4); }
      else { C.otherFirstN++; C.otherFirstBytes += (r.bytes ?? r.w * r.h * 4); }
    }
    return r;
  };
  const oTR = glProto.texRefresh;
  glProto.texRefresh = function (key, img) {
    const r = oTR.call(this, key, img);
    if (r) { C.refreshN++; C.refreshBytes += r.w * r.h * 4; }
    return r;
  };
  // respawn+最小 pin
  const ensureBoss = () => {
    let e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e || e.dead) {
      e = Enemy.fromVanilla(636, g.player.cx + 260, g.player.cy - 140);
      if (!e) return null;
      g.entities.add(e, 'enemies');
      C.respawns++;
    }
    e.dead = false;
    e.spawnAlpha = 0;
    if (e.hp > 1) e.hp = 1;   // 断「满血+白天→ai3+=2」暴怒离场门
    e.ai3 = 1;                 // phase2 判定(ai3∈{1,3});狂暴档 0
    e.ai2 = 2;                 // 拍号钉 2 → EMPRESS_CYCLE_P2[2]=8 → 悬浮结束恒选 atk8
    e.cx = g.player.cx + 260; e.cy = g.player.cy - 140;
    e.despawnTimer = 750;
    // 玩家保活:EoL 白天 damage=9999,玩家死→boss 13 态离场循环(探针伪影)
    const p2 = g.player;
    if (p2) { p2.hp = p2.maxHp; p2.dead = false; }
    return e;
  };
  globalThis.__e51Ensure = ensureBoss;
  globalThis.__e51Sample = async (framesWanted) => {
    const seen = new Map();
    for (let i = 0; i < framesWanted * 4 && seen.size < framesWanted; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      ensureBoss();
      const s = window.__swGPULog.snapshot();
      const c = s.ctxs.swpipe;
      if (c) seen.set(s.frame, { u: c.frameUp, mb: c.frameUpMB, d: c.frameDraws });
    }
    const frames = [...seen.values()];
    const n = frames.length || 1;
    const agg = frames.reduce((a, f) => ({ u: a.u + f.u, mb: a.mb + f.mb, d: a.d + f.d }), { u: 0, mb: 0, d: 0 });
    return { frames: frames.length, uploadsPerFrame: +(agg.u / n).toFixed(2), upMBPerFrame: +(agg.mb / n).toFixed(3), drawsPerFrame: +(agg.d / n).toFixed(1) };
  };
  globalThis.__e51Reset = () => {
    for (const k of ['empress', 'tinted', 'allocs', 'recycled', 'bakeMiss', 'sliceOk', 'sliceFail', 'cutNull', 'ghostAddN', 'whiteN', 'erFirstN', 'otherFirstN', 'refreshN', 'respawns']) C[k] = 0;
    C.recycledKB = 0; C.bakeMissKB = 0; C.erFirstBytes = 0; C.otherFirstBytes = 0; C.refreshBytes = 0;
    C.missKeys = new Map(); C.atkSeen = new Map();
  };
  globalThis.__e51Snapshot = () => ({
    draw: { empress: C.empress, tinted: C.tinted, respawns: C.respawns, atkSeen: [...C.atkSeen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) },
    slice: { ok: C.sliceOk, fail: C.sliceFail },
    ta: { allocs: C.allocs, recycled: C.recycled, recycledKB: +C.recycledKB.toFixed(1), bakeMiss: C.bakeMiss, bakeMissKB: +C.bakeMissKB.toFixed(1), missKeys: [...C.missKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12), entries: g.renderer.tintAtlas.entries.size, pages: g.renderer.tintAtlas.pageCount },
    gl: { erFirstN: C.erFirstN, erFirstKB: +(C.erFirstBytes / 1024).toFixed(1), otherFirstN: C.otherFirstN, otherFirstMB: +(C.otherFirstBytes / 1048576).toFixed(2), refreshN: C.refreshN, refreshMB: +(C.refreshBytes / 1048576).toFixed(1) },
  });
});

await page.evaluate(() => globalThis.__e51Ensure());
await sleep(1500);
await page.evaluate(() => { globalThis.__e51Reset(); });
const s = await page.evaluate((n) => globalThis.__e51Sample(n), N);
const c = await page.evaluate(() => globalThis.__e51Snapshot());
console.log('带宽:', JSON.stringify(s));
console.log(JSON.stringify(c, null, 1));
process.exit(0);
