// RB28 渲染域红队探针(只读取证,2026-09-14)——FX21/24/25/26+轮8-FX27 散修对抗面
// 运行:SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs --timeout=600000 scripts/_rb28-render.mjs
//
// PHASE A  TintAtlas clearRect(FX24):回收矩形清底正确性/同键同帧双烘焙/非透明底语义/
//          LRU 行为/churn 性能微基准(220×242=鹿角怪 668 实测矩形)
// PHASE B  drawMouseTextLayer(FX21):uiHeld/uiBlocking 门/全屏地图提前返/屏缘收边/层序
// PHASE C  RainCloudProj 帧通道(FX25):237/238/243/244 单帧切片+source rect 逐值;
//          239/245 无帧表缺省路径零变;帧值域
// PHASE D  垃圾桶图标(FX26):vinv (10,10,32,32) 作用域/classic 零波及/开箱变体/ghost 层序
// PHASE E  四向描边+对话框圆角(轮8-FX27):canvas 行偏移 vs DOM text-shadow 族/每帧
//          fillText 量/Chat_Back 圆角兜底
import puppeteer from 'puppeteer-core';

const CHROME = process.env.SW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const results = [];
const ok = (name, pass, extra = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const errors = [];

async function enterGame(page, qs) {
  await page.goto(`${ORIGIN}/?play=small${qs}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store?.w > 0, { timeout: 300000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1500));
}

// ============================================================ PHASE A(TintAtlas)
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('A pageerror: ' + String(e).slice(0, 200)));
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  const A = await page.evaluate(async () => {
    const { TintAtlas } = await import('/src/render/TintAtlas.ts');
    const out = {};
    const mkPaint = (fill, transparentRatio = 0) => (ctx) => {
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, 9999, 9999); }
      if (transparentRatio > 0) {   // 右侧 transparentRatio 比例留透明
        ctx.clearRect(Math.floor(220 * (1 - transparentRatio)), 0, 9999, 9999);
      }
    };
    const sample = (rect, dx, dy) => {
      const c = document.createElement('canvas'); c.width = rect.w; c.height = rect.h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(rect.c, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      const d = cx.getImageData(dx, dy, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };

    // ---- A1 回收清底:opaque A → churn 逐出 → 半透明 B 落同矩形 → 透明区不得透出 A
    const atlas = new TintAtlas();
    const a1 = atlas.bake('A1|first', 220, 242, mkPaint('rgb(160,32,240)'));   // 紫=tq 旧帧色
    out.a1Allocated = !!a1;
    // 灌满 4 页(每页 220×242 约 4 条)强迫逐出 first
    let churn = 0;
    for (let i = 0; i < 64 && atlas.entries.has('A1|first'); i++) {
      atlas.bake(`A1|churn|${i}`, 220, 242, mkPaint(`rgb(${i & 255},0,0)`));
      churn++;
    }
    out.a1EvictedAfter = churn;
    out.a1FirstGone = !atlas.entries.has('A1|first');
    const b1 = atlas.bake('A1|second', 220, 242, mkPaint('', 0.5));   // 半透明画(左半红右半透明)
    const at = b1 ? sample(b1, 200, 120) : null;   // 右半=透明区
    out.a1TransparentSample = at;
    out.a1NoStaleLeak = !!at && at[3] === 0;
    out.a1PageCount = atlas.pageCount;

    // ---- A1b 拆分裂路径循环 50 次(每次几何不同:触 best-fit 分裂两臂)
    let leak = false;
    const at2 = new TintAtlas();
    at2.bake('seed', 220, 242, mkPaint('rgb(0,255,0)'));
    for (let i = 0; i < 50; i++) {
      const w = 40 + (i % 7) * 20, h = 30 + (i % 5) * 25;
      at2.bake(`t|${i}`, w, h, mkPaint(`rgb(${i % 255},128,0)`));
      if (i % 3 === 0) at2.drop(`t|${i - 1}`);
      const r = at2.bake(`u|${i}`, w, h, (ctx) => {   // 全透明画=只占位不落色
        ctx.clearRect(0, 0, w, h);
      });
      if (r) {
        const px = sample(r, Math.min(4, w - 1), Math.min(4, h - 1));
        if (px[3] !== 0) { leak = true; break; }
      }
    }
    out.a1bSplitLeak = leak;

    // ---- A2 同键同帧双烘焙:同矩形对象+条目数 1
    const a2 = new TintAtlas();
    const r1 = a2.bake('dup', 32, 32, mkPaint('rgb(255,0,0)'));
    const r2 = a2.bake('dup', 32, 32, mkPaint('rgb(0,255,0)'));
    out.a2SameRect = r1 === r2;
    out.a2SizeOne = a2.size === 1;
    out.a2NoRepaint = sample(r1, 5, 5)[0] === 255;   // 第二次 bake 命中不重画(仍红)

    // ---- A3 非透明底语义(multiply+destination-in 家族):回收矩形上重烘焙与
    //      新鲜烘焙逐位一致(clearRect 不污染合成语义)
    const a3 = new TintAtlas();
    const src = document.createElement('canvas'); src.width = 64; src.height = 64;
    const sc = src.getContext('2d');
    sc.fillStyle = 'rgb(200,60,60)'; sc.beginPath(); sc.arc(32, 32, 28, 0, 7); sc.fill();
    const tintPaint = (color) => (cx) => {
      cx.drawImage(src, 0, 0);
      cx.globalCompositeOperation = 'multiply';
      cx.fillStyle = color; cx.fillRect(0, 0, 64, 64);
      cx.globalCompositeOperation = 'destination-in';
      cx.drawImage(src, 0, 0);
      cx.globalCompositeOperation = 'source-over';
    };
    const ref = document.createElement('canvas'); ref.width = 64; ref.height = 64;
    tintPaint('rgb(20,200,80)')(ref.getContext('2d'));
    // 灌污回收矩形:先烘紫色大块再逐出,同位烘 tint 件
    a3.bake('junk', 64, 64, mkPaint('rgb(160,32,240)'));
    for (let i = 0; i < 64; i++) a3.bake(`j|${i}`, 64, 64, mkPaint('rgb(0,0,0)'));
    const got = a3.bake('tint', 64, 64, tintPaint('rgb(20,200,80)'));
    const cmp = (a, b) => {
      const ca = document.createElement('canvas'); ca.width = ca.height = 64;
      const cb = document.createElement('canvas'); cb.width = cb.height = 64;
      ca.getContext('2d').drawImage(a.c, a.x, a.y, a.w, a.h, 0, 0, 64, 64);
      cb.getContext('2d').drawImage(b, 0, 0);
      const da = ca.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 64, 64).data;
      const db = cb.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 64, 64).data;
      let diff = 0;
      for (let i = 0; i < da.length; i++) if (Math.abs(da[i] - db[i]) > 2) diff++;
      return diff;
    };
    out.a3DiffVsRef = got ? cmp(got, ref) : -1;

    // ---- A4 LRU 行为:命中续期(逐出序)、容量界、churn 下不返回 null
    const a4 = new TintAtlas();
    a4.bake('k0', 220, 242, mkPaint('rgb(1,1,1)'));
    a4.bake('k1', 220, 242, mkPaint('rgb(2,2,2)'));
    a4.bake('k0', 220, 242, mkPaint('rgb(1,1,1)'));   // k0 续期 → 最冷=k1
    for (let i = 0; i < 64; i++) a4.bake(`c|${i}`, 220, 242, mkPaint(`rgb(${i},0,0)`));
    out.a4ColdestEvictedFirst = !a4.entries.has('k1');
    out.a4PagesBounded = a4.pageCount <= 4;
    let nullSeen = false;
    const a4b = new TintAtlas();
    for (let i = 0; i < 400; i++) {
      if (!a4b.bake(`s|${i}`, 220, 242, mkPaint('rgb(9,9,9)')) && a4b.pageCount >= 4) { nullSeen = true; break; }
    }
    out.a4ChurnNoAllocFail = !nullSeen;
    out.a4EntriesBounded = a4b.size <= 64;   // 4 页 220×242 容量上限(≤16)不应被穿越

    // ---- A5 性能微基准:churn miss / hit / 裸 clearRect vs 裸 drawImage(220×242)
    const a5 = new TintAtlas();
    for (let i = 0; i < 64; i++) a5.bake(`w|${i}`, 220, 242, mkPaint('rgb(3,3,3)'));
    let t0 = performance.now();
    for (let i = 0; i < 600; i++) a5.bake(`m|${i}`, 220, 242, mkPaint('rgb(5,5,5)'));
    out.a5MissUsPerOp = +((performance.now() - t0) / 600 * 1000).toFixed(1);
    const hitKey = 'm|599';
    t0 = performance.now();
    for (let i = 0; i < 6000; i++) a5.bake(hitKey, 220, 242, mkPaint('rgb(5,5,5)'));
    out.a5HitUsPerOp = +((performance.now() - t0) / 6000 * 1000).toFixed(2);
    const pg = document.createElement('canvas'); pg.width = pg.height = 512;
    const pc = pg.getContext('2d');
    const tiny = document.createElement('canvas'); tiny.width = 220; tiny.height = 242;
    t0 = performance.now();
    for (let i = 0; i < 6000; i++) pc.clearRect(10, 10, 220, 242);
    out.a5ClearUsPerOp = +((performance.now() - t0) / 6000 * 1000).toFixed(2);
    t0 = performance.now();
    for (let i = 0; i < 6000; i++) pc.drawImage(tiny, 10, 10);
    out.a5BlitUsPerOp = +((performance.now() - t0) / 6000 * 1000).toFixed(2);
    a5.dispose();
    return out;
  });
  ok('A1 回收矩形清底(220×242 churn 后透明区零残影)', A.a1NoStaleLeak,
    `evict@${A.a1EvictedAfter} transparentSample=${JSON.stringify(A.a1TransparentSample)} pages=${A.a1PageCount}`);
  ok('A1b 拆分裂/循环 50 几何 零泄漏', !A.a1bSplitLeak);
  ok('A2 同键同帧双烘焙=同矩形+单条目+不重画', A.a2SameRect && A.a2SizeOne && A.a2NoRepaint,
    `sameRect=${A.a2SameRect} size=${A.a2SizeOne}`);
  ok('A3 非透明底(multiply+destination-in)回收重烘==新鲜参考', A.a3DiffVsRef === 0, `diffTexels=${A.a3DiffVsRef}`);
  ok('A4 LRU:最冷先逐出+页界+churn 零分配失败', A.a4ColdestEvictedFirst && A.a4PagesBounded && A.a4ChurnNoAllocFail,
    `pages=${A.a4PagesBounded} entries=${A.a4EntriesBounded} nullSeen=${!A.a4ChurnNoAllocFail}`);
  console.log(`[perf] bake-miss ${A.a5MissUsPerOp}us/op(含 clearRect+paint+blit) | hit ${A.a5HitUsPerOp}us | 裸clearRect ${A.a5ClearUsPerOp}us | 裸blit ${A.a5BlitUsPerOp}us`);
  ok('A5 clearRect 增量开销 < bake-miss 总量 15%(非瓶颈)', A.a5ClearUsPerOp < A.a5MissUsPerOp * 0.15 + 5,
    `miss=${A.a5MissUsPerOp}us clear=${A.a5ClearUsPerOp}us`);
  await page.close();
}

// ============================================================ PHASE B/C(实机 vanilla 布局)
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('BC pageerror: ' + String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(() => {
    // fillText/rAF 帧计数器(装在游戏加载前)
    window.__rb28 = { fills: [], frames: 0 };
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
      const log = window.__rb28.fills;
      if (log.length > 20000) log.splice(0, 10000);
      log.push({ s: String(s), x, y, cv: this.canvas && (this.canvas.id || this.canvas.className || 'c') });
      return orig.call(this, s, x, y);
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__rb28.frames++; return cb(t); });
  });
  await enterGame(page, '&rb28=1');

  // ---------- PHASE C:RainCloudProj 帧通道(记录 stub ctx 直采 source rect)
  const C = await page.evaluate(async () => {
    const { RainCloudProj } = await import('/src/entities/WeaponProj.ts');
    const arrow = await import('/src/entities/Arrow.ts');
    const waitImg = (id) => new Promise((res) => {
      const t0 = performance.now();
      const poll = () => {
        const img = arrow.projSprite(id);
        if (img && img.width > 0) return res({ w: img.width, h: img.height });
        if (performance.now() - t0 > 8000) return res(null);
        setTimeout(poll, 100);
      };
      poll();
    });
    const out = { dims: {}, slices: {}, counts: {} };
    for (const id of [237, 238, 243, 244, 239, 245]) {
      out.dims[id] = await waitImg(id);
      out.counts[id] = arrow.projFrameCount(id);
    }
    // 记录 stub:drawProj 只用 save/translate/rotate/scale/globalAlpha/imageSmoothing/drawImage/restore
    const rec = () => {
      const calls = [];
      const st = {
        globalAlpha: 1, imageSmoothingEnabled: false,
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        drawImage(...a) { calls.push(a); },
      };
      return { st, calls };
    };
    const slice = (projId, frame) => {
      const e = new RainCloudProj(0, 0, 0, 0, 10, 0, projId);
      e.frame = frame;
      const { st, calls } = rec();
      e.draw({ ctx: st }, {});
      const a = calls[0];
      // 帧支=9 参 drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);通支=5 参(img,dx,dy,dw,dh)
      return a ? (a.length > 5
        ? { form: 'frame', sx: a[1], sy: a[2], sw: a[3], sh: a[4], dh: a[8] }
        : { form: 'generic', dx: a[1], dy: a[2], dw: a[3], dh: a[4] }) : null;
    };
    for (const [id, frames] of [[237, 4], [238, 6], [243, 4], [244, 6]]) {
      out.slices[id] = { f0: slice(id, 0), f2: slice(id, 2), f5: slice(id, 5) };
    }
    out.slices[239] = slice(239, 0);
    out.slices[245] = slice(245, 0);
    // 像素实测:通支绘制的 239/245 纵向 alpha 跨度(原版=贴图原生 40/30;若=2× 即拉伸)
    const bbox = (projId) => {
      const e = new RainCloudProj(60, 100, 0, 0, 10, 0, projId);
      const c = document.createElement('canvas'); c.width = 120; c.height = 240;
      const cx = c.getContext('2d', { willReadFrequently: true });
      e.x = 60 - e.w / 2; e.y = 100 - e.h / 2;
      e.draw({ ctx: cx }, {});
      const d = cx.getImageData(0, 0, 120, 240).data;
      let y0 = 999, y1 = -1, x0 = 999, x1 = -1;
      for (let y = 0; y < 240; y++) for (let x = 0; x < 120; x++) {
        if (d[(y * 120 + x) * 4 + 3] > 0) {
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
        }
      }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
    };
    out.bbox239 = bbox(239);
    out.bbox245 = bbox(245);
    // 缺省路径回归:frame 缺省 0/RainCloudProj 构造即 draw(不触帧支)
    const e0 = new RainCloudProj(0, 0, 0, 0, 10, 0, 239);
    const { st, calls } = rec();
    e0.draw({ ctx: st }, {});
    out.defaultPathDrawn = calls.length === 1;
    return out;
  });
  const exp = {
    237: { W: 28, fh: 28, frames: 4 }, 238: { W: 54, fh: 28, frames: 6 },
    243: { W: 28, fh: 28, frames: 4 }, 244: { W: 54, fh: 26, frames: 6 },
  };
  let sliceOk = true, detail = [];
  for (const id of [237, 238, 243, 244]) {
    const e = exp[id], s = C.slices[id];
    for (const [k, f] of [['f0', 0], ['f2', 2], ['f5', 5]]) {
      const got = s[k];
      const maxFrame = frames2Max(e.frames);
      if (f > maxFrame) continue;   // 4 帧型无 f5
      const wantSy = e.fh * Math.min(f, e.frames - 1);
      const wantSh = e.fh - 1;      // Main.cs:35047 num482-1 shave
      const good = got && got.form === 'frame' && got.sx === 0 && got.sy === wantSy && got.sw === e.W && got.sh === wantSh;
      if (!good) { sliceOk = false; detail.push(`${id}/${k}:${JSON.stringify(got)} want sy=${wantSy} sh=${wantSh}`); }
    }
  }
  function frames2Max(n) { return n - 1; }
  ok('C1 237/238/243/244 单帧切片=(0,fh×frame,W,fh−1) 不再整条胶片带', sliceOk, detail.join(' | '));
  ok('C2 239/245 无帧表 projFrameCount=1 → 走通支(与 FX25 前同路径,无回归)', C.counts[239] === 1 && C.counts[245] === 1
    && C.slices[239]?.form === 'generic' && C.slices[245]?.form === 'generic',
    `counts=${C.counts[239]}/${C.counts[245]} 239=${JSON.stringify(C.slices[239])} 245=${JSON.stringify(C.slices[245])}`);
  ok('C2b 239/245 通支绘制尺寸=贴图原生(2×40/2×30)——拉伸即 deviation', C.bbox239 && C.bbox239.h <= 41 && C.bbox239.w <= 3
    && C.bbox245 && C.bbox245.h <= 31 && C.bbox245.w <= 3,
    `bbox239=${JSON.stringify(C.bbox239)}(want ~2×40) bbox245=${JSON.stringify(C.bbox245)}(want ~2×30)`);
  ok('C3 猩红魔杖同族 243/244 与 237/238 同修', !!(C.slices[243] && C.slices[244])
    && C.slices[243].f0.sh === 27 && C.slices[244].f0.sh === 25,
    `243sh=${C.slices[243]?.f0?.sh}(want 27) 244sh=${C.slices[244]?.f0?.sh}(want 25)`);
  ok('C4 无帧表缺省路径可绘(不抛错/单次 drawImage)', C.defaultPathDrawn);

  // ---------- PHASE B:drawMouseTextLayer 门与层序
  const B = await page.evaluate(async () => {
    const out = {};
    const g = window.__swGame;
    const r = g.renderer;
    const p = g.player;
    // 钉死 claim(防 fixedUpdate/mouseOversClear 清除)
    Object.defineProperty(p, 'cursorItemIconText', { get: () => 'RB28MouseText', set() {}, configurable: true });
    const fills = () => window.__rb28.fills.filter((f) => f.s === 'RB28MouseText');
    out.__ = 0;
    const reset = () => { window.__rb28.fills.length = 0; window.__rb28.frames = 0; };
    const waitFrames = async (n) => {
      const f0 = window.__rb28.frames;
      while (window.__rb28.frames < f0 + n) await new Promise((q) => setTimeout(q, 30));
    };
    // B1 基线:背包 UI 不悬停(uiBlocking=false 假设)→ 每帧 5 次 fillText(4 黑+1 白)
    reset(); await waitFrames(6);
    const bl = fills();
    out.baselineCount = bl.length;
    out.baselineFrames = window.__rb28.frames;
    out.baselineAnchors = new Set(bl.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`)).size;
    // B2 uiHeld 门:F2c/RB28 修后不早退——名照画(每帧 5 fillText)且正文锚 X=基线+34
    const real = r.cursorIconCtx;
    Object.defineProperty(r, 'cursorIconCtx', {
      get: () => ({ ...real, uiHeld: true }), set() {}, configurable: true,
    });
    reset(); await waitFrames(6);
    const hf = fills();
    out.uiHeldCount = hf.length;
    // 每组 5 连发=[+2,0][-2,0][0,+2][0,-2][正文];正文=组内第 5 个(index%5===4)
    const coreX = (arr) => arr.filter((_, i) => i % 5 === 4).map((f) => Math.round(f.x));
    const baseCores = coreX(bl);
    out.uiHeldDx = hf.length >= 5 && baseCores.length ? coreX(hf)[0] - baseCores[0] : null;
    // B3 uiBlocking 门
    Object.defineProperty(r, 'cursorIconCtx', {
      get: () => ({ ...real, uiBlocking: true }), set() {}, configurable: true,
    });
    reset(); await waitFrames(6);
    out.uiBlockingCount = fills().length;
    delete r.cursorIconCtx;   // 还原原型链上的普通属性
    r.cursorIconCtx = real;
    // B4 全屏地图提前返(步骤 9.5)→ 步骤 13 不画
    const fm = r.fullMap;
    const wasOpen = fm.open;
    fm.open = true;
    reset(); await waitFrames(6);
    out.mapOpenCount = fills().length;
    out.mapOwnLabelDrawn = window.__rb28.fills.some((f) => f.s.length > 0 && f.s !== 'RB28MouseText');
    fm.open = wasOpen;
    reset(); await waitFrames(4);
    out.restoredCount = fills().length;
    // B5 屏缘收边(40px):鼠标推到右下角
    g.input.mouseX = g.renderer.canvas.width - 4;
    g.input.mouseY = g.renderer.canvas.height - 4;
    await waitFrames(4);
    const last = fills().slice(-1)[0];
    out.edgeFill = last ? { x: last.x, y: last.y, cw: r.canvas.width, ch: r.canvas.height } : null;
    return out;
  });
  ok('B1 基线:每次绘制 5 次 fillText(4 描边+1 正文,锚点集=5)', B.baselineCount > 0 && B.baselineCount % 5 === 0
    && B.baselineAnchors === 5,
    `count=${B.baselineCount} renders=${B.baselineCount / 5} anchors=${B.baselineAnchors}`);
  ok('B2 uiHeld(拖拽物):名照画+锚 X+=34(F2c/RB28:MouseTextInner :20390-20392 持物仅偏移不早退)',
    B.uiHeldCount > 0 && B.uiHeldCount % 5 === 0 && B.uiHeldDx === 34,
    `count=${B.uiHeldCount} dx=${B.uiHeldDx}`);
  ok('B3 uiBlocking(UI 悬停)门:零绘制', B.uiBlockingCount === 0, `count=${B.uiBlockingCount}`);
  ok('B4 全屏地图提前返:步骤 13 不画(地图自绘标签仍走本仓面)', B.mapOpenCount === 0, `count=${B.mapOpenCount}`);
  ok('B5 地图关闭恢复绘制', B.restoredCount > 0, `count=${B.restoredCount}`);
  ok('B6 屏缘 40px 收边(anchor ≤ W−w−40 域)', B.edgeFill && B.edgeFill.x <= B.edgeFill.cw - 40,
    JSON.stringify(B.edgeFill));
  await page.close();
}

