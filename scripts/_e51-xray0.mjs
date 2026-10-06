// ★E51 x-ray0:512² epoch 追新风暴量化+归因（先定谳后动刀物证面）。
// 假说链:TintAtlas 页矩形回收 bump 整页纪元(texId.ts/TintAtlas.ts:68)→ shim er: 键
// 全页 miss(GLShimExecutor.ts:2107 ep 命中判定)→ 该页全部矩形逐个重传(GLSpriteLayer
// texFromRegion)——若 EoL 战斗有持续新键 churn(相位环 tintedSprite 键漂移),页满
// evictCold→回收→bump 每帧发生=全页重传风暴。
// 量化:GLStats swpipe 账页上传带宽/笔数、TintAtlas alloc recycled(=bump 次数)、
// resolveTex 上传按 (img texId, 支类) 归因对照 TintAtlas 页画布 id。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-xray0.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51_FRAMES || 300);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51x0', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);

await page.evaluate(async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const texIdMod = await import('/src/render/texId.ts');
  const SH = await import('/src/render/glshim/GLShimExecutor.ts');
  const C = globalThis.__e51 = {
    allocs: 0, recycled: 0, recycledBytes: 0,
    bakeHit: 0, bakeMiss: 0, bakeMissBytes: 0,
    uploadsEr: 0, uploadsDyn: 0, uploadsPair: 0, uploadsPretex: 0,
    upByImg: new Map(),   // 'er:<texId>' -> {n,w,h,eps}
    pages: [],
  };
  const taProto = TA.TintAtlas.prototype;
  const origAlloc = taProto.alloc;
  taProto.alloc = function (w, h) {
    const r = origAlloc.call(this, w, h);
    C.allocs++;
    if (r && r[3]) { C.recycled++; C.recycledBytes += w * h * 4; }   // recycled=true ⇒ bake 将 bump 页纪元
    return r;
  };
  const origBake = taProto.bake;
  taProto.bake = function (key, w, h, paint) {
    const had = this.entries.has(key);
    const r = origBake.call(this, key, w, h, paint);
    if (had) C.bakeHit++; else { C.bakeMiss++; C.bakeMissBytes += w * h * 4; }
    return r;
  };
  const shProto = SH.GLShimExecutor.prototype;
  const origResolve = shProto.resolveTex;
  shProto.resolveTex = function (glw, p) {
    const before = this.stats.uploads;
    const e = origResolve.call(this, glw, p);
    if (e && this.stats.uploads > before) {
      const kind = p.pair ? 'pair' : p.dynamic ? 'dyn' : p.preTex ? 'pretex' : 'er';
      if (kind === 'er') C.uploadsEr++; else if (kind === 'dyn') C.uploadsDyn++;
      else if (kind === 'pair') C.uploadsPair++; else C.uploadsPretex++;
      const id = texIdMod.texId(p.img);
      const k = `${kind}:${id}`;
      const rec = C.upByImg.get(k) ?? { n: 0, w: e.w, h: e.h, eps: new Set() };
      rec.n++; rec.w = e.w; rec.h = e.h; rec.eps.add(texIdMod.texEpoch(p.img));
      C.upByImg.set(k, rec);
    }
    return e;
  };
  globalThis.__e51DumpPages = () => {
    const ta = window.__swGame.renderer.tintAtlas;
    const perPage = new Map();
    for (const [, ent] of ta.entries) {
      const id = texIdMod.texId(ent.page.cv);
      const rec = perPage.get(id) ?? { texId: id, rects: 0, bytes: 0 };
      rec.rects++; rec.bytes += ent.rect.w * ent.rect.h * 4;
      perPage.set(id, rec);
    }
    C.pages = [...perPage.values()];
    return C.pages;
  };
  globalThis.__e51Sample = async (framesWanted) => {
    const seen = new Map();
    for (let i = 0; i < framesWanted * 4 && seen.size < framesWanted; i++) {
      await new Promise((r) => requestAnimationFrame(r));
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
    C.allocs = 0; C.recycled = 0; C.recycledBytes = 0;
    C.bakeHit = 0; C.bakeMiss = 0; C.bakeMissBytes = 0;
    C.uploadsEr = 0; C.uploadsDyn = 0; C.uploadsPair = 0; C.uploadsPretex = 0;
    C.upByImg = new Map();
  };
  globalThis.__e51Snapshot = () => ({
    allocs: C.allocs, recycled: C.recycled, recycledBytes: C.recycledBytes,
    bakeHit: C.bakeHit, bakeMiss: C.bakeMiss, bakeMissKB: +(C.bakeMissBytes / 1024).toFixed(1),
    uploadsEr: C.uploadsEr, uploadsDyn: C.uploadsDyn, uploadsPair: C.uploadsPair, uploadsPretex: C.uploadsPretex,
    upByImg: [...C.upByImg.entries()]
      .map(([k, r]) => ({ k, n: r.n, w: r.w, h: r.h, eps: [...r.eps].length }))
      .sort((a, b) => b.n - a.n).slice(0, 14),
  });
});

const settle = async (ms) => { await sleep(ms); };

// ---- S0 基线:无 boss 空场景 ----
await settle(1200);
await page.evaluate(() => { globalThis.__e51Reset(); });
const s0 = await page.evaluate((N) => globalThis.__e51Sample(N), N);
const c0 = await page.evaluate(() => ({ snap: globalThis.__e51Snapshot(), pages: globalThis.__e51DumpPages() }));
console.log('== S0 基线(无 boss)==');
console.log('带宽:', JSON.stringify(s0));
console.log('计数:', JSON.stringify(c0.snap));
console.log('TintAtlas 页:', JSON.stringify(c0.pages));

// ---- S1 EoL phase2:spawn 636 + 每帧钉 ai3=1 ----
const sp = await spawnEnemy(page, 636, 0, 0, (e, g) => {
  e.cx = g.player.cx + 280; e.cy = g.player.cy - 120;
  e.ai3 = 1;   // phase2(二阶段相位环 empG/wing2 面)
});
console.log('spawn EoL:', JSON.stringify(sp));
await page.evaluate(() => {
  globalThis.__e51Pin = setInterval(() => {
    const g = window.__swGame;
    for (const e of g.entities.enemies ?? []) if (e.vanillaId === 636 && !e.dead) e.ai3 = 1;
  }, 16);
});
await settle(1500);
await page.evaluate(() => {
  globalThis.__e51Reset();
  const g = window.__swGame;
  const e636 = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636 && !en.dead);
  return { alive: !!e636, hp: e636?.hp, cx: Math.round(e636?.cx ?? -1), cy: Math.round(e636?.cy ?? -1), ai3: e636?.ai3, onScreenApprox: !!e636 };
});
const s1 = await page.evaluate((N) => globalThis.__e51Sample(N), N);
const c1 = await page.evaluate(() => ({ snap: globalThis.__e51Snapshot(), pages: globalThis.__e51DumpPages() }));
console.log('== S1 EoL phase2 ==');
console.log('带宽:', JSON.stringify(s1));
console.log('计数:', JSON.stringify(c1.snap));
console.log('TintAtlas 页:', JSON.stringify(c1.pages));

await page.evaluate(() => { clearInterval(globalThis.__e51Pin); });
await page.browser?.close?.().catch?.(() => {});
process.exit(0);
