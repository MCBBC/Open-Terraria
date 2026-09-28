// ★wbake=1 世界入场空白探针（2026-09-28;修复刃验收面）。
// 病灶：?wbake=1 进世界后瓦片/墙层全透明 1-2s（图36/37 用户实报）——worker 往返
// 期间幕布已被 whenFirstPaint(4 帧) 提前掀开,首烘占位=透明页区全视口裸露。
// 量面（两臂 ?wbake=0 / ?wbake=1）：
//   · 时间线    t_gameVisible/t_attachDone/t_shipDone/t_firstReply/t_curtain
//              （=whenFirstPaint(4) 旧幕布）/t_entryGate（修后覆盖门）/t_covered
//   · 空白窗    旧语义 = t_covered−t_curtain（修后应为 0=门兜住）;现行幕布门同算
//   · 覆盖曲线  逐渲染帧 (t, frame, cov/tot)——首波回包时延直观化
//   · 队列序    BakeClient.request 前 120 次 (t,cx,cy,ready)+baked 回包序（队列序定谳）
//   · worker    回包 ms 累计/最大/计数;主线程烘计数（wbake1 应≈0）
//   · 截图      每次入场从世界可见起 ~110ms/张（视觉证据序列）
// 两模式：
//   缺省     = newWorld 直入（探针快照;生成期把 attach 全程藏住=竞态难输）
//   --replay = newWorld → 原型仪器就位 → 绕玩家建实体墙基地（重出生点世界）→
//              doSave → quitToMenu → quickLoad（读档入场=用户实报路径;afterWorldLoad
//              短,attach/首波与帧数门同场竞速）→ 量第二入场
// 运行：
//   SW_ORIGIN=http://localhost:5250 node tools/run-diag.mjs --timeout=600000 \
//     scripts/_wbake-entry-blank.mjs [--out /tmp/wbake-entry/xxx] [--arms 0,1] \
//     [--throttle 6] [--seed 05162020] [--replay 1]
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5250';
const argOf = (k, dflt) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = argOf('--out', `/tmp/wbake-entry/run-${Date.now()}`);
const ARMS = (argOf('--arms', '0,1') || '0,1').split(',').map(Number);
// CPU 降速倍率（CDP Emulation.setCPUThrottlingRate,页内全部线程含 worker）
const THROTTLE = Number(argOf('--throttle', '0')) || 0;
const SEED = argOf('--seed', '05162020');
const WSIZE = argOf('--size', 'small');
const REPLAY = argOf('--replay', '0') === '1';

