// 雷击帧雨消失定谳探针 v2(吞/盖/冲淡三形态甄别):
//   a) shim/批 trace —— 雷帧 drawRain 是否仍被调/雨 quads 是否仍入批/发射
//      (emitRainQuadBatch/pushQuadBatch/flushAcc/accFail/replay2D 全链挂账);
//   b) 像素 —— 雷帧雨开 vs 雨关差分(雨条=不透明蓝 116,146,219×tint;
//      闪白天=白,雨条应呈暗蓝=高可见;夜=暗条低可见但非零)。
// 钉:raining/maxRaining/rainTime/cloudAlpha 100ms 重钉(防天气周期 stopRain);
//     lightning 钉 0/1(decay=0+newLightning 中和);1091 直发走 bolt bake 交互面。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5252';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.includes('失败') || t.includes('degrade') || t.includes('unavailable')) console.log('CON:', t.slice(0, 200)); });
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
// 关欢迎弹窗(否则 gamePaused 冻结 update/雨池)
await page.evaluate(() => { window.btnByText2?.('我已知晓')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const dlg = [...document.querySelectorAll('button')].some((b) => b.textContent?.includes('我已知晓'));
  if (dlg) window.btnByText2?.('我已知晓')?.click();
  return !dlg;
});

// ---- 强制雷暴+夜(100ms 重钉) ----
const forced = await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  g.world.clock.timeOfDay = 0.9;   // 夜
  w.shouldUseStormMusic = true; w.storming = true;
  w.newLightning = () => {};                 // 中和自然闪
  w.lightning = 0; w.lightningSpeed = 0; w.lightningDecay = 0;
  window.__pinTimer = setInterval(() => {
    w.raining = true; w.maxRaining = 0.9; w.rainTime = 1e9;
    w.cloudAlpha = 0.9; w.windSpeedTarget = 0.7; w.windSpeedCurrent = 0.7;
  }, 100);
  return { ok: true };
});
console.log('FORCE', JSON.stringify(forced));
await new Promise((r) => setTimeout(r, 6000));   // 雨池填满

// ---- 装配 ----
const inst = await page.evaluate(async () => {
  const R = (await import('/src/render/Renderer.ts')).Renderer;
  const WRm = await import('/src/render/WeatherRenderer.ts');
  const WR = WRm.WeatherRenderer;
  const EX = (await import('/src/render/glshim/GLShimExecutor.ts')).GLShimExecutor;
  const g = window.__swGame;
  const r = g.renderer;
  window.__rec = [];
  let cur = null;
  const shim = () => r.bglEntShim;
  const snapStats = () => { const s = shim()?.stats; return s ? { bq: s.emitBatchQuads, fl: s.flushes, fb: s.fallback, rp: s.replays, up: s.uploads } : null; };

  const origDraw = WR.prototype.drawRain;
  WR.prototype.drawRain = function (rr, world) {
    cur = { t: Math.round(performance.now()), built: -1, emit: null, flushDelta: null, tint: null, drops: 0 };
    origDraw.call(this, rr, world);
    cur.built = WRm.drawRainBatchCaptureForTest().quads;
    cur.drops = this.pool.reduce((n, d) => n + (d.active ? 1 : 0), 0);
    const drop = this.pool.find((d) => d.active);
    if (drop && this.hooks) {
      const out = [0, 0, 0];
      this.hooks.lightAtTo(Math.floor((drop.x + 4) / 16), Math.floor((drop.y + 4) / 16), out);
      cur.tint = { light: out.map((v) => Math.round(v)) };
    }
    cur.s1 = snapStats();
    window.__rec.push(cur);
    cur = null;
  };
  const origEmit = R.prototype.emitRainQuadBatch;
  R.prototype.emitRainQuadBatch = function (img, key, data, quads, replay) {
    const host = window.__rec[window.__rec.length - 1];
    const ret = origEmit.call(this, img, key, data, quads, replay);
    if (host) host.emit = { quads, ret };
    return ret;
  };
  const origFlushAcc = EX.prototype.flushAcc;
  EX.prototype.flushAcc = function () {
    const b = this.stats ? this.stats.emitBatchQuads : -1;
    origFlushAcc.call(this);
    const host = window.__rec[window.__rec.length - 1];
    if (host && host.flushDelta === null) host.flushDelta = { dQuads: (this.stats ? this.stats.emitBatchQuads : -1) - b };
  };
  if (!EX.prototype.__rainProbePatched) {
    const origFail = EX.prototype.accFail;
    EX.prototype.accFail = function (why) { if (!this._failCount) this._failCount = 0; this._failCount++; window.__accFails.push(why); return origFail.call(this, why); };
    const origReplay = EX.prototype.replay2D;
    EX.prototype.replay2D = function () { if (!this._replayCount) this._replayCount = 0; this._replayCount++; return origReplay.call(this); };
    EX.prototype.__rainProbePatched = true;
  }
  if (!window.__accFails) window.__accFails = [];
  window.__rainOff = () => {
    const fx = g.renderer.weatherFx;
    if (!fx.__origMakeRain) fx.__origMakeRain = fx.makeRain;
    fx.makeRain = () => {};
    fx.pool.forEach((d) => { d.active = false; });
    fx.snow.forEach((f) => { f.active = false; });
    fx.sand.forEach((s) => { s.active = false; });
  };
  window.__rainOn = () => {
    const fx = g.renderer.weatherFx;
    if (fx.__origMakeRain) { fx.makeRain = fx.__origMakeRain; delete fx.__origMakeRain; }
  };
  window.__boltAt = (x, y) => { g.spawnStormBolt1091(x, y, (Math.random() * 4294967295) >>> 0); };
  return { shimActive: !!shim(), accMode: !!shim()?.accMode };
});
console.log('INST', JSON.stringify(inst));

