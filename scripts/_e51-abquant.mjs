// ★E51 同页切旗双窗量化:同场景同状态序列下,窗1=精确失效(新链)vs 窗2=页级
// bump(旧链,钩子 null 兜底档)——消除跑间方差(AI 招式态分布差)。
// 计数:TintAtlas allocs/recycled(=失效事件)/bakeMissKB、GL er: 首建笔数与字节、
// swpipe 带宽。判读:新链 recycled 事件=矩形级精确失效(合法);旧链=整页换代。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-abquant.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51_FRAMES || 500);

const browser = await launchBrowser({ headless: true });
const page = await openPage(browser, ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51abq', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);
await sleep(1000);

await page.evaluate(async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const GLS = (await import('/src/render/GLSpriteLayer.ts')).GLSpriteLayer;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const ren = g.renderer;
  const C = globalThis.__e51q = {
    allocs: 0, recycled: 0, recycledKB: 0, bakeMiss: 0, bakeMissKB: 0,
    erFirstN: 0, erFirstBytes: 0,
    empress: 0, sliceOk: 0, atkSeen: new Map(),
  };
  const oEmp = ren.drawEmpress;
  ren.drawEmpress = function (e) {
    C.empress++;
    C.atkSeen.set(`${e.ai0}`, (C.atkSeen.get(`${e.ai0}`) ?? 0) + 1);
    return oEmp.call(this, e);
  };
  const oMk = ren.markWorldDynamicScratch;
  ren.markWorldDynamicScratch = function (img, key, tint) {
    const r = oMk.call(this, img, key, tint);
    if (key && tint && r) C.sliceOk++;
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
    if (!had) { C.bakeMiss++; C.bakeMissKB += w * h * 4 / 1024; }
    return r;
  };
  const glProto = GLS.prototype;
  const oTFI = glProto.texFromImage;
  glProto.texFromImage = function (key, img, a, b) {
    const before = this.texs ? this.texs.size : -1;
    const r = oTFI.call(this, key, img, a, b);
    if (r && before >= 0 && this.texs.size > before && String(key).startsWith('er:')) {
      C.erFirstN++; C.erFirstBytes += (r.bytes ?? r.w * r.h * 4);
    }
    return r;
  };
  const ensureBoss = () => {
    let e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e || e.dead) {
      e = Enemy.fromVanilla(636, g.player.cx + 260, g.player.cy - 250);
      if (!e) return;
      g.entities.add(e, 'enemies');
    }
    e.dead = false; e.spawnAlpha = 0;
    if (e.hp > 1) e.hp = 1;
    e.ai3 = 1; e.ai2 = 2;
    e.cx = g.player.cx + 260; e.cy = g.player.cy - 250;
    e.despawnTimer = 750;
    const p2 = g.player;
    if (p2) { p2.hp = p2.maxHp; p2.dead = false; }
  };
  globalThis.__e51Ensure = ensureBoss;
  globalThis.__e51Sample = async (framesWanted) => {
    const seen = new Map();
    for (let i = 0; i < framesWanted * 4 && seen.size < framesWanted; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      ensureBoss();
      const s = window.__swGPULog.snapshot();
      const c = s.ctxs.swpipe;
      if (c) seen.set(s.frame, { u: c.frameUp, mb: c.frameUpMB });
    }
    const frames = [...seen.values()];
    const n = frames.length || 1;
    const agg = frames.reduce((a, f) => ({ u: a.u + f.u, mb: a.mb + f.mb }), { u: 0, mb: 0 });
    return { frames: frames.length, uploadsPerFrame: +(agg.u / n).toFixed(2), upMBPerFrame: +(agg.mb / n).toFixed(3) };
  };
  globalThis.__e51Reset = () => {
    for (const k of ['allocs', 'recycled', 'bakeMiss', 'erFirstN', 'empress', 'sliceOk']) C[k] = 0;
    C.recycledKB = 0; C.bakeMissKB = 0; C.erFirstBytes = 0;
    C.atkSeen = new Map();
  };
  globalThis.__e51Snap = () => ({
    allocs: C.allocs, recycled: C.recycled, recycledKB: +C.recycledKB.toFixed(1),
    bakeMiss: C.bakeMiss, bakeMissKB: +C.bakeMissKB.toFixed(1),
    erFirstN: C.erFirstN, erFirstKB: +(C.erFirstBytes / 1024).toFixed(1),
    empress: C.empress, sliceOk: C.sliceOk,
    atkSeen: [...C.atkSeen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  });
});

await page.evaluate(() => globalThis.__e51Ensure());
await sleep(2000);   // 预热(键集+渐显)
await page.evaluate(() => globalThis.__e51Reset());
const w1band = await page.evaluate((n) => globalThis.__e51Sample(n), N);
const w1 = await page.evaluate(() => globalThis.__e51Snap());
console.log('== 窗1:精确失效(新链)==');
console.log('band:', JSON.stringify(w1band));
console.log(JSON.stringify(w1));

// 切旧链(钩子 null=页级 bump 兜底),继续同场景
await page.evaluate(() => import('/src/render/TintAtlas.ts').then((m) => m.setTintAtlasInvalidateRect(null)));
await page.evaluate(() => globalThis.__e51Reset());
const w2band = await page.evaluate((n) => globalThis.__e51Sample(n), N);
const w2 = await page.evaluate(() => globalThis.__e51Snap());
console.log('== 窗2:页级 bump(旧链)==');
console.log('band:', JSON.stringify(w2band));
console.log(JSON.stringify(w2));

console.log('== 对比(同场景同状态序列)==');
const pct = (a, b) => (b ? +((a - b) / b * 100).toFixed(1) : 0);
console.log(`er: 重传字节: ${w1.erFirstKB}KB → ${w2.erFirstKB}KB(新链省 ${pct(w2.erFirstKB, w1.erFirstKB)}%)`);
console.log(`烘焙字节: ${w1.bakeMissKB}KB → ${w2.bakeMissKB}KB`);
console.log(`失效事件: ${w1.recycled}(矩形级精确) vs ${w2.recycled}(整页换代)`);
console.log(`swpipe 带宽: ${w1band.upMBPerFrame} → ${w2band.upMBPerFrame} MB/帧`);
process.exit(0);
