// ★30fps 刀1 定谳仪：texFromRegion er: 键运行时普查（键归一前/后同仪对拍）
//   ①er: 键总量/命中/miss/唯一键数 ②小数坐标键占比+唯一数+调用源栈捕获
//   ③miss 带宽账（scratch drawImage+texImage2D 路径耗时）④帧距（g.frame ms）
// 场景：S0 静立基线 / S1 光女战+快速移动 / S2 高空下坠 / S3 水面驻留
// run: SW_ORIGIN=http://localhost:5213 SCEN=all node tools/run-diag.mjs --timeout=280000 scripts/_erkey-census.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep, teleport, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const SCEN = process.env.SCEN || 'all';   // all | S0 | S1 | S2 | S3
const TAG = process.env.TAG || 'run';

const page = await openPage(await launchBrowser({ headless: true }), {});
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolcensus', size: 'small', pinRandom: 20261003, log: () => {} });
console.log('createGame:', made?.ok, made?.why || '');
if (!made?.ok) process.exit(1);
await sleep(2000);

// —— 页内装表：GLSpriteLayer.prototype.texFromRegion 包裹（live 实例取原型）——
const installed = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g?.renderer;
  const glw = r?._accGlw ?? r?.glfx ?? r?.bglEntShim?.glw ?? null;
  if (!glw) return { ok: false, why: 'no-glw' };
  const proto = Object.getPrototypeOf(glw);
  if (globalThis.__erInst) return { ok: true, already: true };
  const orig = proto.texFromRegion;
  const S = globalThis.__erS = {
    calls: 0, hit: 0, miss: 0, missMs: 0,
    keys: new Set(), decCalls: 0, decKeys: new Set(),
    perImgDec: new Map(), missByKey: new Map(), missByImg: new Map(), stacks: [],
    upBytes: 0, evictions: 0, layerBytes: 0, decNormKeys: new Set(), big512: [],
  };
  globalThis.__erInst = true;
  // LRU 压力账（evictLRU 逐出计数 + 层驻留字节采样）
  if (!proto.__evictWrapped) {
    proto.__evictWrapped = true;
    const origEvict = proto.evictLRU;
    proto.evictLRU = function (...a) {
      const S2 = globalThis.__erS;
      if (S2) { S2.evictions++; S2.layerBytes = this.bytes; }
      return origEvict.apply(this, a);
    };
  }
  proto.texFromRegion = function (key, img, sx, sy, sw, sh) {
    S.calls++;
    // 镜像实现侧归一（2026-10-05 刀1 后层键=归一键;前置量账按层键口径,
    //   整数调用键不变=与刀前口径逐位可比）
    const _isx = Math.floor(sx), _isy = Math.floor(sy);
    const _rsw = Math.max(1, Math.ceil(sx + sw) - _isx), _rsh = Math.max(1, Math.ceil(sy + sh) - _isy);
    let kkey = key;
    const isFrac = !(Number.isInteger(sx) && Number.isInteger(sy) && Number.isInteger(sw) && Number.isInteger(sh));
    if (isFrac && key.startsWith('er:')) {
      const ci = key.lastIndexOf(':');
      kkey = key.slice(0, ci + 1) + _isx + ',' + _isy + ',' + _rsw + ',' + _rsh;
    }
    const wasHit = this.texs ? this.texs.has(kkey) : true;
    const t0 = performance.now();
    const r = orig.call(this, key, img, sx, sy, sw, sh);
    const dt = performance.now() - t0;
    if (wasHit) { S.hit++; return r; }
    S.miss++; S.missMs += dt;
    if (r) S.upBytes += (r.w * r.h * 4) | 0;
    S.keys.add(kkey);
    S.missByKey.set(kkey, (S.missByKey.get(kkey) || 0) + 1);
    // img 维度账（识别小画布产源——如 34 宽带画布）
    try {
      const iw = img?.width ?? -1, ih = img?.height ?? -1;
      const dk = key.startsWith('er:') ? 'er' : key.split(':')[0];
      const ik = `${dk}|${iw}x${ih}`;
      S.missByImg.set(ik, (S.missByImg.get(ik) || 0) + 1);
      if (iw === 512 && ih === 512 && S.big512.length < 6) {
        S.big512.push({ key, args: [sx, sy, sw, sh], epoch: key.split(':')[2],
          isCv: typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement });
      }
    } catch {}
    if (isFrac) {
      S.decCalls++;
      S.decKeys.add(key);
      S.decNormKeys.add(kkey);
      const idSeg = key.split(':').slice(0, -1).join(':');
      S.perImgDec.set(idSeg, (S.perImgDec.get(idSeg) || 0) + 1);
      if (S.stacks.length < 8) {
        const st = String(new Error().stack || '');
        S.stacks.push({
          key, args: [sx, sy, sw, sh],
          frames: st.split('\n').slice(2, 12).map((l) => l.trim().slice(0, 150)),
        });
      }
    }
    return r;
  };
  return { ok: true };
});
if (!installed.ok) { console.error('install fail:', installed); process.exit(1); }
console.log('er: 仪装表完成');