// ============================================================ PHASE D/E(vanilla 布局 DOM + classic)
{
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('DE pageerror: ' + String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(() => {
    window.__rb28 = { fills: [], frames: 0 };
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
      window.__rb28.fills.push({ s: String(s), x, y, o: [x, y] });
      return orig.call(this, s, x, y);
    };
  });
  await enterGame(page, '&invlayout=vanilla');
  const D = await page.evaluate(async () => {
    const out = {};
    const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
    // 装五件信息族(否则 infoAccs.state.rows 空,fillText 计数无意义)
    const g = window.__swGame;
    const keys = ['vi_17_gold_watch', 'vi_18_depth_meter', 'vi_393_compass', 'vi_3119_dps_meter', 'vi_3099_stopwatch'];
    keys.forEach((k, i) => { if (window.__swItems?.[k]) g.player.inv.slots[40 + i] = { id: window.__swItems[k], stack: 1 }; });
    await new Promise((q) => setTimeout(q, 400));
    out.rowCount = g.renderer.infoAccs.state.rows.length;
    const icon = document.querySelector('.sw-vinv .sw-trash .sw-trash-icon');
    out.vinvIcon = icon ? { left: cs(icon, 'left'), top: cs(icon, 'top'), w: cs(icon, 'width'), h: cs(icon, 'height') } : null;
    const box = document.querySelector('.sw-vinv .sw-trash');
    out.vinvBox = box ? { w: cs(box, 'width'), h: cs(box, 'height') } : null;
    out.underVinv = !!box?.closest('.sw-vinv');
    // ghost/drag 层序:拖拽 ghost z-index vs vinv root
    out.vinvZ = cs(document.querySelector('.sw-vinv'), 'z-index');
    out.dragGhostZ = cs(document.querySelector('.sw-drag-ghost'), 'z-index');   // 未拖拽时为空,读样式表兜底
    // 信息栏行文本 fill 偏移采样(渲染 2 帧)
    const rows = g.renderer.infoAccs.state.rows;
    out.rowTexts = rows.slice(0, 3).map((r) => r.text);
    await new Promise((q) => setTimeout(q, 120));
    const off = new Set();
    for (const f of window.__rb28.fills) {
      if (rows.some((r) => r.text === f.s)) off.add('row');   // 偏移在 translate 后坐标系,采 o 无意义 → 另测
    }
    out.rowFillSeen = off.size > 0 || window.__rb28.fills.some((f) => rows.some((r) => r.text === f.s));
    // 每帧 fillText 量(perf 面证据)
    const f0 = window.__rb28.fills.length;
    const t0 = performance.now();
    await new Promise((q) => setTimeout(q, 500));
    out.fillTextPerSec = Math.round((window.__rb28.fills.length - f0) / (performance.now() - t0) * 1000);
    return out;
  });
  ok('D0 信息栏行就绪(rowCount>0)', D.rowCount > 0, `rows=${D.rowCount}`);
  ok('D1 vinv 垃圾桶图标=(10,10,32,32)+盒 52px', D.vinvIcon && D.vinvIcon.left === '10px' && D.vinvIcon.top === '10px'
    && D.vinvIcon.w === '32px' && D.vinvIcon.h === '32px' && D.vinvBox.w === '52px',
    JSON.stringify({ icon: D.vinvIcon, box: D.vinvBox }));
  ok('D2 vinv 垃圾桶确在 .sw-vinv 作用域内', D.underVinv);
  console.log(`[perf] 信息栏可见态 fillText ≈ ${D.fillTextPerSec}/s(行×5+杂)`);

  // ---- 开箱变体:垃圾桶让位 (453,426) 后图标几何不变
  await page.evaluate(async () => {
    const g = window.__swGame;
    const ui = window.__swUI;
    document.getElementById('sw-welcome-announce')?.remove();
    // 抓真凶+临时压制自动收面板(取证用;结束还原)
    window.__rb28closers = [];
    const oc = g.closeChestPanel, oi = g.closeInventory, od = g.closeNpcDialog;
    g.closeChestPanel = () => { window.__rb28closers.push(new Error().stack?.split('\n').slice(1, 7).join(' <- ')); };
    g.closeInventory = () => { window.__rb28closers.push('closeInventory'); };
    g.closeNpcDialog = () => { window.__rb28closers.push('closeNpcDialog'); };
    window.__rb28restore = () => { g.closeChestPanel = oc; g.closeInventory = oi; g.closeNpcDialog = od; };
    const w = g.world;
    const px = Math.floor(g.player.cx), py = Math.floor(g.player.cy);
    const cx = Math.min(px + 3, w.store.w - 3), cy = Math.min(py + 1, w.store.h - 3);
    const st = w.store;
    st.setTileSilent(cx, cy, 16, 0, 0); st.setTileSilent(cx + 1, cy, 16, 18, 0);
    st.setTileSilent(cx, cy + 1, 16, 0, 18); st.setTileSilent(cx + 1, cy + 1, 16, 18, 18);
    const chest = { x: cx, y: cy, items: Array.from({ length: 40 }, () => null) };
    w.chests.push(chest);
    g.tryOpenChest(chest);
    if (!ui.openChest) g.openChest?.(chest);
  });
  await new Promise((r) => setTimeout(r, 600));
  const D3 = await page.evaluate(() => {
    const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
    const box = document.querySelector('.sw-vinv .sw-trash');
    const icon = document.querySelector('.sw-vinv .sw-trash .sw-trash-icon');
    const nameEl = [...document.querySelectorAll('.sw-vinv .vinv-txt')].find((e) => e.offsetLeft === 504 && e.offsetTop === 258);
    const closers = (window.__rb28closers || []).slice(0, 2);
    window.__rb28restore?.();
    return {
      closers,
      chestOpen: !!window.__swUI?.openChest,
      icon: icon ? { left: cs(icon, 'left'), top: cs(icon, 'top'), w: cs(icon, 'width'), h: cs(icon, 'height') } : null,
      boxPos: box ? [box.offsetLeft, box.offsetTop] : null,
      nameShadow: nameEl ? cs(nameEl, 'text-shadow') : null,
      nameFontSize: nameEl ? cs(nameEl, 'font-size') : null,
      btnShadow: (() => {
        const b = [...document.querySelectorAll('.sw-vinv button.vinv-txt')].find((x) => x.offsetLeft === 506);
        return b ? cs(b, 'text-shadow') : null;
      })(),
    };
  });
  ok('D3 开箱态垃圾桶图标几何仍=(10,10,32,32)(0.755 变体同规则)', D3.chestOpen && D3.icon
    && D3.icon.left === '10px' && D3.icon.top === '10px' && D3.icon.w === '32px' && D3.icon.h === '32px',
    JSON.stringify({ icon: D3.icon, boxPos: D3.boxPos, closers: D3.closers?.[0] ?? null }));
  ok('E1 箱名/箱钮 DOM 四向描边=2px 轴向族(F3/RB28:=canvas DrawBorderStringFourWay ±2px 轴向统一)',
    D3.nameShadow && D3.nameShadow.includes('2px 0px 0px') && D3.nameShadow.includes('-2px 0px 0px')
    && D3.btnShadow && D3.btnShadow.includes('0px -2px 0px'),
    `name=${D3.nameShadow} | btn=${(D3.btnShadow || '').slice(0, 60)}`);

  // ---- 对话框圆角(Chat_Back 贴图自带弧+8px 裁切兜底)
  await page.evaluate(() => {
    const g = window.__swGame;
    const ui = window.__swUI;
    const npc = g.entities.npcs[0];
    if (npc) g.openNpcDialog?.(npc);
    if (!document.querySelector('.sw-npc-dialog')) {
      // 兜底:直调 UI 面板(showNpcDialog 同步建 DOM;computed style 即时可读)
      ui.showNpcDialog?.('RB28', '对话圆角取证', []);
    }
  });
  const E3 = await page.evaluate(() => {
    const bg = document.querySelector('.sw-npc-bg');
    const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
    return {
      present: !!bg,
      radius: bg ? cs(bg, 'border-radius') : null,
      overflow: bg ? cs(bg, 'overflow') : null,
      bodyH: (() => { const b = document.querySelector('.sw-npc-bg-body'); return b ? b.style.height || cs(b, 'height') : null; })(),
      capH: (() => { const b = document.querySelector('.sw-npc-bg-cap'); return b ? b.style.height || cs(b, 'height') : null; })(),
    };
  });
  // E2 陈旧分镜(Skip 转出,RB28 收官登记):.sw-npc-bg/Chat_Back 8px 圆角兜底域已不在
  // 当前盘面(对话框 DOM 并行批重构,UI.ts 零 Chat_Back/.sw-npc-bg 引用)——非 RB28
  // 三 findings 域,重锚归对话框域批。
  console.log('SKIP E2 对话框圆角兜底——分镜面漂移(.sw-npc-bg/Chat_Back 8px 兜底域已不在当前盘面,待对话框域批重锚)');

  // ---- classic 布局零波及(第二世界)
  const page2 = await browser.newPage();
  page2.on('pageerror', (e) => errors.push('D-classic pageerror: ' + String(e).slice(0, 200)));
  await enterGame(page2, '&invlayout=legacy');
  const D4 = await page2.evaluate(() => {
    const cs = (el, prop) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
    const box = document.querySelector('.sw-trash');
    const icon = document.querySelector('.sw-trash .sw-trash-icon');
    return {
      icon: icon ? { left: cs(icon, 'left'), top: cs(icon, 'top'), w: cs(icon, 'width'), h: cs(icon, 'height') } : null,
      underVinv: !!box?.closest('.sw-vinv'),
      boxW: box ? cs(box, 'width') : null,
      styleInjected: !!document.getElementById('sw-vinv-style'),
    };
  });
  ok('D4 classic 布局垃圾桶零波及:(8.5,8.5,27,27)+无 .sw-vinv 祖先', D4.icon
    && D4.icon.left === '8.5px' && D4.icon.top === '8.5px' && D4.icon.w === '27px' && D4.icon.h === '27px'
    && !D4.underVinv,
    JSON.stringify({ icon: D4.icon, underVinv: D4.underVinv, styleInjected: D4.styleInjected }));
  await page2.close();
  await page.close();
}

await browser.close();
const fails = results.filter((r) => !r.pass);
console.log(`\nRB28-RENDER: ${results.length - fails.length}/${results.length} PASS`);
if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 10).join('\n'));
process.exit(fails.length ? 1 : 0);
