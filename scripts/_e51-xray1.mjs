// ★E51 xray1:手动 drawEmpress 驱动(判例 _empress-trail 模式:实体出列,每帧手调
// 绘制)复现 atk8 残影环(ai1 扫频)+phase2 相位环,全插桩量化:
//  - TintAtlas bakeMiss 键前缀分布 / alloc recycled(=bump 页纪元事件)
//  - GLSpriteLayer.texFromImage 真实首建字节(er: 键部分=TintAtlas 页重传带宽)
//  - swpipe 账页带宽/帧
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-xray1.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51_FRAMES || 240);

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51x1', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);
await sleep(1200);

const out = await page.evaluate(async (framesWanted) => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const TA = await import('/src/render/TintAtlas.ts');
  const texIdMod = await import('/src/render/texId.ts');
  const GLS = (await import('/src/render/GLSpriteLayer.ts')).GLSpriteLayer;

  const C = globalThis.__e51 = {
    empress: 0, tinted: 0, tintedMiss: 0,
    allocs: 0, recycled: 0, recycledKB: 0,
    bakeMiss: 0, bakeMissKB: 0, missKeys: new Map(),
    erFirstBytes: 0, erFirstN: 0,      // er: 键真实首建(texFromImage)
    otherFirstBytes: 0, otherFirstN: 0,
    refreshBytes: 0, refreshN: 0,
    erCalls: 0, erHitCalls: 0,          // texFromRegion 调用面:er: 键命中/总数
    frames: [],
  };

  // ---- TintAtlas 插桩 ----
  const ta = g.renderer.tintAtlas;
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
    if (had) { /* hit */ }
    else {
      C.bakeMiss++; C.bakeMissKB += w * h * 4 / 1024;
      const pref = String(key).split('|').slice(0, 2).join('|').replace(/\d+/g, '#');
      C.missKeys.set(pref, (C.missKeys.get(pref) ?? 0) + 1);
    }
    return r;
  };

  // ---- Renderer 插桩 ----
  const ren = g.renderer;
  const oTint = ren.tintedSprite;
  ren.tintedSprite = function (k, f, c) {
    C.tinted++;
    const r = oTint.call(this, k, f, c);
    if (!r) C.tintedMiss++;
    return r;
  };

  // ---- GLSpriteLayer 上传口插桩(er: 首建字节=页重传带宽) ----
  const glProto = GLS.prototype;
  const oTFI = glProto.texFromImage;
  glProto.texFromImage = function (key, img, a, b) {
    const before = this.texs ? this.texs.size : -1;
    const r = oTFI.call(this, key, img, a, b);
    if (r && before >= 0 && this.texs.size > before) {
      if (String(key).startsWith('er:')) { C.erFirstN++; C.erFirstBytes += w0(r); }
      else { C.otherFirstN++; C.otherFirstBytes += w0(r); }
    }
    return r;
    function w0(e) { return e.bytes ?? (e.w * e.h * 4); }
  };
  const oTFR = glProto.texFromRegion;
  glProto.texFromRegion = function (key, img, sx, sy, sw, sh) {
    if (String(key).startsWith('er:')) C.erCalls++;
    const r = oTFR.call(this, key, img, sx, sy, sw, sh);
    return r;
  };
  const oTR = glProto.texRefresh;
  glProto.texRefresh = function (key, img) {
    const r = oTR.call(this, key, img);
    if (r) { C.refreshN++; C.refreshBytes += r.w * r.h * 4; }
    return r;
  };

  // ---- 假 boss:出列+手动绘制 ----
  const e = Enemy.fromVanilla(636, p.cx + 200, p.cy - 200);
  if (!e) return { err: 'fromVanilla null' };
  g.entities.add(e, 'enemies');
  await new Promise((r) => setTimeout(r, 900));
  e.dead = true;
  await new Promise((r) => requestAnimationFrame(r));
  e.vx = 0; e.vy = 0; e.spawnAlpha = 0; e.ai3 = 1; e.ai0 = 8; e.ai1 = 0;

  const callDraw = () => {
    const ctx = g.renderer.ctx;
    ctx.save();
    ctx.translate(Math.round(cv.width / 2), Math.round(cv.height / 2));
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-Math.round(cam.x * cam.zoom) / cam.zoom, -Math.round(cam.y * cam.zoom) / cam.zoom);
    ren.drawEmpress(e);
    ctx.restore();
  };

  // 主循环:每帧推进 ai1(atk8 环)+手动绘制+GLStats 采样
  const seen = new Map();
  for (let i = 0; i < framesWanted * 4 && seen.size < framesWanted; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    e.ai0 = 8;
    e.ai1 = (e.ai1 + 2) % 130;   // atk8 残影环相位推进(lv 窗 0..90+)
    e.ai3 = 1;                    // phase2 相位环恒开
    callDraw();
    const s = window.__swGPULog.snapshot();
    const c = s.ctxs.swpipe;
    if (c) seen.set(s.frame, { u: c.frameUp, mb: c.frameUpMB, alloc: c.frameAllocMB, d: c.frameDraws });
  }
  const frames = [...seen.values()];
  const n = frames.length || 1;
  const agg = frames.reduce((a, f) => ({ u: a.u + f.u, mb: a.mb + f.mb, d: a.d + f.d }), { u: 0, mb: 0, d: 0 });

  return {
    band: {
      frames: frames.length,
      uploadsPerFrame: +(agg.u / n).toFixed(2),
      upMBPerFrame: +(agg.mb / n).toFixed(3),
      drawsPerFrame: +(agg.d / n).toFixed(1),
    },
    draw: { empress: C.empress, tinted: C.tinted, tintedMiss: C.tintedMiss },
    ta: {
      allocs: C.allocs, recycled: C.recycled, recycledKB: +C.recycledKB.toFixed(1),
      bakeMiss: C.bakeMiss, bakeMissKB: +C.bakeMissKB.toFixed(1),
      missKeys: [...C.missKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      entries: ta.entries.size, pageCount: ta.pageCount,
    },
    gl: {
      erFirstN: C.erFirstN, erFirstKB: +(C.erFirstBytes / 1024).toFixed(1),
      otherFirstN: C.otherFirstN, otherFirstMB: +(C.otherFirstBytes / 1048576).toFixed(2),
      refreshN: C.refreshN, refreshMB: +(C.refreshBytes / 1048576).toFixed(1),
      erCalls: C.erCalls,
    },
  };
}, N);

console.log(JSON.stringify(out, null, 1));
process.exit(0);
