// ★EoL 定谳刀活机验证第二发:补射 873 的 fallback 归因（byCause+源样本+存活账）
// + 暂停冻结态【带活弹】三臂像素 A/B（off 基线×2 定非确定底,off vs on 定刀面差）
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_eol-ghost-ab2.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolab2', size: 'small', pinRandom: 20261003, log: () => {} });
console.log('createGame:', made?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const shim = g.renderer.bglEntShim;
  const proto = Object.getPrototypeOf(shim);
  const C = globalThis.__census = { fallback: 0, byCause: {}, samples: [], present: 0 };
  const classify = (self, img, rest) => {
    const n = rest.length;
    const iw = img?.width ?? 0, ih = img?.height ?? 0;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (n === 2) { sx = rest[0]; sy = rest[1]; }
    else if (n === 4) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    else if (n === 8) { sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3]; }
    if (self.clipped) return 'clip';
    if (n !== 2 && n !== 4 && n !== 8) return 'argc';
    if (![sx, sy, sw, sh].every(Number.isFinite)) return 'nonfinite';
    if (sw > 0 && sh > 0 && (sx >= iw || sx + sw <= 0 || sy >= ih || sy + sh <= 0)) return 'srcOOB-empty';
    if (!(sx >= 0 && sy >= 0 && sx + sw <= iw && sy + sh <= ih) || sw < 0 || sh < 0) return 'srcOOB-partial';
    if (self.gco === 'destination-out') return 'erase-nopair';
    if (self.gco !== 'source-over' && self.gco !== 'lighter') return 'gco';
    if (self.accMode && self.filterV !== 'none') return 'filter-raster';
    return 'decode-null';
  };
  const origRaw = proto.rawDrawImage;
  proto.rawDrawImage = function (img, rest) {
    C.fallback++;
    const k = classify(this, img, rest);
    C.byCause[k] = (C.byCause[k] || 0) + 1;
    if (C.samples.length < 24) C.samples.push({ k, iw: img?.width, ih: img?.height, rest: rest.map((v) => (typeof v === 'number' ? +v.toFixed(1) : typeof v)) });
    return origRaw.call(this, img, rest);
  };
  const origPb = proto.presentBatch;
  proto.presentBatch = function (...a) { C.present++; return origPb.apply(this, a); };
  globalThis.__censusReady = true;
});

// —— 补射 873（开阔空中平飞）+ 存活/回退归因 ——
await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  for (let i = 0; i < 5; i++) {
    await window.__swFlow.spawnHostileProj(px + 40 * i, py - 260, 3 + 0.5 * i, 0, 40, 873, 0);
  }
});
await sleep(1300);
const life = await page.evaluate(() => {
  const g = window.__swGame;
  let alive = 0; g.entities?.projectiles?.forEach?.((p) => { if (p?.projId === 873) alive++; });
  const C = globalThis.__census;
  return { alive, fallback: C.fallback, byCause: { ...C.byCause }, samples: C.samples.slice(0, 10) };
});
console.log('== 补射阶段（1.3s,门=修后缺省开） ==');
console.log(JSON.stringify(life, null, 1));

// —— 暂停冻结 + 三臂像素 A/B ——
await page.evaluate(() => { window.__swGame.paused = true; });
await sleep(300);
const pausedState = await page.evaluate(() => {
  const g = window.__swGame;
  let alive = 0; g.entities?.projectiles?.forEach?.((p) => { if (p?.projId === 873) alive++; });
  globalThis.__census.fallback = 0; globalThis.__census.present = 0; globalThis.__census.byCause = {};
  return { alive };
});
console.log('paused alive 873:', JSON.stringify(pausedState));

const snap = async () => await page.screenshot({ type: 'png' });
const setGate = (v) => page.evaluate(async (vv) => {
  const m = await import('/src/render/glshim/GLShimExecutor.ts');
  m.GLShimExecutor.SRC_OOB_NOOP_OFF = vv;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, v);

const counters = () => page.evaluate(() => { const C = globalThis.__census; return { fallback: C.fallback, present: C.present, byCause: { ...C.byCause } }; });

await setGate(true);  await sleep(500); const sOff1 = await snap(); const cOff1 = await counters();
await sleep(400);                          const sOff2 = await snap(); const cOff2 = await counters();
await setGate(false); await sleep(500); const sOn  = await snap(); const cOn  = await counters();

console.log('== A/B 账（暂停态,每臂≥2 帧） ==');
console.log('off1:', JSON.stringify(cOff1));
console.log('off2:', JSON.stringify(cOff2));
console.log('on  :', JSON.stringify(cOn));
console.log('off1==off2 (非确定底):', sOff1.equals(sOff2));
console.log('off1==on  (刀面像素差):', sOff1.equals(sOn), '| bytes', sOff1.length, sOn.length);

await import('node:fs').then((fs) => {
  fs.mkdirSync('/tmp/eol-verify', { recursive: true });
  fs.writeFileSync('/tmp/eol-verify/ab2-off1.png', sOff1);
  fs.writeFileSync('/tmp/eol-verify/ab2-off2.png', sOff2);
  fs.writeFileSync('/tmp/eol-verify/ab2-on.png', sOn);
});
console.log('shots: /tmp/eol-verify/ab2-*.png');
await page.evaluate(() => { window.__swGame.paused = false; });
await page.browser().close();