async function settle() { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); }

async function sampleState(name, offDelayMs) {
  await page.evaluate(() => { window.__rec.length = 0; });
  await new Promise((r) => setTimeout(r, 600));
  await settle();
  const shotOn = await page.screenshot({ type: 'png' });
  await page.evaluate(() => { window.__rainOff(); });
  await new Promise((r) => setTimeout(r, offDelayMs));
  await settle();
  const shotOff = await page.screenshot({ type: 'png' });
  const recs = await page.evaluate(() => JSON.parse(JSON.stringify(window.__rec)));
  await page.evaluate(() => { window.__rainOn(); });
  await new Promise((r) => setTimeout(r, 800));
  const fails = await page.evaluate(() => [...window.__accFails]);
  const replays = await page.evaluate(() => window.__swGame.renderer.bglEntShim?._replayCount ?? 0);
  console.log(`STATE ${name}: recs=${recs.length} fails=${JSON.stringify(fails)} replays=${replays}`);
  return { recs, shotOn, shotOff };
}

// ---- 状态 A:lightning=0 ----
await page.evaluate(() => { const w = window.__swGame.world.weather; w.lightning = 0; });
const A = await sampleState('A lightning=0', 600);

// ---- 状态 B:lightning=1 钉住 ----
await page.evaluate(() => { const w = window.__swGame.world.weather; w.lightning = 1; w.lightningSpeed = 0; w.lightningDecay = 0; });
const B = await sampleState('B lightning=1', 600);

// ---- 状态 C:lightning=1 + 真 1091 落雷 ----
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  window.__boltAt(p.cx + 220, p.cy - 600);
});
await new Promise((r) => setTimeout(r, 100));
const C = await sampleState('C lightning=1+bolt', 1500);   // 等雷亡(45t≈750ms)再拍对照

{
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/rainlv', { recursive: true });
  fs.writeFileSync('/tmp/rainlv/A-on.png', A.shotOn);
  fs.writeFileSync('/tmp/rainlv/A-off.png', A.shotOff);
  fs.writeFileSync('/tmp/rainlv/B-on.png', B.shotOn);
  fs.writeFileSync('/tmp/rainlv/B-off.png', B.shotOff);
  fs.writeFileSync('/tmp/rainlv/C-on.png', C.shotOn);
  fs.writeFileSync('/tmp/rainlv/C-off.png', C.shotOff);
  fs.writeFileSync('/tmp/rainlv/recs.json', JSON.stringify({ A: A.recs, B: B.recs, C: C.recs }, null, 1));
}

const summarize = (name, recs) => {
  const live = recs.filter((r) => r.drops > 0);
  const last = (live.length ? live : recs).slice(-5);
  console.log(`\n== ${name} 活滴帧 ${live.length}/${recs.length};最近 ${last.length} 帧雨账 ==`);
  for (const r of last) {
    console.log(` drops=${r.drops} built=${r.built} emit=${r.emit ? r.emit.quads + (r.emit.ret ? '(acc)' : '(REJ)') : 'null'} flush=${JSON.stringify(r.flushDelta)} lightAtDrop=${r.tint ? r.tint.light.join(',') : '-'}`);
  }
};
summarize('A lightning=0', A.recs);
summarize('B lightning=1', B.recs);
summarize('C lightning=1+bolt', C.recs);
await browser.close();

// ---- 像素差分 ----
const diff = (bufA, bufB, tag) => {
  const a = PNG.sync.read(bufA), b = PNG.sync.read(bufB);
  const h = a.height, w = a.width;
  const y0 = Math.floor(h * 0.04), y1 = Math.floor(h * 0.3);
  let dN = 0, dSum = 0, dMax = 0, dNegN = 0, dPosN = 0;
  const x0 = Math.floor(w * 0.15), x1 = Math.floor(w * 0.85);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const dr = a.data[i] - b.data[i], dg = a.data[i + 1] - b.data[i + 1], db = a.data[i + 2] - b.data[i + 2];
      const ad = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
      if (ad > 6) { dN++; dSum += ad; if (ad > dMax) dMax = ad; if (dr + dg + db < 0) dNegN++; else dPosN++; }
    }
  }
  const px = (x, y) => { const i = (y * w + x) * 4; return [a.data[i], a.data[i + 1], a.data[i + 2]]; };
  const skyOn = px(Math.floor(w / 2), Math.floor(h * 0.08));
  const skyOff = (() => { const i = (Math.floor(h * 0.08) * w + Math.floor(w / 2)) * 4; return [b.data[i], b.data[i + 1], b.data[i + 2]]; })();
  console.log(`${tag}: 天空@8%h 雨开=${skyOn.join(',')} 雨关=${skyOff.join(',')} | 雨差分(>6): n=${dN} mean=${dN ? (dSum / dN).toFixed(1) : 0} max=${dMax.toFixed(0)} 暗向=${dNegN} 亮向=${dPosN}`);
};
console.log('\n== 像素差分(雨开 vs 雨关) ==');
diff(A.shotOn, A.shotOff, 'A 夜/无闪');
diff(B.shotOn, B.shotOff, 'B 夜/闪白钉1');
diff(C.shotOn, C.shotOff, 'C 夜/闪白+落雷');
