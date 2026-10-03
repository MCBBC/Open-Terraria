// ★EoL 定谳刀终验:①俯冲 873 死亡场景 fallback 归因（复现首跑 +18880 账）
// ②像素差分三臂 A/B（pngjs:diff(off1,on) ≤ diff(off1,off2) 非确定底 → 刀面零像素差）
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_eol-ghost-ab3.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolab3', size: 'small', pinRandom: 20261003, log: () => {} });
console.log('createGame:', made?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer.bglEntShim);
  const C = globalThis.__census = { fallback: 0, byCause: {}, present: 0 };
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
    return origRaw.call(this, img, rest);
  };
  const origPb = proto.presentBatch;
  proto.presentBatch = function (...a) { C.present++; return origPb.apply(this, a); };
  globalThis.__censusReady = true;
});

// ---- ①俯冲 873（首跑同参）:死亡+杀尘场景 fallback 归因 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  for (let i = 0; i < 5; i++) {
    await window.__swFlow.spawnHostileProj(px + 200, py - 200 - i * 40, -4 - i, 3 + i, 40, 873, 0);
  }
});
await sleep(2500);
const dive = await page.evaluate(() => {
  const g = window.__swGame;
  let alive = 0; g.entities?.projectiles?.forEach?.((p) => { if (p?.projId === 873) alive++; });
  let dust = 0; g.entities?.dusts?.forEach?.((_d) => dust++);   // 尘量级
  const C = globalThis.__census;
  return { alive, dust, fallback: C.fallback, present: C.present, byCause: { ...C.byCause } };
});
console.log('== ① 俯冲 873 死亡场景（门=修后缺省开,2.5s） ==');
console.log(JSON.stringify(dive, null, 1));

// ---- ②像素差分 A/B:横飞 873 存活+暂停冻结 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  for (let i = 0; i < 5; i++) {
    await window.__swFlow.spawnHostileProj(px + 40 * i, py - 260, 3 + 0.5 * i, 0, 40, 873, 0);
  }
});
await sleep(1300);
await page.evaluate(() => {
  window.__swGame.paused = true;
  globalThis.__census.fallback = 0; globalThis.__census.present = 0;
});
await sleep(300);

const snap = async () => await page.screenshot({ type: 'png' });
const setGate = (v) => page.evaluate(async (vv) => {
  const m = await import('/src/render/glshim/GLShimExecutor.ts');
  m.GLShimExecutor.SRC_OOB_NOOP_OFF = vv;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, v);
const counters = () => page.evaluate(() => { const C = globalThis.__census; return { fallback: C.fallback, present: C.present }; });

await setGate(true);  await sleep(450); const sOff1 = await snap(); const cOff1 = await counters();
await sleep(400);                          const sOff2 = await snap(); const cOff2 = await counters();
await setGate(false); await sleep(450); const sOn  = await snap(); const cOn  = await counters();

const diff = (a, b) => {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { n: -1 };
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const d = A.data, e = B.data;
  for (let y = 0; y < A.height; y++) {
    for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      if (Math.abs(d[i] - e[i]) > 2 || Math.abs(d[i + 1] - e[i + 1]) > 2 || Math.abs(d[i + 2] - e[i + 2]) > 2 || Math.abs(d[i + 3] - e[i + 3]) > 2) {
        n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { n, bbox: n ? [x0, y0, x1, y1] : null };
};

console.log('== ② A/B 账（暂停冻结态） ==');
console.log('off1:', JSON.stringify(cOff1), ' off2:', JSON.stringify(cOff2), ' on:', JSON.stringify(cOn));
console.log('像素差 off1-vs-off2（非确定底）:', JSON.stringify(diff(sOff1, sOff2)));
console.log('像素差 off1-vs-on  （刀面）    :', JSON.stringify(diff(sOff1, sOn)));
console.log('像素差 off2-vs-on  （刀面）    :', JSON.stringify(diff(sOff2, sOn)));

await import('node:fs').then((fs) => {
  fs.mkdirSync('/tmp/eol-verify', { recursive: true });
  fs.writeFileSync('/tmp/eol-verify/ab3-off1.png', sOff1);
  fs.writeFileSync('/tmp/eol-verify/ab3-off2.png', sOff2);
  fs.writeFileSync('/tmp/eol-verify/ab3-on.png', sOn);
});
await page.evaluate(() => { window.__swGame.paused = false; });
await page.browser().close();
