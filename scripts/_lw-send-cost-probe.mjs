// ★C9d2-transferable 探针:send 位 postMessage 主线程自耗分形计量（BEFORE/AFTER 同脚本）。
// 计量面:link.send 自耗 / worker.postMessage 自耗（按 enc 形态分桶:full=结构克隆本体,
// delta=transferable 信封）/ encodeDelta 自耗 / 池账（poolHits/poolMisses）/ fmt 计数。
// 场景:静置（锚帧周期）/小步移动（暴露带）/写面（日志格）/远跳风暴（content-dirty
// 门强制=最重全量帧形态）/下坠（区域跳行重算最重）/位级光哈希（pinRandom+freezeClock
// 确定性脚本,BEFORE/AFTER 对拍面;先自跑两遍验证夹具确定性）。
// run: SW_ORIGIN=http://localhost:5215 node tools/run-diag.mjs scripts/_lw-send-cost-probe.mjs [--tag=before|after] [--hashonly=1]
import { launchBrowser, openPage, bootstrap, createGame, nextFrame, freezeClock } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5215';
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=before').slice(6);
const HASHONLY = process.argv.includes('--hashonly=1');
const browser = await launchBrowser({});

const med = (a) => a.length ? +a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(4) : 0;
const p95 = (a) => a.length ? +a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))].toFixed(4) : 0;

async function installInstrument(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const lw = g.lighting && g.lighting._lw;
    if (!lw || !lw.worker) return { ok: false, why: 'no-link-or-worker' };
    window.__lwLog = [];
    // 载荷位级 FNV（transfer 前读=活数组;clone/transfer 两态字节必须全等）
    const __fnv = (u8) => { let h = 0x811c9dc5 | 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const KEYS = ['type', 'flags', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'];
    const hashPayload = (msg) => {
      let h = 0x811c9dc5 | 0;
      h = (Math.imul(h, 0x01000193) ^ msg.seq) | 0;
      if (msg.enc === 'delta') {
        h = (Math.imul(h, 0x01000193) ^ __fnv(new Uint8Array(msg.delta.meta.buffer))) | 0;
        h = (Math.imul(h, 0x01000193) ^ __fnv(msg.delta.data)) | 0;
        return (h >>> 0).toString(16);
      }
      for (const k of KEYS) { const a = msg.tiles[k]; if (a && a.byteLength) h = (Math.imul(h, 0x01000193) ^ __fnv(a)) | 0; }
      return (h >>> 0).toString(16);
    };
    const origPm = lw.worker.postMessage.bind(lw.worker);
    lw.worker.postMessage = function (msg, transfer) {
      const ph = msg && msg.op === 'frame' ? hashPayload(msg) : null;   // 计时窗外
      const t0 = performance.now();
      const r = origPm(msg, transfer);
      const dt = performance.now() - t0;
      if (msg && msg.op === 'frame') {
        window.__lwLog.push({ k: 'pm', enc: msg.enc ?? 'legacy', dt,
          tilesLen: msg.tiles ? msg.tiles.type.length : -1,
          metaB: msg.delta ? msg.delta.meta.byteLength : 0, dataB: msg.delta ? msg.delta.data.byteLength : 0, ph });
      } else if (msg && msg.op === 'pool') {
        window.__lwLog.push({ k: 'poolIn', dt });
      }
      return r;
    };
    const origSend = lw.send.bind(lw);
    lw.send = function (m) {
      const t0 = performance.now();
      origSend(m);
      window.__lwLog.push({ k: 'send', dt: performance.now() - t0 });
    };
    if (lw._enc) {
      const origEnc = lw._enc.encodeDelta.bind(lw._enc);
      lw._enc.encodeDelta = function (st, t, log) {
        const t0 = performance.now();
        const r = origEnc(st, t, log);
        window.__lwLog.push({ k: 'encDelta', dt: performance.now() - t0, spans: r.meta.length ? r.meta[0] : 0 });
        return r;
      };
    }
    return { ok: true };
  });
}

