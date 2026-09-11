// ★SW-RB13a 红蓝对抗探针：FX27 反重力呈现翻转（屏翻转门 + 输入换算）实机取证。
//   取证面：
//   A. 翻转门活性（gd=1 世界态下仅切 player.gravDir → render 头同步 → 翻转块执行）：
//      帧 A(gd=1) vs 帧 B(gravDir=-1、物理不泵、世界态同帧) 必须非零差（门死=0 差）。
//   B. 镜像正确性：B 的世界区 ≈ A 的整幅垂直镜像（y'=viewH−y）——取 HUD/光标/
//      玩家避开窗逐像素对拍，噪声基线 = 同门两连拍（A1/A2）差。
//   C. gd=1 恒等 + 双点同步：gravDir=1 泵拍后 cam.flipY===false；gravDir=-1 泵拍后
//      fixedUpdate 同步点（Game.ts:8308）即已 true（不等渲染头兜底）。
//   D. 输入换算（ReverseGravitySupport/MouseWorld :2835-2842）：翻转态
//      worldToScreenDisplayed(screenToWorld(m)) == m（显示往返恒等）+ MouseWorld
//      闭式 cam.y+(viewH/2−my)/zoom 全等；zoom 1 / 1.5 / resize 三档 × 6 屏点。
//   E. SmartSelect 反演式（SmartSelectGamepadPointer.cs:27-30）代数：用活相机值验
//      (screenTopY+screenHeight−rawY/zoom) ≡ screenToWorld(rawY)（防二次反演接线回归）。
//   产物：/tmp/probe-out/_fx27-flip-probe/{A,B,B2}.png + 控制台 JSON。
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootstrap, createGame, pump, nextFrame } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_fx27-flip-probe';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({
  executablePath: process.env.SW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
page.__probeOrigin = ORIGIN;
await bootstrap(page, ORIGIN);
const made = await createGame(page, { seed: process.env.SW_SEED ?? '', size: 'small', pinRandom: 20260911 });
if (!made.ok) { console.error('BOOT FAIL', made); process.exit(1); }

// 稳定站位：出生点站地、鼠标停左上角（避开比对窗）、关全屏地图；
// 授重力药水 buff 18（无 buff 时 updateGravityControls :26936 每 tick 归位 gravDir=1
// ——裸写 player.gravDir=-1 会被吃掉，是游戏语义不是 bug）
await pump(page, 30);
await page.evaluate(() => {
  const g = globalThis.__swGame;
  g.input.mouseX = 6; g.input.mouseY = 6;
  if (g.renderer.fullMap) g.renderer.fullMap.open = false;
  g.player.buffs.apply(61, 300);   // BuffType.Gravitation = 61（vanilla buff 18）
});

