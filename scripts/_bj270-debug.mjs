// ★BJ270 C 节漂移定位:同 flag 确定性自检 vs 跨 flag 对拍;格 md5 vs 帧 md5 分流
import { createHash } from 'node:crypto';
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const page = await openPage(browser, { errors: L.fails });
const boot = await bootstrap(page, process.env.SW_ORIGIN || 'http://localhost:5202');
L.chk('bootstrap', boot.ok, boot.why ?? '');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('createGame', gen.ok, gen.why ?? '');

await page.evaluate(() => {
  const g = window.__swGame;
  window.__T0 = 8_640_000_000;
  performance.now = () => window.__T0;
  Date.now = () => window.__T0;
  window.__rngReset = () => {
    let s = 0xb270 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  window.__rngReset();
  const w = g.world.weather;
  if (w) { try { w.maxRaining = 0; w.raining = false; w.windSpeedCurrent = 0; } catch { } }
  for (const k of ['critters', 'props', 'enemies', 'drops', 'projectiles']) {
    const b = g.entities?.[k];
    if (Array.isArray(b)) b.length = 0;
  }
  import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; });
  {
    const sky = g.renderer.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
      return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
    };
  }
  import('/src/render/WaterWaves.ts').then((m) => {
    const ww = m.waterWaves;
    window.__ww = ww;
    window.__waveSnapTake = () => ({
      R: ww.readGridR().slice(0), G: ww.readGridG().slice(0),
      R2: (ww._R2 ? ww._R2.slice(0) : ww.readGridR().slice(0)),
      G2: (ww._G2 ? ww._G2.slice(0) : ww.readGridG().slice(0)),
      progress: ww.progress, sx: ww._scrollX, sy: ww._scrollY, st: ww._stepsLast,
    });
    window.__waveSnapPut = (sn) => {
      ww._R = sn.R.slice(0); ww._G = sn.G.slice(0);
      ww._R2 = sn.R2.slice(0); ww._G2 = sn.G2.slice(0);
      ww.progress = sn.progress; ww._scrollX = sn.sx; ww._scrollY = sn.sy; ww._stepsLast = sn.st;
    };
  });
  const oc = document.createElement('canvas');
  const octx = oc.getContext('2d', { willReadFrequently: true });
  window.__snapB64 = () => {
    const c = g.renderer.canvas;
    if (oc.width !== c.width || oc.height !== c.height) { oc.width = c.width; oc.height = c.height; }
    octx.clearRect(0, 0, oc.width, oc.height);
    octx.drawImage(c, 0, 0);
    const d = octx.getImageData(0, 0, oc.width, oc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return btoa(bin);
  };
});

const water = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const gl = g.world.groundLevel;
  const x = Math.min(st.w - 60, Math.floor(g.player.cx / 16) + 60);
  return { wx: x * 16, wy: (gl - 4) * 16 };
});
await teleport(page, water.wx, water.wy);
await pump(page, 30, { clearEnemies: true });

await page.evaluate(() => {
  const g = window.__swGame;
  window.__seqSnap = window.__waveSnapTake();
  window.__seqX0 = g.player.x;
});

const runSeq = async () => page.evaluate(() => {
  const g = window.__swGame;
  const ww = window.__ww;
  g.running = false;                                  // ★bj78 同款:停环——rAF 实时帧
  //  在手动渲染间穿插=跨 run 状态搅动(尘埃池/液体动画等),必须先停
  const seq = [];
  // 单帧模式(bj78 权威式):每个 Δ 位都从同一快照回放起点出发,渲染一次,
  // 消灭连帧状态累积(尘埃池游标类噪声)
  for (const dpx of [0, 1, 2, 3, 4, 5, 8, 12, 16, 20]) {
    window.__waveSnapPut(window.__seqSnap);
    window.__rngReset();
    const p = g.player;
    p.x = window.__seqX0 + dpx;
    const cx = p.x + 12, cy = p.y + 20;
    ww.injectWash(cx, cy, 48, 64, 0.55, 0.5, 0.5);
    if (dpx % 3 === 0) {
      ww.queueRipple && ww.queueRipple(cx + dpx, cy - 40, 1);
      ww.queueRippleSized && ww.queueRippleSized(cx - 20 - dpx, cy - 40, 28, 28, 1);
    }
    g.renderer.animTick = 4242;
    g.render();
    const gridR = ww.readGridR();
    let gh = 0; const CH = 0x8000;
    const u8 = new Uint8Array(gridR.buffer, gridR.byteOffset, gridR.byteLength);
    for (let i = 0; i < u8.length; i += CH) gh = (gh * 31 + i) | 0, gh = (gh ^ (u8[i] + gh)) | 0;
    const gridG = ww.readGridG();
    let gh2 = 0;
    const u8g = new Uint8Array(gridG.buffer, gridG.byteOffset, gridG.byteLength);
    for (let i = 0; i < u8g.length; i += CH) gh2 = (gh2 * 31 + i) | 0, gh2 = (gh2 ^ (u8g[i] + gh2)) | 0;
    seq.push({ dpx, frame: window.__snapB64(), gridR: gh, gridG: gh2 });
  }
  return seq;
});

// ① 同 flag 确定性自检(ON 两次)
const a1 = await runSeq();
const a2 = await runSeq();
let selfDiff = 0;
for (let i = 0; i < a1.length; i++) if (md5(a1[i].frame) !== md5(a2[i].frame)) selfDiff++;
console.log('[dbg-1] 同 flag(ON)两次自检帧 diff =', selfDiff, '/', a1.length);
let selfGrid = 0;
for (let i = 0; i < a1.length; i++) if (a1[i].gridR !== a2[i].gridR || a1[i].gridG !== a2[i].gridG) selfGrid++;
console.log('[dbg-2] 同 flag(ON)两次自检格 diff =', selfGrid, '/', a1.length);

// ③ 跨 flag:ON vs OFF,帧 md5 与格 hash 分流
const bOn = await runSeq();
await page.evaluate(() => window.__swPerfFlags.set(false));
const bOff = await runSeq();
await page.evaluate(() => window.__swPerfFlags.set(true));
let frameDiff = 0, gridDiff2 = 0, firstDiff = -1;
for (let i = 0; i < bOn.length; i++) {
  if (md5(bOn[i].frame) !== md5(bOff[i].frame)) { frameDiff++; if (firstDiff < 0) firstDiff = bOn[i].dpx; }
  if (bOn[i].gridR !== bOff[i].gridR || bOn[i].gridG !== bOff[i].gridG) gridDiff2++;
}
console.log('[dbg-3] 跨 flag(ON/OFF)帧 diff =', frameDiff, '/', bOn.length, ' 首差 dpx =', firstDiff);
console.log('[dbg-4] 跨 flag 波场格 hash diff =', gridDiff2, '/', bOn.length);

await browser.close();
L.chk('dbg 自检', selfDiff === 0 && frameDiff === 0 && gridDiff2 === 0,
  `selfDiff=${selfDiff} selfGrid=${selfGrid} frameDiff=${frameDiff} gridDiff2=${gridDiff2}`);
process.exit(L.ok ? 0 : 3);