/** 光哈希（公共面 r/g/b + 区域,FNV-1a;位级对拍面） */
async function snapLightHash(page) {
  return page.evaluate(() => {
    const L = window.__swGame.lighting;
    let h = 0x811c9dc5 | 0;
    const fnv = (arr) => { for (let i = 0; i < arr.length; i++) { h ^= arr[i]; h = Math.imul(h, 0x01000193); } };
    fnv(L.r); fnv(L.g); fnv(L.b);
    h ^= L.rx; h = Math.imul(h, 0x01000193);
    h ^= L.ry; h = Math.imul(h, 0x01000193);
    h ^= L.rw; h = Math.imul(h, 0x01000193);
    h ^= L.rh; h = Math.imul(h, 0x01000193);
    return (h >>> 0).toString(16);
  });
}

const stats = (pg) => pg.evaluate(async () =>
  (await import('/src/lighting/LightWorkerLink.ts')).lightWorkerStats());

// ---- 位级光哈希臂（确定性脚本;--hashonly=1 只跑这个） ----
async function hashArm(url) {
  const page = await openPage(browser, {});
  const { installPinnedRandom } = await import('../tools/probe/lib/game.mjs');
  installPinnedRandom(page, 20260903);
  const warns = [];
  page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 140)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 精简启动（绕 bootstrap/createGame 的桥闪失敏感段）:轮询桥 → 直接 newWorld → 轮询 __swGame
  let bridged = false;
  for (let i = 0; i < 40 && !bridged; i++) {
    bridged = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
    if (!bridged) await new Promise((r) => setTimeout(r, 2000));
  }
  console.error('[probe-hash] bridge:', bridged);
  if (!bridged) { console.log(JSON.stringify({ ok: false, why: 'no-bridge' })); await page.close(); return null; }
  await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: '05162020', w: 4200, h: 1200 });
  let ingame = false;
  for (let i = 0; i < 120 && !ingame; i++) {
    ingame = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.player && g.world); }).catch(() => false);
    if (!ingame) await new Promise((r) => setTimeout(r, 1500));
  }
  console.error('[probe-hash] ingame:', ingame);
  if (!ingame) { console.log(JSON.stringify({ ok: false, why: 'no-game' })); await page.close(); return null; }
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 800);
  await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); document.getElementById('sw-welcome-announce')?.remove(); } catch { /* 隐私模式 */ } });
  await freezeClock(page, {});
  console.error('[probe-hash] frozen, warmup');
  for (let i = 0; i < 90; i++) await nextFrame(page);   // warmup→live+首锚
  console.error('[probe-hash] warmup done, script start');
  const hashes = [];
  // 脚本:30 静置 → 60 下坠（每帧 vy 置满, god 防死）→ 30 写面 → 20 远跳
  await page.evaluate(() => { const g = window.__swGame; g.player.debugGod = true; });
  const W = await page.evaluate(() => window.__swGame.world.w);
  const H = await page.evaluate(() => window.__swGame.world.h);
  const startX = Math.floor(W / 2) * 16, startY = Math.floor(H * 0.35) * 16;
  await page.evaluate(({ x, y }) => { const g = window.__swGame; g.player.x = x; g.player.y = y; g.player.vx = 0; g.player.vy = 0; const c = g.camera; c.x = g.player.cx; c.y = g.player.cy; }, { x: startX, y: startY });
  for (let i = 0; i < 20; i++) { hashes.push(await snapLightHash(page)); await nextFrame(page); }
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => { const g = window.__swGame; g.player.vy = 1200; });
    hashes.push(await snapLightHash(page));
    await nextFrame(page);
  }
  for (let i = 0; i < 20; i++) {
    await page.evaluate((k) => {
      const g = window.__swGame; const st = g.world.store;
      const px = Math.floor(g.player.x / 16) + 4, py = Math.floor(g.player.y / 16) - 2 + (k % 3);
      st.setTile(px, py, k % 2 === 0 ? 5 : 0);
    }, i);
    hashes.push(await snapLightHash(page));
    await nextFrame(page);
  }
  for (let i = 0; i < 16; i++) {
    await page.evaluate(({ x, y, k }) => {
      const g = window.__swGame;
      const nx = x + (k % 2 === 0 ? 90 : -90) * 16, ny = y + (k % 2 === 0 ? -80 : 80) * 16;
      g.player.x = Math.max(16, nx); g.player.y = Math.max(16, ny);
      g.player.vx = 0; g.player.vy = 0;
      const c = g.camera; c.x = g.player.cx; c.y = g.player.cy;
    }, { x: startX, y: startY, k: i });
    hashes.push(await snapLightHash(page));
    await nextFrame(page);
  }
  console.error('[probe-hash] script done');
  const st = await stats(page);
  await page.close();
  return { hashes, stats: { posted: st.posted, results: st.results, falls: st.falls, skipped: st.skipped, fmt: st.fmt, poolHits: st.poolHits, poolMisses: st.poolMisses } };
}