const rep = await page.evaluate(async () => {
  const g = globalThis.__swGame;
  const cam = g.camera, r = g.renderer, p = g.player;
  const out = { checks: {}, dims: {} };
  const cv = r.canvas;
  const W = cv.width, H = cv.height;
  out.dims = { W, H, zoom: cam.zoom };

  const snap = () => {
    const c2 = cv.getContext('2d');
    return new Uint8ClampedArray(c2.getImageData(0, 0, W, H).data);
  };
  const meanDiff = (a, b, x0, y0, w, h) => {
    let s = 0, n = 0;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * W + x) * 4;
        s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        n++;
      }
    }
    return s / Math.max(1, n);
  };
  const fingerprint = (d, x0, y0, w, h) => {
    let fnv = 0x811c9dc5; const seen = new Set();
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = (y * W + x) * 4;
      const q = ((d[i] >> 5) << 10) | ((d[i + 1] >> 5) << 5) | (d[i + 2] >> 5);
      seen.add(q); fnv ^= q; fnv = Math.imul(fnv, 0x01000193) >>> 0;
    }
    return { distinct: seen.size, fnv: fnv >>> 0 };
  };
  // 三连拍：同一次 render 包装内 A(gd=1) → B(gravDir=-1) → A2(gd=1)
  // （物理不泵=世界态同帧；render 头每帧读 gravDir 同步 flipY=真值源。
  //   主循环 rAF 下一拍自动命中包装，无须手工触发）
  const shots = await new Promise((resolve) => {
    const orig = r.render.bind(r);
    let done = false;
    r.render = (...args) => {
      try {
        p.gravDir = 1; orig(...args); const A = snap();
        p.gravDir = -1; orig(...args); const B = snap();
        p.gravDir = 1; orig(...args); const A2 = snap();
        done = true;
        resolve({ A, B, A2 });
      } finally {
        r.render = orig;
        p.gravDir = 1;
      }
    };
    setTimeout(() => { if (!done) resolve(null); }, 4000);
  });
  if (!shots) { out.checks.tripleShot = 'TIMEOUT'; return out; }
  const { A, B, A2 } = shots;
  out.shots = {};
  const png = (d, name) => {
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    c2.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d), W, H), 0, 0);
    return c2.toDataURL('image/png');
  };
  out.shotUrls = { A: png(A, 'A'), B: png(B, 'B'), A2: png(A2, 'A2') };

  // 比对窗：左中带（HUD 外、光标外、玩家中心外；垂直居中带镜像后落同带=两侧都有内容）
  const wx0 = 40, ww = 200, wh = 160, wy0 = (H >> 1) - (wh >> 1);
  out.win = { wx0, wy0, ww, wh };
  out.fpA = fingerprint(A, wx0, wy0, ww, wh);
  out.checks.windowContent = { fpA: out.fpA, pass: out.fpA.distinct >= 8 };   // 空窗=比对无意义
  const noise = meanDiff(A, A2, wx0, wy0, ww, wh);
  // 信号：B 的镜像窗 vs A 的原窗（把 B 上下镜像后与 A 同窗对拍）
  const mirroredB = new Uint8ClampedArray(B.length);
  for (let y = 0; y < H; y++) mirroredB.set(B.subarray(((H - 1 - y) * W) * 4, ((H - y) * W) * 4), y * W * 4);
  const signal = meanDiff(A, mirroredB, wx0, wy0, ww, wh);
  out.checks.gateLive = { noise, signal, pass: signal > Math.max(2, noise * 2) };   // 门死 ⇒ signal≈0
  // 镜像律判据：翻转若整体错位（如漏镜像/双重镜像），大差像素会铺满窗口；
  // 动画格（火把/水/植物）残差只会是局部小斑块。
  let big = 0, tot = 0;
  const blockDiff = new Map();
  for (let y = wy0; y < wy0 + wh; y++) for (let x = wx0; x < wx0 + ww; x++) {
    const i = (y * W + x) * 4;
    const d = Math.abs(A[i] - mirroredB[i]) + Math.abs(A[i + 1] - mirroredB[i + 1]) + Math.abs(A[i + 2] - mirroredB[i + 2]);
    tot++;
    if (d > 60) big++;
    const bk = `${(x >> 4)},${(y >> 4)}`;
    blockDiff.set(bk, (blockDiff.get(bk) ?? 0) + d);
  }
  const hotBlocks = [...blockDiff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  out.mirrorDiag = { bigFraction: +(big / tot).toFixed(4), hotBlocks };
  out.checks.mirrorExact = { signal, noise, bigFraction: out.mirrorDiag.bigFraction, pass: out.mirrorDiag.bigFraction < 0.15 };
  // 对照组：A vs A 自身镜像（无翻转世界）必须显著大于 signal（世界不是上下对称的）
  const mirroredA = new Uint8ClampedArray(A.length);
  for (let y = 0; y < H; y++) mirroredA.set(A.subarray(((H - 1 - y) * W) * 4, ((H - y) * W) * 4), y * W * 4);
  const selfMirror = meanDiff(A, mirroredA, wx0, wy0, ww, wh);
  out.checks.selfMirrorControl = { selfMirror, pass: selfMirror > Math.max(signal * 2, noise * 10) };

  // C. 双点同步（Gravitation buff 在身 ⇒ updateGravityControls 不归位）
  p.gravDir = 1; g.fixedUpdate(1 / 60);
  const syncOff = cam.flipY === false;
  p.gravDir = -1; g.fixedUpdate(1 / 60);
  const syncOn = cam.flipY === true;              // fixedUpdate 同步点（渲染头之前）
  p.gravDir = 1; g.fixedUpdate(1 / 60);
  out.checks.sync = { syncOff, syncOn, pass: syncOff && syncOn };

  // D. 输入换算往返 + MouseWorld 闭式（zoom 三档 × 6 屏点）——翻转态下进行
  p.gravDir = -1; g.fixedUpdate(1 / 60);          // flipY=true（buff 在身不被归位）
  const pts = [[6, 6], [320, 200], [640, 400], [900, 150], [1270, 790], [200, 700]];
  const zt = [];
  for (const z of [1, 1.5]) {
    cam.zoom = z;
    for (const [mx, my] of pts) {
      const [wx, wy] = cam.screenToWorld(mx, my);
      const [bx, by] = cam.worldToScreenDisplayed(wx, wy);
      const closedForm = cam.y + (H / 2 - my) / z;      // Main.cs:2835-2842 闭式
      zt.push({ z, mx, my, roundTrip: Math.abs(bx - mx) < 1e-6 && Math.abs(by - my) < 1e-6, mouseWorld: Math.abs(wy - closedForm) < 1e-6 });
    }
  }
  cam.zoom = 1;
  out.checks.input = { rows: zt, pass: zt.every((t) => t.roundTrip && t.mouseWorld) };

  // E. SmartSelect 反演式代数（:27-30 原式喂 rawMouseYWorldScale ≡ screenToWorld）
  const rawY = 333, zz = cam.zoom;
  const screenTopY = cam.y - H / 2 / zz;
  const viaVanilla = (screenTopY + H / zz - rawY / zz) / 16;
  const viaScreenToWorld = cam.screenToWorld(100, rawY)[1] / 16;
  out.checks.smartSelectAlgebra = { viaVanilla, viaScreenToWorld, pass: Math.abs(viaVanilla - viaScreenToWorld) < 1e-9 };
  p.gravDir = 1; g.fixedUpdate(1 / 60);
  return out;
});

