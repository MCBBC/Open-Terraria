// BJ82 调研探针 ②·worldCanvas 逐帧差分+脏块归因(只读,零 src 触碰)
// 目标:四场景(静立地表/走动地表/静立水边/走动水边)+挖掘微场景下,
//      worldCanvas 相邻帧的内容变化区域分布与 chunk(200×200px 口径)脏占比,
//      并按 类别=实体/地形编辑/水体/其他环境动画 归因——
//      回答「地形变更脏块 vs 实体移动脏块能否分离」。
// 口径:1280×800@zoom1,DPR=1(headless);chunk 尺寸 128/200/256 三档同步统计。
// ★纪律:GPU 页不挂 trace;生产源码零改动;getImageData 诊断负载会压帧率→
//      每帧世界推进略多→脏占比方向偏保守(低估可省带宽),可接受并如实记录 fps。
// 运行:SW_ORIGIN=http://localhost:5213 node tools/probe.mjs run scripts/_bj82-dirty-census.mjs --seed=05162020 --size=small
import { launchBrowser, openPage, bootstrap, createGame, teleport, ledger, front, sleep } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  // ---- 安装采样器(页内常驻;rAF 驱动,采样对象=上一完成帧的 worldCanvas)----
  await page.evaluate(function bj82DirtyInstall() {
    const g = window.__swGame, r = g.renderer;
    const S = window.__bj82 = {
      on: false, recs: [], edits: new Map(),   // idx → 剩余帧数(chunk 重烘滞后 1-3 帧,老化窗 6)
      prev: null, prevW: 0, prevH: 0, prevCam: null,
      waterRuns: [],          // tile 域矩形 [x0,y0,x1,y1](arm 时预扫描)
      CH: [128, 200, 256],
      err: '',
    };
    // 地形编辑追踪:探针自订 onTileChanged(与生产订阅并存,只写本地 Map)
    g.world.store.onTileChanged((x, y) => { if (S.on) S.edits.set(y * g.world.store.w + x, 6); });

    S.sample = function () {
      if (!S.on) return;
      try {
        const wc = r.worldCanvas, wctx = r.worldCtxLayer;
        if (!wc || !wctx) return;
        const W = wc.width, H = wc.height;
        if (!W || !H) return;
        const cam = g.camera, z = cam.zoom;
        const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
        // 相机设备位移——worldCanvas 是屏空间画布,非零位移=内容整体平移
        let dRX = 0, dRY = 0;
        if (S.prevCam) { dRX = camRX - S.prevCam[0]; dRY = camRY - S.prevCam[1]; }
        S.prevCam = [camRX, camRY];

        const got = wctx.getImageData(0, 0, W, H);
        const u32 = new Uint32Array(got.data.buffer);
        const rec = { dRX, dRY, W, H, changed: 0, ent: 0, ter: 0, wat: 0, oth: 0, still: 0 };
        const CH = S.CH;
        const acc = CH.map((cs) => {
          const nx = Math.ceil(W / cs), ny = Math.ceil(H / cs);
          return { cs, nx, ny, a: new Uint8Array(nx * ny) };
        });
        let diffRan = false;
        if (S.prev && S.prevW === W && S.prevH === H) {
          diffRan = true;
          const prev = S.prev;
          const still = dRX === 0 && dRY === 0;
          rec.still = still ? 1 : 0;
          let entR = null, terR = null, watR = null;
          if (still) {
            const zz = z * (r._worldLowK || 1);
            const ox = Math.round(W / 2), oy = Math.round(H / 2);
            const d2x = (wx) => ox + Math.round((wx - camRX) * zz);
            const d2y = (wy) => oy + Math.round((wy - camRY) * zz);
            entR = [];
            const pushE = (x, y, w0, h0, pad) => {
              const x0 = Math.max(0, d2x(x - pad)), y0 = Math.max(0, d2y(y - pad));
              const x1 = Math.min(W, d2x(x + w0 + pad)), y1 = Math.min(H, d2y(y + h0 + pad));
              if (x1 > x0 && y1 > y0) entR.push([x0, y0, x1, y1]);
            };
            try {
              const p = g.player;
              pushE(p.x, p.y, p.w, p.h, 14);
              const ents = g.entities;
              for (const b of ['enemies', 'npcs', 'drops', 'projectiles', 'props', 'critters']) {
                const arr = ents?.[b];
                if (!arr) continue;
                for (const e of arr) { if (!e?.dead && typeof e.x === 'number') pushE(e.x, e.y, e.w ?? 16, e.h ?? 16, 10); }
              }
              for (const rp of r.remotePlayers ?? []) { if (!rp.dead) pushE(rp.x, rp.y, rp.w ?? 20, rp.h ?? 40, 14); }
            } catch (e) { rec.entErr = String(e).slice(0, 60); }
            if (S.edits.size) {
              terR = [];
              const st = g.world.store;
              for (const [idx, life] of S.edits) {
                const tx = idx % st.w, ty = (idx / st.w) | 0;
                const x0 = Math.max(0, d2x(tx * 16) - 1), y0 = Math.max(0, d2y(ty * 16) - 1);
                const x1 = Math.min(W, d2x(tx * 16 + 16) + 1), y1 = Math.min(H, d2y(ty * 16 + 16) + 1);
                if (x1 > x0 && y1 > y0) terR.push([x0, y0, x1, y1]);
                if (life <= 1) S.edits.delete(idx); else S.edits.set(idx, life - 1);
              }
            }
            if (S.waterRuns.length) {
              watR = [];
              for (const [tx0, ty0, tx1, ty1] of S.waterRuns) {
                const x0 = Math.max(0, d2x(tx0 * 16)), y0 = Math.max(0, d2y(ty0 * 16));
                const x1 = Math.min(W, d2x((tx1 + 1) * 16)), y1 = Math.min(H, d2y((ty1 + 1) * 16));
                if (x1 > x0 && y1 > y0) watR.push([x0, y0, x1, y1]);
              }
            }
          }
          // 逐像素:x 方向 chunk 光标 O(1)(每尺寸 cx/next/rowBase)
          const cursors = acc.map((A) => ({ cx: -1, next: -1, rowBase: -1, A }));
          for (let y = 0; y < H; y++) {
            const rowOff = y * W;
            if (cursors[0].A) {
              for (const c of cursors) {
                c.cy = (y / c.A.cs) | 0;
                c.rowBase = c.cy * c.A.nx;
                c.cx = -1; c.next = 0;
              }
            }
            for (let x = 0; x < W; x++) {
              const i = rowOff + x;
              if (u32[i] === prev[i]) continue;
              rec.changed++;
              let cls = 0; // 1=ent 2=ter 4=wat 8=oth 16=scroll(不逐像素归因)
              if (still) {
                if (entR && inRects(entR, x, y)) { rec.ent++; cls = 1; }
                else if (terR && inRects(terR, x, y)) { rec.ter++; cls = 2; }
                else if (watR && inRects(watR, x, y)) { rec.wat++; cls = 4; }
                else { rec.oth++; cls = 8; }
              } else cls = 16;
              for (const c of cursors) {
                if (x >= c.next) { c.cx++; c.next = (c.cx + 1) * c.A.cs; }
                c.A.a[c.rowBase + c.cx] |= cls | 32;
              }
            }
          }
          for (const A of acc) {
            let dirty = 0, dynOnly = 0, terOth = 0;
            const a = A.a;
            for (let k = 0; k < a.length; k++) {
              const v = a[k];
              if (!(v & 32)) continue;
              dirty++;
              const cls2 = v & 31;
              if (cls2 === 1 || cls2 === 4) dynOnly++;          // 纯实体/水体脏
              else if (cls2 & (2 | 8)) terOth++;                // 含地形或环境动画
              else if (cls2 & 16) { /* scroll:单列 */ }
            }
            rec['ch' + A.cs] = { dirty, total: A.nx * A.ny, dynOnly, terOth };
          }
        }
        S.prev = u32; S.prevW = W; S.prevH = H;
        if (!diffRan) rec.first = 1;   // 首帧无差分/无 chunk 统计——汇总时排除
        rec.t = performance.now();
        S.recs.push(rec);
        if (S.recs.length > 4000) S.recs.shift();
      } catch (e) { S.err = String(e && e.stack || e).slice(0, 300); S.on = false; }
    };
    function inRects(rs, x, y) {
      for (let i = 0; i < rs.length; i++) {
        const a = rs[i];
        if (x >= a[0] && x < a[2] && y >= a[1] && y < a[3]) return true;
      }
      return false;
    }
    let lastT = 0;
    function tick(now) {
      S.sample();
      if (lastT && S.recs.length) S.recs[S.recs.length - 1].dt = now - lastT;
      lastT = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  // 场景器:arm(水 runs 预扫描)→ 采样窗口
  const armWater = () => page.evaluate(function bj82ArmWater() {
    const S = window.__bj82, g = window.__swGame, st = g.world.store;
    const pcx = (g.player.cx / 16) | 0, pcy = (g.player.cy / 16) | 0;
    const x0 = Math.max(0, pcx - 100), x1 = Math.min(st.w - 1, pcx + 100);
    const y0 = Math.max(0, pcy - 64), y1 = Math.min(st.h - 1, pcy + 64);
    const runs = [];
    for (let y = y0; y <= y1; y++) {
      let rs = -1;
      for (let x = x0; x <= x1; x++) {
        const liq = st.liquid[y * st.w + x] > 0;
        if (liq && rs < 0) rs = x;
        else if (!liq && rs >= 0) { if (x - rs >= 2) runs.push([rs, y, x - 1, y]); rs = -1; }
      }
      if (rs >= 0 && x1 - rs >= 2) runs.push([rs, y, x1, y]);
    }
    runs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const r0 of runs) {
      const m = merged.find((m2) => m2[0] === r0[0] && m2[2] === r0[2] && m2[3] === r0[1] - 1);
      if (m) m[3] = r0[3]; else merged.push([...r0]);
    }
    S.waterRuns = merged;
    return { runs: runs.length, merged: merged.length };
  });

  const setOn = (on) => page.evaluate((c) => { const S = window.__bj82; S.on = c; if (!c) S.edits.clear(); }, on);
  // (S.edits 现为 Map,clear 仍适用)
  const resetRecs = () => page.evaluate(() => { window.__bj82.recs.length = 0; });

  const summarize = (name) => page.evaluate((n) => {
    const S = window.__bj82;
    const recs = S.recs.slice(); S.recs.length = 0;
    const stat = (arr) => {
      if (!arr.length) return null;
      const a = [...arr].sort((x, y) => x - y);
      return { n: a.length, mean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(4), p50: +a[(a.length / 2) | 0].toFixed(4), p90: +a[(a.length * 0.9) | 0].toFixed(4), max: +a[a.length - 1].toFixed(4) };
    };
    const out = { name: n, frames: recs.length, errs: S.err };
    const valid = recs.filter((r0) => !r0.first);   // 首帧无差分,排除
    for (const [tag, sel] of [['all', () => true], ['still', (r0) => r0.still === 1], ['scroll', (r0) => r0.still === 0]]) {
      const sub = valid.filter(sel);
      if (!sub.length) { out[tag] = null; continue; }
      const W = sub[0].W, H = sub[0].H, framePx = W * H;
      const o = {
        frames: sub.length,
        stillShare: +(sub.length / recs.length).toFixed(3),
        changedPct: stat(sub.map((r0) => (r0.changed / framePx) * 100)),
        clsPct: {
          ent: stat(sub.map((r0) => (r0.ent / framePx) * 100)),
          ter: stat(sub.map((r0) => (r0.ter / framePx) * 100)),
          wat: stat(sub.map((r0) => (r0.wat / framePx) * 100)),
          oth: stat(sub.map((r0) => (r0.oth / framePx) * 100)),
        },
        fps: stat(sub.map((r0) => (r0.dt ? 1000 / r0.dt : 0))),
      };
      for (const cs of [128, 200, 256]) {
        const rs = sub.filter((r0) => r0['ch' + cs]);
        o['ch' + cs] = {
          dirty: stat(rs.map((r0) => r0['ch' + cs].dirty)),
          areaPct: stat(rs.map((r0) => (r0['ch' + cs].dirty / r0['ch' + cs].total) * 100)),
          dynOnly: stat(rs.map((r0) => r0['ch' + cs].dynOnly)),
          terOth: stat(rs.map((r0) => r0['ch' + cs].terOth)),
        };
      }
      out[tag] = o;
    }
    return out;
  }, name);

  // 走动驱动器
  await page.evaluate(function bj82WalkInstall() {
    const P = window.__bj82walk = { on: false, tps: 0, dir: 1, last: 0 };
    function tick2(now) {
      if (!P.on) { P.last = 0; requestAnimationFrame(tick2); return; }
      const g = window.__swGame;
      if (g?.player) {
        const dt = P.last ? Math.min(0.1, (now - P.last) / 1000) : 0;
        g.player.x += P.tps * 16 * dt * P.dir;
        g.player.vy = 0;
      }
      P.last = now;
      requestAnimationFrame(tick2);
    }
    requestAnimationFrame(tick2);
  });
  const setWalk = (on, tps, dir) => page.evaluate((c) => { const P = window.__bj82walk; P.on = c.on; P.tps = c.tps; P.dir = c.dir; P.last = 0; }, { on, tps, dir });

  // 挖掘驱动器(每 180ms 破坏玩家脚边 1 格; breakTile 公开签名)
  await page.evaluate(function bj82DigInstall() {
    const P = window.__bj82dig = { on: false, last: 0, n: 0 };
    function tick3(now) {
      if (!P.on) { P.last = 0; requestAnimationFrame(tick3); return; }
      const g = window.__swGame;
      if (g?.player && now - P.last > 180) {
        P.last = now;
        const st = g.world.store;
        const tx = (g.player.cx / 16) | 0, ty = ((g.player.cy + 40) / 16) | 0;
        for (let dy = 0; dy < 3; dy++) {
          const bx = tx + ((P.n % 3) - 1);
          if (st.get(bx, ty + dy) !== 0) { g.breakTile(bx, ty + dy); P.n++; break; }
        }
      }
      requestAnimationFrame(tick3);
    }
    requestAnimationFrame(tick3);
  });
  const setDig = (on) => page.evaluate((c) => { window.__bj82dig.on = c; }, on);

  const seg = async (name, ms, setup) => {
    await front(page);
    if (setup) await setup();
    const arm = await armWater();
    L.say(`[${name}] water-rects=${JSON.stringify(arm)}`);
    await resetRecs();
    await setOn(true);
    await sleep(ms);
    await setOn(false);
    const s = await summarize(name);
    const f1 = (x) => (x == null ? 'n/a' : x);
    const fmt = (o) => o ? `changed=${f1(o.changedPct?.mean)}% (p90=${f1(o.changedPct?.p90)}) cls e/t/w/o=${f1(o.clsPct?.ent?.mean)}/${f1(o.clsPct?.ter?.mean)}/${f1(o.clsPct?.wat?.mean)}/${f1(o.clsPct?.oth?.mean)}% fps=${o.fps?.mean != null ? o.fps.mean.toFixed(0) : 'n/a'} | ch128 area=${f1(o.ch128?.areaPct?.mean)}% ch200 area=${f1(o.ch200?.areaPct?.mean)}% (dirty=${f1(o.ch200?.dirty?.mean)} dynOnly=${f1(o.ch200?.dynOnly?.mean)} terOth=${f1(o.ch200?.terOth?.mean)}) ch256 area=${f1(o.ch256?.areaPct?.mean)}%` : 'null';
    L.say(`[${name}] all:    ` + fmt(s.all));
    L.say(`[${name}] still:  ` + fmt(s.still) + ` (share=${s.still?.stillShare})`);
    L.say(`[${name}] scroll: ` + (s.scroll ? `changed=${f1(s.scroll.changedPct?.mean)}% ch200dirty=${f1(s.scroll.ch200?.dirty?.mean)} area=${f1(s.scroll.ch200?.areaPct?.mean)}%` : 'null'));
    L.say('json=' + JSON.stringify(s));
    return s;
  };

  const env = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    return { zoom: g.camera.zoom, zoomTarget: g.camera.zoomTarget, dpr: window.devicePixelRatio, wW: r.worldCanvas?.width, wH: r.worldCanvas?.height, lowK: r._worldLowK, layerOn: r.worldLayerEnabled, viewW: r.canvas.width, viewH: r.canvas.height };
  });
  L.say('env=' + JSON.stringify(env));
  if (env.zoom !== 1) await page.evaluate(() => { const c = window.__swGame.camera; c.zoom = 1; c.zoomTarget = 1; });

  await seg('still:surface', 7000);
  await seg('walk:surface', 8000, () => setWalk(true, 12, 1));
  await setWalk(false, 0, 1);
  const water = await page.evaluate(function bj82FindWater() {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const y0 = Math.max(0, gl - 30), y1 = Math.min(st.h - 1, gl + 12);
    const runs = [];
    let runStart = -1, runLen = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let cnt = 0;
      for (let y = y0; y <= y1; y++) if (st.liquid[y * st.w + x] > 0) cnt++;
      if (cnt >= 8) { if (runStart < 0) runStart = x; runLen++; }
      else if (runStart >= 0) { if (runLen >= 10) runs.push([runStart, runStart + runLen - 1]); runStart = -1; runLen = 0; }
    }
    if (runStart >= 0 && runLen >= 10) runs.push([runStart, runStart + runLen - 1]);
    runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - g.player.x) - Math.abs((b[0] + b[1]) / 2 - g.player.x));
    return { runs: runs.slice(0, 6), groundLevel: gl };
  });
  L.say('water-runs=' + JSON.stringify(water.runs));
  if (water.runs.length) {
    const [wx0, wx1] = water.runs[0];
    await teleport(page, ((wx0 + wx1) / 2) * 16, water.groundLevel * 16 - 48);
    await seg('still:water', 7000);
    await seg('walk:water', 8000, () => setWalk(true, 12, 1));
    await setWalk(false, 0, 1);
  } else {
    L.say('no-water-run: 水段跳过');
  }
  await seg('dig:surface', 7000, () => setDig(true));
  await setDig(false);

  const env2 = await page.evaluate(() => ({ err: window.__bj82.err, zoom: window.__swGame.camera.zoom, nrecs: window.__bj82.recs.length }));
  L.say('env2=' + JSON.stringify(env2));
  L.say('probe-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