// ---- 计量臂 ----
async function costArm(url) {
  const page = await openPage(browser, {});
  const warns = [];
  page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 140)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) { console.log(JSON.stringify({ ok: false, why: 'bootstrap' })); await page.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { console.log(JSON.stringify({ ok: false, why: 'createGame' })); await page.close(); return null; }
  for (let i = 0; i < 90; i++) await nextFrame(page);   // warmup→live+首锚+worker spawn

  console.error('[probe] installing instrument');
  const inst = await installInstrument(page);
  if (!inst.ok) { console.log(JSON.stringify({ ok: false, why: inst.why })); await page.close(); return null; }
  console.error('[probe] instrument ok');

  const phases = [];
  const runPhase = async (name, frames, step) => {
    const s0 = await stats(page);
    const mark0 = await page.evaluate(() => window.__lwLog.length);
    for (let i = 0; i < frames; i++) { if (step) await step(i); await nextFrame(page); }
    const s1 = await stats(page);
    const log = await page.evaluate((m0) => window.__lwLog.slice(m0), mark0);
    const phAll = log.filter((e) => e.k === 'pm').map((e) => e.enc + ':' + e.ph);
    const pmFull = log.filter((e) => e.k === 'pm' && e.enc === 'full').map((e) => e.dt);
    const pmDelta = log.filter((e) => e.k === 'pm' && e.enc === 'delta').map((e) => e.dt);
    const pmLegacy = log.filter((e) => e.k === 'pm' && e.enc === 'legacy').map((e) => e.dt);
    const sends = log.filter((e) => e.k === 'send').map((e) => e.dt);
    const encs = log.filter((e) => e.k === 'encDelta').map((e) => e.dt);
    const encSpans = log.filter((e) => e.k === 'encDelta').map((e) => e.spans);
    const payloadFull = log.filter((e) => e.k === 'pm' && e.enc === 'full').reduce((s, e) => s + e.tilesLen * 17, 0);
    const payloadDelta = log.filter((e) => e.k === 'pm' && e.enc === 'delta').reduce((s, e) => s + e.metaB + e.dataB, 0);
    phases.push({
      name, frames,
      nSend: sends.length,
      full: pmFull.length, delta: pmDelta.length, legacy: pmLegacy.length,
      sendP50: med(sends), sendP95: p95(sends),
      pmFullP50: med(pmFull), pmFullP95: p95(pmFull), pmFullSum: +pmFull.reduce((s, v) => s + v, 0).toFixed(2),
      pmDeltaP50: med(pmDelta), pmDeltaP95: p95(pmDelta), pmDeltaSum: +pmDelta.reduce((s, v) => s + v, 0).toFixed(2),
      pmLegacyP50: med(pmLegacy),
      encP50: med(encs), encP95: p95(encs), encSum: +encs.reduce((s, v) => s + v, 0).toFixed(2),
      encSpanP50: med(encSpans),
      poolHits: s1.poolHits - s0.poolHits, poolMisses: s1.poolMisses - s0.poolMisses,
      tileBytes: s1.tileBytes - s0.tileBytes,
      payloadFullKB: +(payloadFull / 1024).toFixed(1), payloadDeltaKB: +(payloadDelta / 1024).toFixed(1),
      phAll,
    });
  };

  console.error('[probe] phase idle240 start');
  await runPhase('idle240', 240, null);
  console.error('[probe] phase move240 start');
  await runPhase('move240', 240, async (i) => {
    await page.evaluate((k) => { const g = window.__swGame; g.player.x += (k % 2 === 0 ? 2 : -2) * 16; }, i);
  });
  console.error('[probe] phase write120 start');
  await runPhase('write120', 120, async (i) => {
    await page.evaluate((k) => {
      const g = window.__swGame; const st = g.world.store;
      const px = Math.floor(g.player.x / 16) + 4, py = Math.floor(g.player.y / 16) - 2 + (k % 3);
      st.setTile(px, py, k % 2 === 0 ? 5 : 0);
    }, i);
  });
  console.error('[probe] phase fall240 start');
  await runPhase('fall240', 240, async () => {
    await page.evaluate(() => { const g = window.__swGame; g.player.debugGod = true; g.player.vy = 1200; });
  });
  console.error('[probe] phase jumpstorm60 start');
  await runPhase('jumpstorm60', 60, async (i) => {
    await page.evaluate((k) => {
      const g = window.__swGame;
      const bx = Math.floor(g.world.w / 2) * 16, by = Math.floor(g.world.h * 0.35) * 16;
      g.player.x = bx + (k % 2 === 0 ? 90 : -90) * 16;
      g.player.y = by + (k % 2 === 0 ? -80 : 80) * 16;
      g.player.vx = 0; g.player.vy = 0;
      const c = g.camera; c.x = g.player.cx; c.y = g.player.cy;
    }, i);
  });
  const st = await stats(page);
  await page.close();
  return { phases, stats: { posted: st.posted, results: st.results, falls: st.falls, skipped: st.skipped, fmt: st.fmt, poolHits: st.poolHits, poolMisses: st.poolMisses, tileBytes: st.tileBytes, resyncs: st.resyncs }, warns: warns.slice(0, 5) };
}