// D-bis. resize 后 viewH 语义（翻转态窗口尺寸变化 → 换算随新视口闭环）
await page.setViewport({ width: 1100, height: 700 });
await nextFrame(page); await nextFrame(page);
rep.checks.inputAfterResize = await page.evaluate(() => {
  const g = globalThis.__swGame;
  const cam = g.camera, p = g.player, cv = g.renderer.canvas;
  const H = cv.height;
  p.gravDir = -1; g.fixedUpdate(1 / 60);          // 同步 flipY（resize 后仍双点同步）
  const rows = [];
  for (const [mx, my] of [[8, 8], [550, 350], [1090, 690]]) {
    const [wx, wy] = cam.screenToWorld(mx, my);
    const [bx, by] = cam.worldToScreenDisplayed(wx, wy);
    rows.push({ mx, my, roundTrip: Math.abs(bx - mx) < 1e-6 && Math.abs(by - my) < 1e-6, viewH: H });
  }
  p.gravDir = 1; g.fixedUpdate(1 / 60);
  return { rows, pass: rows.every((t) => t.roundTrip) && rows.every((t) => t.viewH === 700) };
});

// 截图落盘（A/B 两态全帧）
for (const [name, url] of Object.entries(rep.shotUrls ?? {})) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
delete rep.shotUrls;
console.log(JSON.stringify(rep, null, 1));
const fails = Object.entries(rep.checks).filter(([, v]) => v && v.pass === false);
if (fails.length) { console.error('RED:', fails.map(([k]) => k).join(',')); process.exit(2); }
await browser.close();
console.log('FX27 PROBE GREEN');
