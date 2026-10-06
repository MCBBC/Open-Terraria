// ★债B 独立复核探针（BJ422-债1 标尺网格亮背景 dst 衰减;台账=已清偿 2026-10-03 BJ448）。
//  不复用 BJ448 刀测代码——独立重推:精确 XNA AlphaBlend(One/InvSrcAlpha) 双 pass
//  （黑罩 multiply 先行 dst×(1−a) + 'lighter' 预乘 rgb 加算）在亮底的逐通道净差
//  Δc = src_c − a·dst_c;旧单加法（brightwash 病灶）Δc = src_c。
//  判别符=【红通道符号】:src_r=17（num3=0.7,gridDist=0;a=35/255）⇒ 精确式
//  Δr=17−0.137·dst_r,雪面 dst_r>124 → 红【变暗】;旧加法 Δr=+17 恒【变亮】。
//  判据:
//   B1 网格真实在画（changed 像素 >0）
//   B2 dst 衰减在场:条带 meanΔr < 0（罩 live=brightwash 已清偿的直接物证）
//   B3 rgb 加算在场:条带 meanΔb > 0（网格可见=加算臂 live）
//   B4 帧耗:网格可见帧 ≤ 不可见帧 ×1.35（成本答案②:仅标尺可见帧付 ×2 绘制）
//  运行:SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=280000 scripts/_debtB-ruler-wash-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261006 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__frameMs = 0;
    const gf = window.__swGame.frame.bind(window.__swGame);
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      const tf = performance.now();
      gf(window.__vnow);
      window.__frameMs += performance.now() - tf;
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, frameMs: window.__frameMs });
    };
    requestAnimationFrame(cnt);
  });
});