if (HASHONLY) {
  let a = null, b = null;
  for (let t = 0; t < 3 && !a; t++) { console.error(`[probe] hashArm A attempt ${t + 1}`); a = await hashArm(`${ORIGIN}/?pbust=${Date.now()}`); }
  for (let t = 0; t < 3 && !b; t++) { console.error(`[probe] hashArm B attempt ${t + 1}`); b = await hashArm(`${ORIGIN}/?pbust=${Date.now() + 1}`); }
  const same = a && b && JSON.stringify(a.hashes) === JSON.stringify(b.hashes);
  console.log(`[lw-hash ${TAG}]`, JSON.stringify({
    deterministic: same,
    hashesA: a ? a.hashes : null,
    hashesB: b ? b.hashes : null,
    n: a ? a.hashes.length : 0,
    statsA: a?.stats, statsB: b?.stats,
  }));
  process.exit(0);
}

let before = null;
for (let a = 0; a < 3 && !before; a++) {
  console.error(`[probe] costArm attempt ${a + 1}`);
  before = await costArm(`${ORIGIN}/?pbust=${Date.now()}`);
  if (!before) console.error('[probe] costArm failed, retrying');
}
console.log(`[lw-cost ${TAG}]`, JSON.stringify(before, null, 1));
process.exit(before && before.phases.every((p) => p.nSend > 0) ? 0 : 1);
