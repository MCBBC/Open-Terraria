// ★E51 x-ray0b:xray0 的修正版——boss 状态诊断+drawEmpress 计数+GLSpriteLayer
// 上传口真实字节分解+er: miss 辨析(packed churn vs 真重传)。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-xray0b.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51_FRAMES || 240);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51x0', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);

await page.evaluate(async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const texIdMod = await import('/src/render/texId.ts');
  const SH = await import('/src/render/glshim/GLShimExecutor.ts');
  const R = await import('/src/render/Renderer.ts');
  const C = globalThis.__e51 = {
    // TintAtlas 面
    allocs: 0, recycled: 0, recycledBytes: 0, bakeHit: 0, bakeMiss: 0, bakeMissBytes: 0,
    bakeMissKeys: new Map(),           // 键前缀 -> n(键漂移归因)
    // shim 面(resolveTex 支类)
    uploadsEr: 0, uploadsDyn: 0, uploadsPair: 0, uploadsPretex: 0,
    erMissPackedSample: new Map(),     // 'er:<texId>' -> packed 值样本(辨 churn)
    // 真实 GPU 上传口(GLSpriteLayer 各口字节)
    glFirstBuildBytes: 0, glFirstBuildN: 0,     // texFromImage 新建
    glRefreshBytes: 0, glRefreshN: 0,           // texRefresh 整幅刷新
    glRegionBytes: 0, glRegionN: 0,             // texRefreshRegion 子区刷新
    glSubBytes: 0, glSubN: 0,                   // texSubUpdate/Data
    glRegionFirstN: 0,                          // texFromRegion 首建(非命中)
    glRegionHitN: 0,                            // texFromRegion 同键命中(零上传)
    glDataBytes: 0, glDataN: 0,                 // texFromData 新建
    // 绘制面
    drawEmpressN: 0, tintedSpriteN: 0, tintedMissN: 0,
  };
  const taProto = TA.TintAtlas.prototype;
  const origAlloc = taProto.alloc;
  taProto.alloc = function (w, h) {
    const r = origAlloc.call(this, w, h);
    C.allocs++;
    if (r && r[3]) { C.recycled++; C.recycledBytes += w * h * 4; }
    return r;
  };
  const origBake = taProto.bake;
  taProto.bake = function (key, w, h, paint) {
    const had = this.entries.has(key);
    const r = origBake.call(this, key, w, h, paint);
    if (had) C.bakeHit++;
    else {
      C.bakeMiss++; C.bakeMissBytes += w * h * 4;
      const pref = String(key).split('|')[0].replace(/[0-9]+/g, '#');
      C.bakeMissKeys.set(pref, (C.bakeMissKeys.get(pref) ?? 0) + 1);
    }
    return r;
  };
  const shProto = SH.GLShimExecutor.prototype;
  const origResolve = shProto.resolveTex;
  shProto.resolveTex = function (glw, p) {
    const before = this.stats.uploads;
    const e = origResolve.call(this, glw, p);
    if (e && this.stats.uploads > before) {
      const kind = p.pair ? 'pair' : p.dynamic ? 'dyn' : p.preTex ? 'pretex' : 'er';
      if (kind === 'er') {
        C.uploadsEr++;
        const id = texIdMod.texId(p.img);
        const k = `er:${id}`;
        const packed = ((p.sx * 8192 + p.sy) * 4096 + p.sw) * 4096 + p.sh;
        const m = C.erMissPackedSample.get(k) ?? { n: 0, packedUniq: new Set(), intPacked: 0 };
        m.n++; m.packedUniq.add(packed);
        if (Number.isInteger(p.sx) && Number.isInteger(p.sy)) m.intPacked++;
        C.erMissPackedSample.set(k, m);
      } else if (kind === 'dyn') C.uploadsDyn++;
      else if (kind === 'pair') C.uploadsPair++; else C.uploadsPretex++;
    }
    return e;
  };
  const G = R.Renderer === undefined ? null : null;   // Renderer 由实例持有,drawEmpress 从实例 patch
  globalThis.__e51Inst = () => window.__swGame.renderer;
  const r0 = window.__swGame.renderer;
  const oEmp = r0.drawEmpress;
  r0.drawEmpress = function (e) { C.drawEmpressN++; return oEmp.call(this, e); };
  const oTint = r0.tintedSprite;
  r0.tintedSprite = function (key, frame, color) {
    C.tintedSpriteN++;
    const r = oTint.call(this, key, frame, color);
    if (!r) C.tintedMissN++;
    return r;
  };
  // GLSpriteLayer 各上传口字节(取 worldPipeLayer 与 cloud 等——直接 patch 原型,按实例 statName 过滤可后分组;这里全部累加)
  const GLS = (await import('/src/render/GLSpriteLayer.ts')).GLSpriteLayer;
  const glProto = GLS.prototype;
  const oTFI = glProto.texFromImage;
  glProto.texFromImage = function (key, img, a, b) {
    const before = this.texs ? this.texs.size : 0;
    const r = oTFI.call(this, key, img, a, b);
    if (r && this.texs && this.texs.size > before) { C.glFirstBuildN++; C.glFirstBuildBytes += r.bytes; }
    return r;
  };
  const oTFR = glProto.texFromRegion;
  glProto.texFromRegion = function (key, img, sx, sy, sw, sh) {
    const r = oTFR.call(this, key, img, sx, sy, sw, sh);
    if (r) {
      // 命中=返回既有 entry 且 stamp 更新但未建——以 texs 里键已存在近似:比较调用前后 size 不可靠(命中不变),改记 hit/first 无法直接……
      // 命中支返回 hit(旧 entry);首建支走 texFromImage(已在上计数)。此处只记调用数差分不可行——用 key 在 texs 的「调用前是否存在」判:
    }
    return r;
  };
  const oTR = glProto.texRefresh;
  glProto.texRefresh = function (key, img) {
    const r = oTR.call(this, key, img);
    if (r && !(r instanceof Promise)) { C.glRefreshN++; C.glRefreshBytes += r.w * r.h * 4; }
    return r;
  };
  const oTRR = glProto.texRefreshRegion;
  glProto.texRefreshRegion = function (key, img, sw, sh) {
    const r = oTRR.call(this, key, img, sw, sh);
    if (r) { C.glRegionN++; C.glRegionBytes += sw * sh * 4; }
    return r;
  };
  const oTSU = glProto.texSubUpdate;
  glProto.texSubUpdate = function (key, src, x, y, w, h) {
    const r = oTSU.call(this, key, src, x, y, w, h);
    C.glSubN++; C.glSubBytes += w * h * 4;
    return r;
  };
  globalThis.__e51Sample = async (framesWanted) => {
    const seen = new Map();
    for (let i = 0; i < framesWanted * 4 && seen.size < framesWanted; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      const s = window.__swGPULog.snapshot();
      const c = s.ctxs.swpipe;
      if (c) seen.set(s.frame, { u: c.frameUp, mb: c.frameUpMB, alloc: c.frameAllocMB, d: c.frameDraws });
    }
    const frames = [...seen.values()];
    const n = frames.length || 1;
    const agg = frames.reduce((a, f) => ({ u: a.u + f.u, mb: a.mb + f.mb, alloc: a.alloc + f.alloc, d: a.d + f.d }), { u: 0, mb: 0, alloc: 0, d: 0 });
    return {
      frames: frames.length,
      uploadsPerFrame: +(agg.u / n).toFixed(2),
      upMBPerFrame: +(agg.mb / n).toFixed(3),
      allocMBPerFrame: +(agg.alloc / n).toFixed(3),
      drawsPerFrame: +(agg.d / n).toFixed(1),
    };
  };
  globalThis.__e51Reset = () => {
    for (const k of ['allocs', 'recycled', 'recycledBytes', 'bakeHit', 'bakeMiss', 'bakeMissBytes', 'uploadsEr', 'uploadsDyn', 'uploadsPair', 'uploadsPretex', 'glFirstBuildN', 'glFirstBuildBytes', 'glRefreshN', 'glRefreshBytes', 'glRegionN', 'glRegionBytes', 'glSubN', 'glSubBytes', 'drawEmpressN', 'tintedSpriteN', 'tintedMissN']) C[k] = 0;
    C.bakeMissKeys = new Map(); C.erMissPackedSample = new Map();
  };
  globalThis.__e51Snapshot = () => ({
    ta: { allocs: C.allocs, recycled: C.recycled, recycledKB: +(C.recycledBytes / 1024).toFixed(1), bakeHit: C.bakeHit, bakeMiss: C.bakeMiss, bakeMissKB: +(C.bakeMissBytes / 1024).toFixed(1), missKeys: [...C.bakeMissKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) },
    shim: { er: C.uploadsEr, dyn: C.uploadsDyn, pair: C.uploadsPair, pretex: C.uploadsPretex, erMissPacked: [...C.erMissPackedSample.entries()].map(([k, m]) => ({ k, n: m.n, uniq: m.packedUniq.size, intPacked: m.intPacked })) },
    gl: { firstBuildMB: +(C.glFirstBuildBytes / 1048576).toFixed(2), firstBuildN: C.glFirstBuildN, refreshMB: +(C.glRefreshBytes / 1048576).toFixed(2), refreshN: C.glRefreshN, regionMB: +(C.glRegionBytes / 1048576).toFixed(2), regionN: C.glRegionN, subMB: +(C.glSubBytes / 1048576).toFixed(2), subN: C.glSubN },
    draw: { empress: C.drawEmpressN, tinted: C.tintedSpriteN, tintedMiss: C.tintedMissN },
  });
  globalThis.__e51Boss = () => {
    const g = window.__swGame;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    return e ? { alive: !e.dead, hp: e.hp, ai3: e.ai3, cx: Math.round(e.cx), cy: Math.round(e.cy), pcx: Math.round(g.player.cx), pcy: Math.round(g.player.cy), spawnAlpha: e.spawnAlpha, scale: e.vanillaScale } : { alive: false };
  };
});