await freezeClock(page, { tod: 0.5 });
// 场面:天然雪原表面（零地形写——手写 tile 会撞 AutoTiler 框架化/光照重算两坑）
//  世界域扫描「连续 ≥60 列平坦雪面」（单列扫表=局部山丘假象;雪块 mapColor
//  #D3ECF1 全日照=最亮自然底）,玩家立于其中,光照 90 帧收敛后暂停定格
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const snowId = window.__swTiles?.['snow'] ?? 23;
  const yBase = Math.floor(g.world.groundLevel);
  const surfAt = (x) => { for (let y = yBase - 100; y < yBase + 100; y++) if (st.isActive(x, y)) return y; return -1; };
  const flatScan = (wantType, tol, span) => {
    for (let x0 = 420; x0 < st.w - 700; x0 += 10) {   // x≥420 跳过外缘海滩（水体邻接视野）
      const y0 = surfAt(x0);
      if (y0 < 0) continue;
      if (st.liquid && st.liquid[(y0 - 1) * st.w + x0] > 0) continue;   // 海底伪地表排除（水非 active= surfAt 命中水下）
      if (wantType !== null && st.get(x0, y0) !== wantType) continue;
      let flat = true;
      for (let x = x0; x < x0 + span; x += 8) {
        const y = surfAt(x);
        if (y < 0 || Math.abs(y - y0) > tol || (wantType !== null && st.get(x, y) !== wantType)
          || (st.liquid && st.liquid[(y - 1) * st.w + x] > 0)) { flat = false; break; }
      }
      if (flat) return { x: x0 + (span >> 1), y: y0 };
    }
    return null;
  };
  const spot = flatScan(snowId, 5, 30) ?? flatScan(window.__swTiles?.['sand'] ?? 22, 4, 30) ?? flatScan(null, 3, 30);
  const px = spot.x, surf = spot.y;
  window.__surf = surf; window.__px = px; window.__isSnow = st.get(px, surf) === snowId;
  window.__place = () => {   // 可重入定位（settle 期重力下落 → 定格前重贴）
    g.player.x = px * 16; g.player.y = (surf - 4) * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = px * 16; g.camera.y = (surf + 2) * 16;    // 相机下压:雪面占画面中带
  };
  window.__place();
  // 钉住标尺网格态（Game.render 每帧注入会被覆盖 → defineProperty 钉死）
  const r = g.renderer;
  const pinned = {
    lineOn: false, gridOn: false,
    feetTx: px, feetTy: surf - 4,
    nudge: 1, mouseTx: px - 80, mouseTy: surf - 60,  // 十字行+列全出视区=条带纯普通格
    speed: 99, gridDist: 0, gravDir: 1,               // gridDist=0 → num3=rulerGridFade(0)=0.7 恒亮
  };
  Object.defineProperty(r, 'builderRulers', { get: () => pinned, set: () => {}, configurable: true });
  window.__gridOn = (v) => { pinned.gridOn = v; };
  window.__snap = () => {
    const c = r.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  };
});
console.log(`[scene] surf=${await page.evaluate(() => window.__surf)} px=${await page.evaluate(() => window.__px)} isSnow=${await page.evaluate(() => window.__isSnow)}`);
// 光照收敛:暂停会冻结光照——先不暂停跑 90 帧让光照/取景收敛,重贴定位
//  （settle 期重力下落）,再暂停定格做 A/B
await page.evaluate(() => { window.__swGame.paused = false; window.__swGame.running = true; });
await page.evaluate(() => window.__drive(90));
await page.evaluate(() => { window.__place(); });
await page.evaluate(() => window.__drive(6));
await page.evaluate(() => { window.__swGame.paused = true; window.__swGame.running = false; });
await page.evaluate(() => { window.__drive(20); window.__gridOn(true); });
// 预热:tintedExtra 首帧触发 Extra_68 异步加载,就绪前不产出（预跑 90 帧待加载完）
await page.evaluate(() => window.__drive(90));
const warm = await page.evaluate(() => window.__snap());
console.log(`[warm] snap ${warm.w}x${warm.h}`);
await page.evaluate(() => window.__gridOn(true));
await page.evaluate(() => window.__drive(3));
const finOn = await page.evaluate(() => window.__snap());
await page.evaluate(() => { window.__gridOn(false); });
await page.evaluate(() => window.__drive(3));
const finOff = await page.evaluate(() => window.__snap());
writeFileSync('/tmp/debtB-ruler-off.b64', finOff.b64);
writeFileSync('/tmp/debtB-ruler-on.b64', finOn.b64);

