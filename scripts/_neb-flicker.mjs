// 星璇柱区背景山闪烁·逐帧签名采样探针(2026-10-02 立案二分)
// 采样:三画布(sky2D/glCanvas/HUD)天带+山带条带指纹 × 帧类/路径/门状态 × DOM 态
//      —— 判别「内容缺失」vs「内容在但画布被藏」
// 判例遵守:条带逐像素统计(无缩放稀释)/轻采样防读回自愈(100ms 间隔)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.SW_FLAGS || '';
const RUN_S = +(process.env.NEB_DUR || 100);
const OUTDIR = process.env.NEB_OUT || 'shots/c10e-trail';

const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
await bootstrap(page, ORIGIN + '/' + (FLAGS ? '?' + FLAGS + '&' : ''));
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.85);   // 夜
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = g.world.spawnX * 16 + 400;
  g.player.y = ((g.world.store.surfaceY ?? 300) - 6) * 16;
  g.player.vy = 0;
  void g.__swFlow;
});
const sp = await page.evaluate(() => {
  const g = window.__swGame;
  const px = g.player.x, py = g.player.y;
  g.player.debugGod = true;
  g.player.statLife = g.player.statLifeMax2;
  const r = window.__swFlow.spawnVanillaEnemy(507, px + 300, py - 100);
  for (const vid of [420, 421, 423]) window.__swFlow.spawnVanillaEnemy(vid, px + 150, py - 60);
  return r;
});
console.log('spawn 507:', JSON.stringify(sp));
await page.evaluate(() => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const iid = flow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
});
await page.mouse.move(900, 300);
await page.mouse.down();
await page.keyboard.down('KeyW');

// 页内采样器(100ms;读上一完成帧的渲染器状态面+三画布条带指纹)
await page.evaluate(() => {
  const g = window.__swGame;
  window.__s = [];
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  const band = (c, y0f, rows) => {
    try {
      if (!c || !c.width || !c.height) return null;
      const w = c.width;
      const y0 = Math.max(0, Math.min(c.height - rows, Math.round(c.height * y0f)));
      if (scratch.width !== w || scratch.height !== rows) { scratch.width = w; scratch.height = rows; }
      sctx.clearRect(0, 0, w, rows);
      sctx.drawImage(c, 0, y0, w, rows, 0, 0, w, rows);
      const px = sctx.getImageData(0, 0, w, rows).data;
      let sum = 0, lit24 = 0, lit48 = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const v = (px[i] + px[i + 1] + px[i + 2]) / 3;
        sum += v; n++;
        if (v > 24) lit24++;
        if (v > 48) lit48++;
      }
      return [Math.round(sum / n), lit24, lit48];
    } catch { return null; }
  };
  const glEl = () => document.getElementById('sw-c10e-glcanvas');
  window.__rec = () => {
    const r = g.renderer;
    const sky = r.skyCanvas, gl = glEl(), hud = r.canvas;
    const vis = (c) => { try { return c && c.isConnected && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 4; } catch { return '?'; } };
    const rect = (c) => { try { const b = c.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); } catch { return '?'; } };
    const S = {};
    for (const [k, c] of [['sky', sky], ['gl', gl], ['hud', hud]]) {
      if (!c) { S[k] = null; continue; }
      S[k] = {
        on: vis(c), rect: rect(c), cw: c.width, ch: c.height,
        m: band(c, 0.42, 12),   // 山带 [mean,lit24,lit48]
        t: band(c, 0.08, 12),   // 天带
      };
    }
    let stack = '-', pipeState = '-';
    try { stack = r.swPipe ? r.swPipe.screenStack.map((f) => f.name).join('|') : '-'; } catch { /* - */ }
    try {
      const p = r.swPipe;
      pipeState = p ? (p.unavailable ? 'unavail' : 'alive') + (p.diedAt ? '@die' + Math.round(performance.now() - p.diedAt) : '') : 'null';
    } catch { /* - */ }
    let shield = '-';
    try {
      shield = [...(g.entities?.enemies ?? [])].filter((e) => e.vanillaId === 507).map((e) => 'b' + (e.breakT ?? '?')).join(';') || 'gone';
    } catch { /* - */ }
    window.__s.push({
      ts: Math.round(performance.now() / 100) / 10,
      pl: g.player.dead ? 'dead' : (g.player.gravDir === -1 ? 'flip' : 'ok'),
      f: !!r._c10eFrame, ih: !!r._c10eWorldToHud, cp: !!r._c10eComposited, fp: !!r._c10eFilterPending,
      merge: r.cloudMergeUsed, sfx: r.sfxPathUsed, op: !!r.opresentUsed, shown: !!r._glCanvasShown,
      lowK: r._worldLowK, pipe: pipeState, stack, shield,
      S,
    });
    if (window.__s.length > 4000) window.__s.shift();
  };
  setInterval(window.__rec, 100);
});