// ---- 页内仪器（原型补丁一次挂;状态面可重置=replay 双入场各自成段）----
const INSTALL = () => {
  const fresh = () => ({
    t0: performance.now(),
    timeline: {},
    reqs: [], bakes: [],
    workerMs: 0, workerCount: 0, workerMsMax: 0,
    mainBakeCount: 0, mainBakeMs: 0,
    coverage: [], paintedFrames: 0,
    viewAtCovered: null, dirtyAtFirst: null, coveredFrame: null,
    landed: new Set(),
    done: false,
  });
  // ---- rAF 采样器（读 __wbEntry 活引用;gen 护栏=重置后旧循环退场新循环接管）----
  window.__wbStartSampler = () => {
    window.__wbGen = (window.__wbGen ?? 0) + 1;
    const gen = window.__wbGen;
    const TILE = 16, CH = 16, CS = TILE * CH;
    const raf = () => {
      if (gen !== window.__wbGen) return;                 // 已重置:本循环退场
      const S = window.__wbEntry;
      const g = window.__swGame;
      if (g && g.camera && g.world && S.landed) {
        S.paintedFrames++;
        if (S.timeline.t_gameVisible === undefined) S.timeline.t_gameVisible = performance.now() - S.t0;
        const cam = g.camera, z = cam.zoom || 1;
        const x0 = Math.floor((cam.x - cam.viewW / 2 / z) / CS) - 1;
        const x1 = Math.floor((cam.x + cam.viewW / 2 / z) / CS) + 1;
        const y0 = Math.floor((cam.y - cam.viewH / 2 / z) / CS) - 1;
        const y1 = Math.floor((cam.y + cam.viewH / 2 / z) / CS) + 1;
        let cov = 0, tot = 0;
        const w = g.world.w, h = g.world.h;
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const bx = cx * CH, by = cy * CH;
            if (bx + CH <= 0 || by + CH <= 0 || bx >= w || by >= h) continue;
            tot++;
            if (S.landed.has(((cx & 0xffff) | ((cy & 0xffff) << 16)))) cov++;
          }
        }
        S.coverage.push({ t: Math.round(performance.now() - S.t0), frame: S.paintedFrames, cov, tot });
        if (tot > 0 && cov >= tot && S.timeline.t_covered === undefined) {
          S.timeline.t_covered = performance.now() - S.t0;
          S.coveredFrame = S.paintedFrames;
          S.viewAtCovered = { x0, x1, y0, y1 };
          S.dirtyAtFirst = g.chunks ? g.chunks.dirtyQueue.length : -1;
        }
      }
      // 采样窗:覆盖后 +2.5s 收;150s 硬顶
      const now = performance.now() - S.t0;
      const covered = S.timeline.t_covered;
      if ((covered !== undefined && now - covered > 2500) || now > 150000) S.done = true;
      if (!S.done) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  };
  window.__wbReset = () => { window.__wbEntry = fresh(); window.__wbStartSampler(); };
  window.__wbReset();

  const mark = (k) => {
    const S = window.__wbEntry;
    if (S.timeline[k] === undefined) S.timeline[k] = performance.now() - S.t0;
  };

  // ChunkCache：主线程烘焙/worker 回包 → 落地账（coverage 判定源）
  import('/src/render/ChunkCache.ts').then((m) => {
    const proto = m.ChunkCache.prototype;
    if (proto.__wbPatched) return;
    proto.__wbPatched = true;
    const keyOf = (cx, cy) => ((cx & 0xffff) | ((cy & 0xffff) << 16));
    const origBake = proto.bakeChunkInto;
    proto.bakeChunkInto = function (cx, cy, ...a) {
      const s = performance.now();
      const r = origBake.apply(this, [cx, cy, ...a]);
      const S = window.__wbEntry;
      S.mainBakeMs += performance.now() - s; S.mainBakeCount++;
      S.landed.add(keyOf(cx, cy));
      mark('t_firstMainBake');
      return r;
    };
    const origApply = proto.completeWorkerBake;
    if (origApply) {
      proto.completeWorkerBake = function (cx, cy, ...a) {
        const r = origApply.apply(this, [cx, cy, ...a]);
        const S = window.__wbEntry;
        S.landed.add(keyOf(cx, cy));
        mark('t_firstReply');
        return r;
      };
    }
  });
  // BakeClient：请求序/attach 时序/worker 自耗时
  import('/src/workers/BakeClient.ts').then((m) => {
    const proto = m.BakeClient.prototype;
    if (proto.__wbPatched) return;
    proto.__wbPatched = true;
    const origReq = proto.request;
    proto.request = function (cx, cy, ...a) {
      const S = window.__wbEntry;
      if (S.reqs.length < 120) S.reqs.push({ t: performance.now() - S.t0, cx, cy, ready: this.ready });
      return origReq.apply(this, [cx, cy, ...a]);
    };
    const origAttach = proto.attach;
    proto.attach = async function () {
      mark('t_attachStart');
      const r = await origAttach.apply(this);
      mark('t_attachDone');
      return r;
    };
    const origMsg = proto.onMessage;
    proto.onMessage = function (res) {
      if (res && res.type === 'baked' && res.ms !== undefined) {
        const S = window.__wbEntry;
        S.workerMs += res.ms; S.workerCount++;
        S.workerMsMax = Math.max(S.workerMsMax, res.ms);
        S.bakes.push({ t: performance.now() - S.t0, cx: res.cx, cy: res.cy, ms: Math.round(res.ms * 10) / 10 });
      }
      return origMsg.apply(this, [res]);
    };
  });
  // Game：whenFirstPaint(4)=旧幕布掀 + whenViewportBaked(修后)=入场门
  import('/src/core/Game.ts').then((m) => {
    const proto = m.Game.prototype;
    if (proto.__wbPatched) return;
    proto.__wbPatched = true;
    const origWfp = proto.whenFirstPaint;
    proto.whenFirstPaint = function (frames = 2) {
      const p = origWfp.apply(this, [frames]);
      if (frames >= 4) p.then(() => { mark('t_curtain'); });
      return p;
    };
    if (typeof proto.whenViewportBaked === 'function') {
      const origGate = proto.whenViewportBaked;
      proto.whenViewportBaked = function (timeoutMs = 3000) {
        const p = origGate.apply(this, [timeoutMs]);
        p.then(() => { mark('t_entryGate'); });
        return p;
      };
    }
  });
};

