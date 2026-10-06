// ★E51 xray2:活体 EoL 渲染(boss 留在实体表,真实 shim 窗口内绘制)量化:
//  - pin 策略:hp=1(防白天满血 ai3+=2 离场)+ai3=1(phase2)+位置钉+despawnTimer 续命
//  - 切片接管率(markWorldDynamicScratch tint 支返回 true)=残影环是否走 uTint
//  - TintAtlas bake/recycled(=页纪元 bump 事件) 与 GL 层 er: 首建字节
//  - swpipe 带宽
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-xray2.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51_FRAMES || 300);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51x2', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);
await sleep(1200);

const pc = await page.evaluate(() => ({ x: window.__swGame.player.cx, y: window.__swGame.player.cy }));
const sp = await spawnEnemy(page, 636, pc.x + 260, pc.y - 140, null);   // 玩家旁 spawn(0,0=世界左上角→13 态离场判例)
console.log('spawn:', JSON.stringify(sp));

await page.evaluate(async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const texIdMod = await import('/src/render/texId.ts');
  const GLS = (await import('/src/render/GLSpriteLayer.ts')).GLSpriteLayer;
  const C = globalThis.__e51 = {
    empress: 0, tinted: 0,
    allocs: 0, recycled: 0, recycledKB: 0, bakeMiss: 0, bakeMissKB: 0, missKeys: new Map(),
    sliceOk: 0, sliceFail: 0,
    erFirstBytes: 0, erFirstN: 0, otherFirstBytes: 0, otherFirstN: 0,
    refreshN: 0, refreshBytes: 0,
    bossSeen: 0,
  };
  const g = window.__swGame;
  const ren = g.renderer;
  const oEmp = ren.drawEmpress;
  ren.drawEmpress = function (e) { C.empress++; return oEmp.call(this, e); };
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
  // pin:hp=1(断白天满血暴怒门)+ai3=1(phase2)+位置钉+despawn 续命
  globalThis.__e51Pin = setInterval(() => {
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e) return;
    C.bossSeen++;
    if (e.hp !== 1 && !e.dead) e.hp = 1;
    e.ai3 = 1;
    e.cx = g.player.cx + 260; e.cy = g.player.cy - 140;
    e.despawnTimer = 750;
  }, 8);
  globalThis.__e51Sample = async (framesWanted) => {
    const seen = new Map();
    for (let i = 0; i < framesWanted * 4 && seen.size < framesWanted; i++) {
      await new Promise((r) => requestAnimationFrame(r));
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
    for (const k of ['empress', 'tinted', 'allocs', 'recycled', 'bakeMiss', 'sliceOk', 'sliceFail', 'erFirstN', 'otherFirstN', 'refreshN']) C[k] = 0;
    C.recycledKB = 0; C.bakeMissKB = 0; C.erFirstBytes = 0; C.otherFirstBytes = 0; C.refreshBytes = 0;
    C.missKeys = new Map();
  };
  globalThis.__e51Snapshot = () => ({
    draw: { empress: C.empress, tinted: C.tinted, bossSeen: C.bossSeen },
    slice: { ok: C.sliceOk, fail: C.sliceFail },
    ta: { allocs: C.allocs, recycled: C.recycled, recycledKB: +C.recycledKB.toFixed(1), bakeMiss: C.bakeMiss, bakeMissKB: +C.bakeMissKB.toFixed(1), missKeys: [...C.missKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10), entries: g.renderer.tintAtlas.entries.size, pages: g.renderer.tintAtlas.pageCount },
    gl: { erFirstN: C.erFirstN, erFirstKB: +(C.erFirstBytes / 1024).toFixed(1), otherFirstN: C.otherFirstN, otherFirstMB: +(C.otherFirstBytes / 1048576).toFixed(2), refreshN: C.refreshN, refreshMB: +(C.refreshBytes / 1048576).toFixed(1) },
    boss: (() => { const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636); return e ? { alive: !e.dead, hp: e.hp, ai3: e.ai3, spawnAlpha: e.spawnAlpha } : { alive: false }; })(),
  });
});

await sleep(2500);   // 渐显窗+贴图就绪
await page.evaluate(() => { globalThis.__e51Reset(); });
const s = await page.evaluate((n) => globalThis.__e51Sample(n), N);
const c = await page.evaluate(() => globalThis.__e51Snapshot());
console.log('带宽:', JSON.stringify(s));
console.log(JSON.stringify(c, null, 1));
await page.evaluate(() => clearInterval(globalThis.__e51Pin));
process.exit(0);