// 主循环:周期拉样本,检出「可见性态」翻转即截图
const t0 = Date.now();
let lastVis = '';
let shots = 0;
const poll = setInterval(async () => {
  const s = await page.evaluate(() => window.__s ? window.__s.slice(-2) : []);
  if (!s.length) return;
  const cur = s[s.length - 1];
  // 可见性态=在【可见画布】上山带/天带是否亮(gl 隐藏时 hud/sky 的山带才算数)
  const mVis = (x) => {
    let best = 0, where = '-';
    for (const k of ['sky', 'gl', 'hud']) {
      if (!x.S[k]?.on) continue;
      const m = x.S[k]?.m;
      if (m && m[2] > best) { best = m[2]; where = k; }
    }
    return (best > 40 ? 'M' : 'm') + where + best;
  };
  const skyVis = (x) => ((x.S.sky?.on ? (x.S.sky.t?.[1] ?? 0) : 0) > 40 ? 'S' : 's');
  const sig = mVis(cur) + '|' + skyVis(cur) + '|gl' + (cur.S.gl?.on ? 'on' : 'OFF');
  if (sig !== lastVis) {
    console.log(`[flip t=${((Date.now() - t0) / 1000).toFixed(0)}s] ${sig}  (f=${cur.f} ih=${cur.ih} cp=${cur.cp} fp=${cur.fp} merge=${cur.merge} sfx=${cur.sfx} op=${cur.op} shown=${cur.shown} pipe=${cur.pipe} lowK=${cur.lowK} stack=${cur.stack})`);
    lastVis = sig;
    if (shots < 48) {
      shots++;
      await page.screenshot({ path: `${OUTDIR}/nf-${String(Math.round((Date.now() - t0) / 1000)).padStart(3, '0')}s-${sig.replace(/[^A-Za-z0-9]/g, '_')}.png` }).catch(() => {});
    }
  }
}, 500);

// 横移扫荡(同 nebula-repro)
for (let i = 0; i * 5 < RUN_S; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  await page.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
  await new Promise((r) => setTimeout(r, 1200));
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
}
await page.keyboard.up('KeyW');
await page.mouse.up();
clearInterval(poll);
const s = await page.evaluate(() => window.__s);
// 汇总:各帧签名占比
const fs = {};
for (const x of s) {
  const k = `f${x.f ? 1 : 0}ih${x.ih ? 1 : 0}cp${x.cp ? 1 : 0}fp${x.fp ? 1 : 0}|${x.merge}|${x.sfx}|gl${x.S.gl?.on ? 1 : 0}shown${x.shown ? 1 : 0}|lowK${x.lowK}`;
  fs[k] = (fs[k] || 0) + 1;
}
console.log('=== 帧签名分布 ===');
for (const [k, v] of Object.entries(fs).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
// glCanvas 山带亮暗序列
let mOn = 0, mOff = 0, seq = '', prevCh = '';
for (const x of s) {
  const glM = x.S.gl?.on ? (x.S.gl.m?.[2] ?? 0) : -1;
  const ch = glM > 40 ? 'M' : (glM >= 0 ? 'm' : '?');
  if (ch !== prevCh) { seq += ch; prevCh = ch; }
  if (ch === 'M') mOn++; else if (ch === 'm') mOff++;
}
console.log(`=== glCanvas 山带: M(亮)=${mOn} m(暗)=${mOff} 迁移序列=${seq.slice(0, 80)}`);
// gl 隐藏帧的 hud/sky 山带
let hidHudM = 0, hidSkyM = 0, hidN = 0;
for (const x of s) {
  if (x.S.gl?.on) continue;
  hidN++;
  if ((x.S.hud?.m?.[2] ?? 0) > 40) hidHudM++;
  if ((x.S.sky?.m?.[2] ?? 0) > 40) hidSkyM++;
}
console.log(`=== gl 隐藏帧 n=${hidN}: 山带亮 hud=${hidHudM} sky=${hidSkyM}`);
console.log('errs:', errs.slice(0, 6));
process.exit(0);