// ---- 页内:绕玩家建重出生点基地（墙全铺+全实心石体,首波烘焙最坏成本面）----
const BUILD_BASE = () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const stone = window.__swTileByKey('stone');
  const wood = window.__swTileByKey('wood');
  const t0 = performance.now();
  for (let y = py - 34; y <= py + 22; y++) {
    for (let x = px - 70; x <= px + 70; x++) {
      if (!st.inBounds(x, y)) continue;
      st.setWall(x, y, 8);                                   // 木墙铺满（含空气格）
      if (y > py + 2) st.setTile(x, y, stone, 0, 0);         // 全实心石体（逐格邻域协商）
      else if (y >= py - 1) st.setTile(x, y, wood, 0, 0);    // 地表木层
    }
  }
  return { ms: Math.round(performance.now() - t0), px, py };
};

// ---- Node 侧:截图序列（世界可见起;covered+1.5s 收;90s 硬顶）----
async function shotLoop(page, dir) {
  const fs = await import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let n = 0, coveredAt = null;
  while (Date.now() - t0 < 90000) {
    const st = await page.evaluate(() => {
      const S = window.__wbEntry;
      return { game: !!window.__swGame?.world, covered: S?.timeline?.t_covered };
    }).catch(() => ({ game: false }));
    if (st.game) {
      if (st.covered !== undefined && coveredAt === null) coveredAt = Date.now() - t0;
      const f = String(n).padStart(3, '0');
      try { await page.screenshot({ path: `${dir}/f${f}_${Date.now() - t0}ms.png` }); } catch { /* 页跳转竞态 */ }
      n++;
      if (coveredAt !== null && Date.now() - t0 > coveredAt + 1500) break;
    }
    await new Promise((r) => setTimeout(r, 110));
  }
  return n;
}

async function collect(page) {
  return page.evaluate(() => new Promise((res) => {
    const t0 = Date.now();
    const poll = () => {
      const S = window.__wbEntry;
      if (S && S.done) {
        res({
          timeline: S.timeline, coveredFrame: S.coveredFrame,
          viewAtCovered: S.viewAtCovered, dirtyAtFirst: S.dirtyAtFirst,
          reqs: S.reqs, bakes: S.bakes.slice(0, 200),
          workerMs: Math.round(S.workerMs), workerCount: S.workerCount,
          workerMsMax: Math.round(S.workerMsMax),
          mainBakeCount: S.mainBakeCount, mainBakeMs: Math.round(S.mainBakeMs),
          covCurve: S.coverage.filter((c, i) => i < 3 || c.cov !== S.coverage[i - 1]?.cov).slice(0, 80),
        });
      } else if (Date.now() - t0 > 150000) {
        res({ timeout: true, timeline: S?.timeline, reqs: S?.reqs.slice(0, 40) ?? [], covCurve: S?.coverage.slice(0, 40) ?? [] });
      } else setTimeout(poll, 250);
    };
    poll();
  }));
}

async function waitGameGone(page, { timeout = 60000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const g = await page.evaluate(() => !!window.__swGame?.world).catch(() => true);
    if (!g) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function runArm(flag) {
  const fs = await import('node:fs');
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  if (THROTTLE > 1) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    console.log(`[throttle] CPU ×${THROTTLE}`);
  }
  await bootstrap(page, ORIGIN);
  if (!(await gotoApp(page, ORIGIN, { extraQuery: `?wbake=${flag}`, tries: 30 }))) {
    await browser.close();
    return { flag, error: 'goto failed' };
  }
  await waitForBridge(page);
  await page.evaluate(INSTALL);

  const [W, H] = sizeDims(WSIZE);
  await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: SEED, w: W, h: H });

  let replayInfo = null;
  if (REPLAY) {
    // 第一入场（建立世界/基地,不计测量）;等世界可见后建基地
    await page.waitForFunction('window.__swGame?.world && window.__swGame?.player', { timeout: 240000, polling: 500 });
    await new Promise((r) => setTimeout(r, 1200));
    replayInfo = await page.evaluate(BUILD_BASE);
    await new Promise((r) => setTimeout(r, 2000));            // 基地块烘焙落页+终态保险窗
    await page.evaluate(() => window.__swFlow.doSave());
    await page.evaluate(() => { void window.__swFlow.quitToMenu(); });
    await waitGameGone(page);
    // 第二入场=测量对象（读档链;仪器重置后 quickLoad）
    await page.evaluate(() => { window.__wbReset(); });
    const dir = `${OUT}/wbake${flag}`;
    fs.mkdirSync(dir, { recursive: true });
    const shots = shotLoop(page, dir);
    await page.evaluate(() => { void window.__swFlow.quickLoad(); });
    const data = await collect(page);
    const shotCount = await shots;
    const flags = await page.evaluate(() => ({ wbake: window.__swBakeFlags?.enabled, client: !!window.__swGame?.chunks?.bakeClient }));
    await browser.close();
    return { flag, data, flags, shotCount, pageErrors: pageErrors.slice(0, 3), dir: `${dir}`, replayInfo };
  }

  const shots = shotLoop(page, `${OUT}/wbake${flag}`);
  const data = await collect(page);
  const shotCount = await shots;
  const flags = await page.evaluate(() => ({ wbake: window.__swBakeFlags?.enabled, client: !!window.__swGame?.chunks?.bakeClient }));
  await browser.close();
  return { flag, data, flags, shotCount, pageErrors: pageErrors.slice(0, 3), dir: `${OUT}/wbake${flag}`, replayInfo };
}

