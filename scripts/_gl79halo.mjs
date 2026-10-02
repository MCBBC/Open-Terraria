// _gl79halo.mjs — 彩虹魔杖(495)引导期光标星形闪光 黑晕 A/B 像素对拍探针 v2
// （GL 复发案定谳用;只读不修）。
// v2:读【可见合成面】(glCanvas+HUD over 折叠)而非主画布;模块 import 不带 ?t=
// （拿游戏同实例,包装才生效）;并案落叶 A/B（清 leaves 前后同区域对拍）。
// 判据：加算/SO 合成正确时星只增亮;差分 dA=lumA-lumB 中 dA<=-8 像素=黑晕签名。
import {
  launchBrowser, openPage, bootstrap, createGame, pump, giveItems,
  saveCanvasShot, resolveShotPath, saveJson,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const TAG = process.env.SW79_TAG ?? 'gl';
const Q = process.env.SW79_Q ?? '';
const browser = await launchBrowser({});
const errors = [];
try {
  const page = await openPage(browser, { errors });
  if (Q) await page.goto(ORIGIN + '/?' + Q.replace(/^[&?]/, ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) { console.log('BOOT-FAIL', boot.why, JSON.stringify(errors.slice(0, 8))); throw new Error('bootstrap fail'); }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) throw new Error('createGame fail: ' + (gen.why ?? ''));
  const gv = await giveItems(page, [{ vid: 495, slot: 0 }], { wipe: true, select: 0 });
  if (!gv.ok) console.log('GIVE-FAIL', JSON.stringify(gv.failed ?? gv));
  await pump(page, 6, {});

  const res = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__swGame;
    if (!g) return { fail: 'no-game' };
    g.paused = false;
    const out = {};

    // ---- 仪表：MagicMissileProj 绘制链（同实例包装） + Renderer 全亮队列 ----
    try {
      const MM = await import('/src/entities/MissileProj.ts');
      const proto = MM.MagicMissileProj.prototype;
      if (!proto.__79wrapped) {
        const od = proto.draw, oh = proto.draw79Head;
        const mm = { draw: 0, head: 0, headQueue: 0, headDirect: 0 };
        window.__mm79 = mm;
        proto.draw = function (r, cam) { mm.draw++; return od.call(this, r, cam); };
        proto.draw79Head = function (ctx, renderer) {
          mm.head++;
          if (renderer && typeof renderer.queueProjFullbright === 'function') mm.headQueue++;
          else mm.headDirect++;
          return oh.call(this, ctx, renderer);
        };
        proto.__79wrapped = true;
      }
    } catch (e) { out.mmWrapErr = String(e); }
    const R = Object.getPrototypeOf(g.renderer);
    if (!R.__79qwrapped) {
      const oq = R.queueProjFullbright, ofts = R.flushTrailShade;
      R.queueProjFullbright = function (fn) { if (window.__mm79) window.__mm79.queuePush = (window.__mm79.queuePush ?? 0) + 1; return oq.call(this, fn); };
      R.flushTrailShade = function (...a) {
        const n = this.projFullbrightQueue.length;
        if (window.__mm79) { window.__mm79.flushWithQ = (window.__mm79.flushWithQ ?? 0) + (n > 0 ? 1 : 0); window.__mm79.flushedHeads = (window.__mm79.flushedHeads ?? 0) + n; }
        return ofts.apply(this, a);
      };
      R.__79qwrapped = true;
    }

    // ---- face 旗 ----
    const F = () => ({
      accMode: g.renderer._accMode,
      bglPathUsed: g.renderer.bglPathUsed,
      sfxPathUsed: g.renderer.sfxPathUsed,
      c10e: g.renderer.constructor.c10e,
      c10eK1: g.renderer.constructor.c10eK1,
      bgl: g.renderer.constructor.bgl,
      bglShim: g.renderer.constructor.bglShim,
      b2b: g.renderer.constructor.b2b,
      cloudPipe: g.renderer.constructor.cloudPipe,
      cpuRender: g.renderer.isCpuRender?.() ?? null,
      farDeferGate: g.renderer.sky?.farDeferGate,
      trailGLfx: !!g.renderer.glfx,
      filters: g.renderer.monoFilters ? { anyInUse: g.renderer.monoFilters.anyInUse, heat: g.renderer.monoFilters.heatInUse } : null,
    });
    out.face = F();

    // ---- 魔力拉满 + 静置 + 鼠标天空 ----
    const p = g.player;
    for (const k of ['maxMana', 'statManaMax', 'statManaMax2']) { try { p[k] = 600; } catch { /* 缺字段 */ } }
    try { p.statMana = 600; } catch { /* 缺字段 */ }
    p.vx = 0; p.vy = 0;
    await wait(400);
    const cv = g.renderer.canvas;
    const rect = cv.getBoundingClientRect();
    const dpr = cv.width / Math.max(1, rect.width);
    // 可见合成面 = glCanvas(栈折叠) + HUD(主画布,透明) over —— 与 DOM/链 premul-over 同式
    const glCv = [...document.querySelectorAll('#game-root canvas')]
      .find((c) => c !== cv) ?? null;
    out.canvasInfo = { hudW: cv.width, glFound: !!glCv, glW: glCv?.width ?? 0, dpr, rectW: rect.width, canvasCount: document.querySelectorAll('#game-root canvas').length };
    const comp = document.createElement('canvas');
    comp.width = cv.width; comp.height = cv.height;
    const cc = comp.getContext('2d', { willReadFrequently: true });
    const readComp = (x, y, S) => {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.clearRect(0, 0, comp.width, comp.height);
      if (glCv) cc.drawImage(glCv, 0, 0);
      cc.drawImage(cv, 0, 0);
      const d = cc.getImageData(x, y, S, S);
      return d.data;
    };
    const readHudOnly = (x, y, S) => {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.globalCompositeOperation = 'source-over';
      cc.clearRect(0, 0, comp.width, comp.height);
      cc.drawImage(cv, 0, 0);
      return cc.getImageData(x, y, S, S).data;
    };

    const mX = Math.round(rect.width / 2), mY = Math.round(rect.height * 0.30);
    const inp = g.input;
    inp.mouseX = mX; inp.mouseY = mY;
    inp.mouseHeld = true; inp.mouseDown = true;
    out.mouse = { mX, mY };

    // ---- 引导 170t + 渲染帧 ----
    for (let i = 0; i < 34; i++) { for (let k = 0; k < 5; k++) g.fixedUpdate(1 / 60); await wait(0); }
    await wait(500);
    const p79 = (g.entities.projectiles ?? []).find((q) => q.projId === 79 && !q.dead);
    out.starCount = (g.entities.projectiles ?? []).filter((q) => q.projId === 79 && !q.dead).length;
    if (!p79) {
      inp.mouseHeld = false; inp.mouseDown = false;
      return { fail: 'no-79', invHeld: g.player.inv?.heldItem?.() ?? null, face: out.face };
    }
    const [swx, swy] = g.camera.worldToScreen(p79.cx, p79.cy);
    out.starScreen = { x: Math.round(swx), y: Math.round(swy), cx: p79.cx, cy: p79.cy, strip: p79.strip?.length ?? 0 };
    out.mmAfterChannel = { ...window.__mm79 };

    // ---- A 帧（星在场）：可见合成 + HUD 单独 两读 ----
    const S = 320;
    const px = Math.round(swx * dpr) - 160, py = Math.round(swy * dpr) - 160;
    const dA = readComp(px, py, S);
    const dAh = readHudOnly(px, py, S);

    // ---- 收招清 79 → B 帧 ----
    inp.mouseHeld = false; inp.mouseDown = false;
    for (const q of (g.entities.projectiles ?? [])) if (q.projId === 79) { q.dead = true; try { q.killNow?.({}); } catch { /* no-op */ } }
    for (let i = 0; i < 6; i++) g.fixedUpdate(1 / 60);
    await wait(400);
    const dB = readComp(px, py, S);

    const diffStats = (dA2, dB2) => {
      let dark = 0, bright = 0, darkSum = 0, brightSum = 0;
      const darkPx = [];
      const n = S * S;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const la = 0.299 * dA2[o] + 0.587 * dA2[o + 1] + 0.114 * dA2[o + 2];
        const lb = 0.299 * dB2[o] + 0.587 * dB2[o + 1] + 0.114 * dB2[o + 2];
        const d = la - lb;
        if (d <= -8) { dark++; darkSum += d; if (darkPx.length < 5000) darkPx.push([i % S, (i / S) | 0, Math.round(d)]); }
        else if (d >= 8) { bright++; brightSum += d; }
      }
      const rings = [0, 0, 0, 0, 0];
      for (const [x, y] of darkPx) {
        const r = Math.hypot(x - 160, y - 160);
        rings[r < 10 ? 0 : r < 20 ? 1 : r < 34 ? 2 : r < 80 ? 3 : 4]++;
      }
      return { dark, bright, darkAvg: dark ? +(darkSum / dark).toFixed(1) : 0, brightAvg: bright ? +(brightSum / bright).toFixed(1) : 0, rings, darkPx };
    };
    out.diffComp = diffStats(dA, dB);
    out.diffHud = diffStats(dAh, Array.from(dB));   // HUD 单独 vs 可见 B（星在 HUD 的贡献形态）

    // ---- 并案：落叶 A/B（同区域法,叶=世界层 SO） ----
    let leafOut = null;
    try {
      const NP = await import('/src/render/NatureParticles.ts');
      const np = NP.natureParticles;
      // 造 12 片叶在天区（星同屏位附近）→ 渲染 → 读 A → 清 → 读 B
      const [wx0, wy0] = g.camera.screenToWorld(mX, mY);
      for (let i = 0; i < 12; i++) {
        np.spawnLeaf(wx0 - 60 + (i % 6) * 24, wy0 - 120 + Math.floor(i / 6) * 30, 1105 + (i % 2), 0);
      }
      for (let i = 0; i < 8; i++) g.fixedUpdate(1 / 60);
      await wait(350);
      const lA = readComp(px - 40, py - 200, 200);
      const leafPos = np.leaves.slice(0, 3).map((l) => { const [sx2, sy2] = g.camera.worldToScreen(l.x, l.y); return [Math.round(sx2), Math.round(sy2), l.gore, l.scale]; });
      const lB = (() => { const n2 = np.leaves.length; np.leaves.length = 0; return n2; })();
      for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
      await wait(350);
      const lA2 = readComp(px - 40, py - 200, 200);
      let dark2 = 0, bright2 = 0;
      const n2 = 200 * 200;
      for (let i = 0; i < n2; i++) {
        const o = i * 4;
        const la = 0.299 * lA[o] + 0.587 * lA[o + 1] + 0.114 * lA[o + 2];
        const lb = 0.299 * lA2[o] + 0.587 * lA2[o + 1] + 0.114 * lA2[o + 2];
        const d = la - lb;
        if (d <= -8) dark2++; else if (d >= 8) bright2++;
      }
      leafOut = { spawned: 12, cleared: lB, dark: dark2, bright: bright2, leafPos, note: 'dark=叶在场帧更暗像素数' };
    } catch (e) { leafOut = { err: String(e) }; }
    out.leaf = leafOut;

    out.faceAfter = F();
    out.mmFinal = { ...window.__mm79 };
    out.A = Array.from(dA);
    out.B = Array.from(dB);
    return out;
  });

  if (res.fail) {
    console.log('PROBE-FAIL', JSON.stringify({ ...res, A: undefined, B: undefined }));
  } else {
    const { A, B, ...rest } = res;
    console.log('RESULT', JSON.stringify(rest));
    saveJson(`/tmp/probe-out/gl79/${TAG}-ab.json`, { A, B });
    await saveCanvasShot(page, resolveShotPath(`gl79/${TAG}-final.png`));
  }
} catch (e) {
  console.log('ERR', String(e && e.message || e).slice(0, 400));
} finally {
  await browser.close().catch(() => {});
}