// 逐帧账（g.frame 包裹）
await page.evaluate(() => {
  const g = window.__swGame;
  if (!g.__origFrameEr) {
    g.__origFrameEr = g.frame;
    g.__frameMs = [];
    g.frame = function (...a) {
      const t0 = performance.now();
      const r = g.__origFrameEr.apply(this, a);
      g.__frameMs.push(performance.now() - t0);
      if (g.__frameMs.length > 6000) g.__frameMs.shift();
      return r;
    };
  }
  g.__frameMs.length = 0;
});

const resetAndMark = () => page.evaluate(() => {
  const S = globalThis.__erS;
  S.calls = 0; S.hit = 0; S.miss = 0; S.missMs = 0; S.upBytes = 0;
  S.evictions = 0; S.layerBytes = 0;
  S.decCalls = 0; S.stacks.length = 0; S.big512.length = 0;
  S.keys = new Set(); S.decKeys = new Set(); S.decNormKeys = new Set(); S.perImgDec = new Map(); S.missByKey = new Map(); S.missByImg = new Map();
  window.__swGame.__frameMs.length = 0;
});
const dump = (tag) => page.evaluate((tag) => {
  const S = globalThis.__erS;
  const fm = [...window.__swGame.__frameMs].sort((a, b) => a - b);
  const q = (p) => fm.length ? +fm[Math.min(fm.length - 1, Math.floor(fm.length * p))].toFixed(2) : 0;
  const mean = fm.length ? +(fm.reduce((a, b) => a + b, 0) / fm.length).toFixed(2) : 0;
  const top = [...S.missByKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => [k, n]);
  return {
    tag,
    calls: S.calls, hit: S.hit, miss: S.miss,
    uniqueKeys: S.keys.size,
    decCalls: S.decCalls, decUnique: S.decKeys.size, decNormUnique: S.decNormKeys.size,
    decShareCalls: S.calls ? +(S.decCalls / S.calls * 100).toFixed(2) : 0,
    decShareMiss: S.miss ? +(S.decCalls / S.miss * 100).toFixed(2) : 0,
    missMs: +S.missMs.toFixed(1), upKB: +(S.upBytes / 1024).toFixed(1),
    evictions: S.evictions, layerMB: +(S.layerBytes / 1048576).toFixed(1),
    perImgDec: [...S.perImgDec.entries()].slice(0, 10),
    big512: S.big512,
    missByImg: [...S.missByImg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    topMissKeys: top,
    frameMs: { n: fm.length, mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: fm[fm.length - 1] ?? 0 },
    stacks: S.stacks,
  };
}, tag);

const results = {};

// ---- S0 静立基线 ----
if (SCEN === 'all' || SCEN === 'S0') {
  await resetAndMark();
  await sleep(8000);
  results.S0 = await dump('S0-idle');
  console.log('S0 done');
}

// ---- S1 光女战 + 快速移动 ----
if (SCEN === 'all' || SCEN === 'S1') {
  const sp = await page.evaluate(async () => {
    const g = window.__swGame;
    const e = await window.__swFlow.spawnVanillaEnemy(636, g.player.cx, g.player.cy - 400);
    return { ok: !!e };
  });
  console.log('spawn 636:', JSON.stringify(sp));
  await sleep(2500);
  await resetAndMark();
  await page.keyboard.down('KeyD');
  await sleep(5000);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyA');
  await sleep(5000);
  await page.keyboard.up('KeyA');
  // 战斗余韵 2s（站定）
  await sleep(2000);
  results.S1 = await dump('S1-eol-move');
  console.log('S1 done');
}

// ---- S2 高空下坠 ----
if (SCEN === 'all' || SCEN === 'S2') {
  await godMode(page, true);
  const p0 = await page.evaluate(() => ({ x: window.__swGame.player.cx, y: window.__swGame.player.cy }));
  await teleport(page, p0.x, p0.y - 900, { snapCamera: false, zeroVel: true });
  await resetAndMark();
  await sleep(10000);
  results.S2 = await dump('S2-fall');
  await godMode(page, false);
  console.log('S2 done');
}

// ---- S3 水面驻留（找一片水）----
if (SCEN === 'all' || SCEN === 'S3') {
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    const w = g.world;
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
    for (let r = 8; r < 220; r += 4) {
      for (let a = 0; a < 32; a++) {
        const x = px + Math.round(Math.cos(a / 32 * Math.PI * 2) * r);
        const y = py + Math.round(Math.sin(a / 32 * Math.PI * 2) * r);
        if (w.liquidAt(x * 16 + 8, y * 16 + 8) > 0 && w.liquidAt(x * 16 + 8, (y - 1) * 16 + 8) === 0) {
          return { x: x * 16 + 8, y: (y - 6) * 16 };
        }
      }
    }
    return null;
  });
  console.log('water spot:', JSON.stringify(spot));
  if (spot) {
    await teleport(page, spot.x, spot.y, { snapCamera: true, zeroVel: true });
    await sleep(1200);
    await resetAndMark();
    await sleep(8000);
    results.S3 = await dump('S3-water');
  }
  console.log('S3 done');
}

console.log('\n===== 结果 =====');
console.log(JSON.stringify(results, null, 1));
await page.browser().close();