await sleep(1500);
await page.evaluate(() => { globalThis.__e51Reset(); });
const s0 = await page.evaluate((n) => globalThis.__e51Sample(n), N);
const c0 = await page.evaluate(() => globalThis.__e51Snapshot());
console.log('== S0 基线 ==');
console.log('带宽:', JSON.stringify(s0));
console.log('分解:', JSON.stringify(c0, null, 1));

const sp = await spawnEnemy(page, 636, 0, 0, (e, g) => { e.cx = g.player.cx + 280; e.cy = g.player.cy - 120; e.ai3 = 1; });
console.log('spawn:', JSON.stringify(sp));
await page.evaluate(() => {
  globalThis.__e51Pin = setInterval(() => {
    const g = window.__swGame;
    for (const e of g.entities.enemies ?? []) if (e.vanillaId === 636 && !e.dead) e.ai3 = 1;
  }, 16);
});
await sleep(1500);
console.log('boss 状态(采样前):', JSON.stringify(await page.evaluate(() => globalThis.__e51Boss())));
await page.evaluate(() => { globalThis.__e51Reset(); });
const s1 = await page.evaluate((n) => globalThis.__e51Sample(n), N);
const c1 = await page.evaluate(() => globalThis.__e51Snapshot());
console.log('== S1 EoL ==');
console.log('带宽:', JSON.stringify(s1));
console.log('分解:', JSON.stringify(c1, null, 1));
console.log('boss 状态(采样后):', JSON.stringify(await page.evaluate(() => globalThis.__e51Boss())));

await page.evaluate(() => clearInterval(globalThis.__e51Pin));
process.exit(0);