// ---- 汇总 ----
const results = [];
for (const arm of ARMS) {
  const r = await runArm(arm);
  results.push(r);
  const tl = r.data.timeline || {};
  const curtainEff = tl.t_entryGate ?? tl.t_curtain;
  const blank = (tl.t_covered !== undefined && curtainEff !== undefined)
    ? Math.max(0, tl.t_covered - curtainEff) : null;
  const blankOld = (tl.t_covered !== undefined && tl.t_curtain !== undefined)
    ? Math.max(0, tl.t_covered - tl.t_curtain) : null;
  console.log(`\n==== wbake=${arm} ====${r.data.timeout ? ' (采样超时)' : ''}${r.replayInfo ? ` [replay 基地 ${r.replayInfo.ms}ms @(${r.replayInfo.px},${r.replayInfo.py})]` : ''}`);
  const fmt = (v) => v === undefined ? '—' : `${Math.round(v)}ms`;
  console.log(`可见(t_gameVisible)=${fmt(tl.t_gameVisible)}  attach 完成=${fmt(tl.t_attachDone)}  首 worker 回包=${fmt(tl.t_firstReply)}  wfp4=${fmt(tl.t_curtain)}  入场门=${fmt(tl.t_entryGate)}  覆盖=${fmt(tl.t_covered)} @帧${r.data.coveredFrame ?? '—'}`);
  console.log(`空白窗(旧语义 wfp4)=${blankOld === null ? '—' : Math.round(blankOld) + 'ms'}  空白窗(现行幕布)=${blank === null ? '—' : Math.round(blank) + 'ms'}`);
  console.log(`worker bake: n=${r.data.workerCount} Σms=${r.data.workerMs} max=${r.data.workerMsMax}ms  主线程烘: n=${r.data.mainBakeCount} Σms=${r.data.mainBakeMs}  dirty@覆盖=${r.data.dirtyAtFirst}`);
  console.log(`flags=${JSON.stringify(r.flags)} pageErrors=${r.pageErrors.length} shots=${r.shotCount} → ${r.dir}`);
  const reqs = r.data.reqs || [];
  if (reqs.length) {
    const preReady = reqs.filter((q) => !q.ready).length;
    console.log(`请求序前${reqs.length}: ready 前=${preReady} 条; 前 12: ${reqs.slice(0, 12).map((q) => `(${q.cx},${q.cy}${q.ready ? '' : '!r'})`).join(' ')}`);
  }
  const bk = r.data.bakes || [];
  if (bk.length) console.log(`回包序前 12: ${bk.slice(0, 12).map((b) => `(${b.cx},${b.cy}@${Math.round(b.t)}ms,${b.ms}ms)`).join(' ')}`);
  if (r.data.covCurve?.length) {
    console.log(`覆盖曲线(变化帧): ${r.data.covCurve.slice(0, 24).map((c) => `${c.t}ms:f${c.frame}=${c.cov}/${c.tot}`).join('  ')}`);
  }
}

const fs = await import('node:fs');
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
console.log(`\nsummary → ${OUT}/summary.json`);
const ok = results.every((r) => r.pageErrors.length === 0 && r.flags?.wbake === (r.flag === 1));
process.exit(ok ? 0 : 1);