// ---- 条带度量（dt: on−off,限定亮雪条带+排除 HUD 区）----
const metrics = await page.evaluate(({ a, b }) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64);
  const W = a.w, H = a.h;
  const x0 = Math.floor(W * 0.12), x1 = Math.floor(W * 0.88);
  // 动态选最亮 120 行窗（对 zoom/相机鲁棒;只要求亮底=雪面板,防暗区混入翻转符号）
  const WIN = 120;
  let bestY = Math.floor(H * 0.5), bestM = -1;
  const rowMean = [];
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = x0; x < x1; x += 4) s += P[(y * W + x) * 4];
    rowMean.push(s / Math.ceil((x1 - x0) / 4));
  }
  for (let y = 0; y + WIN <= H; y++) {
    let m = 0;
    for (let k = 0; k < WIN; k += 4) m += rowMean[y + k];
    m = m / Math.ceil(WIN / 4);
    if (m > bestM) { bestM = m; bestY = y; }
  }
  const y0 = bestY, y1 = bestY + WIN;
  let n = 0, sr = 0, sg = 0, sb = 0, dstr = 0, dstrN = 0, model = 0, stripR = 0, stripN = 0;
  let nb = 0, srb = 0;
  const A = 35 / 255, SRC = [17, 57, 64], TC = [1, 127 / 255];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      stripR += P[i]; stripN++;
      const dr = Q[i] - P[i], dg = Q[i + 1] - P[i + 1], db = Q[i + 2] - P[i + 2];
      if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > 3) {
        n++;
        sr += dr; sg += dg; sb += db;
        if (P[i] > 140) {
          nb++;
          srb += dr;
          dstr += P[i]; dstrN++;
          // 模型命中（信息面）:Δc = src_c − A·t·dst_c,t∈{255,127 模板档}
          for (const t of TC) {
            const er = SRC[0] - A * t * P[i], eg = SRC[1] - A * t * P[i + 1], eb = SRC[2] - A * t * P[i + 2];
            if (Math.abs(dr - er) <= 6 && Math.abs(dg - eg) <= 6 && Math.abs(db - eb) <= 6) { model++; break; }
          }
        }
      }
    }
  }
  return { n, mr: n ? sr / n : 0, mg: n ? sg / n : 0, mb: n ? sb / n : 0, dstR: dstrN ? dstr / dstrN : 0, modelN: model, stripR: stripR / stripN, nb, mrb: nb ? srb / nb : 0, strip: [x0, y0, x1, y1], W, H };
}, { a: finOff, b: finOn });
console.log(`[metrics] changed=${metrics.n} meanΔr=${metrics.mr.toFixed(2)} meanΔg=${metrics.mg.toFixed(2)} meanΔb=${metrics.mb.toFixed(2)} 亮底子集 n=${metrics.nb} meanΔr=${metrics.mrb.toFixed(2)} dstR=${metrics.dstR.toFixed(1)} stripR=${metrics.stripR.toFixed(1)} modelHit=${metrics.modelN} strip=${JSON.stringify(metrics.strip)} ${metrics.W}x${metrics.H}`);

chk('B0 条带亮度有效（亮底 mean dst_r>140,防暗室假象）', metrics.stripR > 140, `stripR=${metrics.stripR.toFixed(1)}`);
chk('B1 网格真实在画（changed>2000）', metrics.n > 2000, `changed=${metrics.n}`);
chk('B2 亮底 dst 衰减在场（亮底子集 meanΔr<0=罩 live;旧纯加法该子集 Δr=+17t 恒正）',
  metrics.nb > 3000 && metrics.mrb < 0,
  `亮底 n=${metrics.nb} meanΔr=${metrics.mrb.toFixed(2)} (dstR=${metrics.dstR.toFixed(1)};精确式 Δr=17−0.137·dst_r<0 ⟺ dst_r>124)`);
chk('B3 rgb 加算在场（meanΔb>0=网格可见）', metrics.mb > 0, `meanΔb=${metrics.mb.toFixed(2)}`);

// ---- B4 帧耗（网格可见 vs 不可见,各 2s）——测量报告+宽松护栏（成本答案②:
//   ×2 绘制仅标尺可见帧支付;实测 1280×800 网格全视图 ≈ +2~14ms/帧=BJ448-观1 量化）----
await page.evaluate(() => window.__gridOn(false));
await new Promise((r) => setTimeout(r, 250));
const perfOff = await page.evaluate((ms) => window.__perfWindow(ms), 2000);
await page.evaluate(() => window.__gridOn(true));
await new Promise((r) => setTimeout(r, 250));
const perfOn = await page.evaluate((ms) => window.__perfWindow(ms), 2000);
const fmOff = perfOff.frameMs / Math.max(1, perfOff.frames);
const fmOn = perfOn.frameMs / Math.max(1, perfOn.frames);
chk('B4 帧耗护栏（网格可见帧 ≤ 不可见 ×6;实测入账=观1 量化）', fmOn <= fmOff * 6,
  `off=${fmOff.toFixed(2)}ms on=${fmOn.toFixed(2)}ms（+${(((fmOn / fmOff) - 1) * 100).toFixed(1)}%,+${(fmOn - fmOff).toFixed(2)}ms;仅标尺可见帧付 ×2 绘制）`);

chk('页面零错误', pageErrors.filter((e) => !e.includes('favicon')).length === 0, pageErrors.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
