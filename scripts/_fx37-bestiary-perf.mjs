// SW-FX37 图鉴(Bestiary)UI 交互性能取证探针 —— rAF 帧界分布 + CPU profile + trace 三通道。
// 场景:开图鉴→分类 chip 切换×N→网格滚动(滚轮翻页)×N→条目详情点击×N→驻留(捕捉 400ms 补画扫描)。
// 运行:node tools/probe.mjs run scripts/_fx37-bestiary-perf.mjs --vite=auto --seed=05162020
// 产物:SW_PROBE_OUT 下 report.json / report.md / fx37-bestiary/*.cpuprofile / *.trace
// 纪律:perf 段窗内只 sleep+真实事件,禁 pump(perf.mjs 文件头互斥);段前 front()。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  launchBrowser, openPage, bootstrap, createGame, installFrameProbe, removeFrameProbe,
  armPerfInstrumentation, createPerfRecorder, sleep, front, perfProbeReady,
} from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT || '/tmp/probe-out/fx37';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const ROUNDS = Number(process.env.SW_FX37_ROUNDS || 3);
const SEED = process.env.SW_SEED || '05162020';

const errors = [];
const ok = [];
const chk = (name, cond, extra = '') => {
  ok.push(!!cond);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
};

// ---------- 页内驱动(全带 swFx37 前缀,框架开销账识别面) ----------
// 开面板=直实例化 BestiaryPanel(_bst-probe.mjs 同路;openBestiary 不在 __swFlow 上)+
// 手动置 paused/uiBlocking(mainFlow.openBestiary 同语义:面板开着世界暂停)。
async function openPanel(page) {
  await page.evaluate(async function swFx37Open() {
    const g = window.__swGame;
    if (window.__swFx37Panel) { window.__swFx37Panel.close(); window.__swFx37Panel = null; }
    if (!window.__swFx37PanelCls) {
      window.__swFx37PanelCls = (await import('/src/ui/BestiaryPanel.ts')).BestiaryPanel;
    }
    g.paused = true; g.input.uiBlocking = true;
    window.__swFx37OpenT0 = performance.now();
    window.__swFx37Panel = new window.__swFx37PanelCls(document.body, {
      getTracker: () => g.world.bestiary,
      atlas: g.atlas ?? g.renderer?.atlas ?? null,
      isCrimson: () => g.world.crimson ?? false,
      onBack: () => {},
    });
  });
  await page.waitForSelector('.sw-bst', { timeout: 8000 });
}
async function closePanel(page) {
  await page.evaluate(function swFx37Close() {
    window.__swFx37Panel?.close();
    window.__swFx37Panel = null;
    const g = window.__swGame;
    g.paused = false; g.input.uiBlocking = false;
  });
  await page.waitForFunction(() => !document.querySelector('.sw-bst'), { timeout: 5000 });
}
/** 分类 chip 交替点击(click→filter 变更→全量 refresh)。 */
async function clickChips(page, times, gapMs) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(function swFx37Chip(i) {
      const chips = [...document.querySelectorAll('.sw-bst-chip')];
      // 全部(0)↔敌怪(1)交替=每次点击都换筛选集(全量重筛+重排+重建网格)
      chips[i % 2 === 0 ? 1 : 0]?.click();
    }, i);
    await sleep(gapMs);
  }
}
/** 滚轮翻页(真实用户手势;wheelHandler 阈值门 40)。 */
async function wheelPages(page, times, gapMs) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(function swFx37Wheel(dir) {
      const w = document.querySelector('.sw-bst-gridwrap');
      w?.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * 120, bubbles: true, cancelable: true }));
    }, i % 8 < 4 ? 1 : -1);
    await sleep(gapMs);
  }
}
/** 条目卡点击(选中→refresh 全量重建网格+详情)。 */
async function clickCells(page, times, gapMs) {
  for (let i = 0; i < times; i++) {
    await page.evaluate(function swFx37Cell(i) {
      const cells = document.querySelectorAll('.sw-bst-cell');
      if (!cells.length) return;
      cells[i % cells.length]?.click();
    }, i);
    await sleep(gapMs);
  }
}

/** 单拍微观计量:一次操作 → 首帧延迟(dispatch→下一 rAF)+ 帧间隔尖峰 + getImageData 读回。
 *  返回 { tFirst, maxGap, gfxMs, gfxN, nodes }。times 次重复取中位/最大。 */
async function microOp(page, kind, times) {
  const rows = [];
  for (let i = 0; i < times; i++) {
    rows.push(await page.evaluate(async function swFx37Micro(kind) {
      const G = window.__swFx37Gfx;
      const doc0 = document.getElementsByTagName('*').length;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 40));   // 静默(上一拍 refresh/sweep 落定)
      G.ms = 0; G.n = 0;
      const win = window;
      win.__swFx37N = (win.__swFx37N ?? 0) + 1;
      const t0 = performance.now();
      const doOp = (k) => {
        if (k === 'chip') {
          const chips = [...document.querySelectorAll('.sw-bst-chip')];
          chips[win.__swFx37N % 2 === 0 ? 1 : 0]?.click();
        } else if (k === 'page') {
          const dir = win.__swFx37N % 8 < 4 ? 1 : -1;
          document.querySelector('.sw-bst-gridwrap')?.dispatchEvent(new WheelEvent('wheel', { deltaY: dir * 120, bubbles: true, cancelable: true }));
        } else if (k === 'sel') {
          const cells = document.querySelectorAll('.sw-bst-cell');
          cells[win.__swFx37N % cells.length]?.click();
        } else if (k === 'search') {
          const inp = document.querySelector('[data-search]');
          inp.value = win.__swFx37N % 2 ? '僵' : '';
          inp.dispatchEvent(new Event('input'));
        } else if (k === 'filter') {
          document.querySelector('[data-filter]')?.click();   // 弹层开/合交替
        }
      };
      doOp(kind);
      const tOp = performance.now();
      let last = tOp, first = 0, maxGap = 0;
      await new Promise((resolve) => {
        let frames = 0;
        function tick() {
          const now = performance.now();
          const dt = now - last;
          last = now;
          if (frames === 0) first = dt;
          else maxGap = Math.max(maxGap, dt);
          if (++frames >= 5) { resolve(); return; }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return {
        tFirst: +first.toFixed(2), tOp: +(tOp - t0).toFixed(2), maxGap: +maxGap.toFixed(2),
        gfxMs: +G.ms.toFixed(2), gfxN: G.n,
        nodes: document.getElementsByTagName('*').length - doc0,
      };
    }, kind));
    await sleep(140);
  }
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const agg = {
    kind, n: rows.length,
    tFirstMed: med(rows.map((r) => r.tFirst)), tFirstMax: Math.max(...rows.map((r) => r.tFirst)),
    maxGapMed: med(rows.map((r) => r.maxGap)), maxGapMax: Math.max(...rows.map((r) => r.maxGap)),
    gfxMsMed: med(rows.map((r) => r.gfxMs)), gfxNMed: med(rows.map((r) => r.gfxN)),
    nodesMed: med(rows.map((r) => r.nodes)),
    rows,
  };
  console.log(`  micro ${kind}: 首帧=${agg.tFirstMed}ms(max ${agg.tFirstMax}) 帧尖峰=${agg.maxGapMed}ms(max ${agg.maxGapMax}) getImageData=${agg.gfxMsMed}ms/${agg.gfxNMed}次 Δnodes=${agg.nodesMed}`);
  return agg;
}

// ---------- 帧界细账(>20ms=掉 vsync 计数;seg 记录只有分位数,原值另拉) ----------
async function resetAt(page) {
  return page.evaluate(() => window.__swPerf?.resetAt ?? 0);
}
async function frameOver(page, since) {
  return page.evaluate(function swFx37FrameOver(since) {
    const P = window.__swPerf;
    if (!P) return { over20: 0, over50: 0, n: 0, worst: [] };
    let k = 0;
    while (k < P.frameAt.length && P.frameAt[k] < since) k++;
    let over20 = 0, over50 = 0;
    const worst = [];
    for (let i = k; i < P.frames.length; i++) {
      const dt = P.frames[i];
      if (dt > 20) over20++;
      if (dt > 50) over50++;
      if (dt > 20) worst.push(+dt.toFixed(1));
    }
    return { over20, over50, n: P.frames.length - k, worst: worst.sort((a, b) => b - a).slice(0, 8) };
  }, since);
}
/** getImageData 读回累加器(导航前装):量化补画扫描/染色合成的同步读回成本。 */
async function armGfxMeter(page) {
  await page.evaluateOnNewDocument(function swFx37GfxArm() {
    const G = { ms: 0, n: 0 };
    window.__swFx37Gfx = G;
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.getImageData;
    proto.getImageData = function swFx37Gid(...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      G.ms += performance.now() - t0;
      G.n++;
      return r;
    };
  });
}
async function gfxRead(page) {
  return page.evaluate(function swFx37GfxRead() {
    const G = window.__swFx37Gfx;
    const r = { ms: +G.ms.toFixed(2), n: G.n };
    G.ms = 0; G.n = 0;
    return r;
  });
}

// ---------- 主流程 ----------
const browser = await launchBrowser({ viewport: { width: 1440, height: 900 } });
let viteNote = '';
try {
  const page = await openPage(browser, { errors });
  await armPerfInstrumentation(page, {});
  await armGfxMeter(page);
  const boot = await bootstrap(page, ORIGIN);
  chk('bootstrap', boot.ok, boot.why ?? '');
  if (!boot.ok) throw new Error('bootstrap failed');
  const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small', log: (m) => console.log('[gen]', m) });
  chk('世界已建', gen.ok, gen.why ?? `seed=${gen.seed} ${gen.w}x${gen.h}`);
  if (!gen.ok) throw new Error('world gen failed');
  chk('页内 perf 探针就绪', (await perfProbeReady(page)).ok);
  chk('帧探针已装', (await installFrameProbe(page)).ok);

  // 面板打开时世界暂停(mainFlow.openBestiary),帧界=渲染+图鉴 DOM 面。

  // ============ 参照面:无面板(同暂停态)——卡顿归因的分母 ============
  const rec = createPerfRecorder(page, {
    outDir: OUT, scenario: 'fx37-bestiary', traceStacks: false, topN: 20,
  });
  const segs = [];
  async function doSeg(name, kind, fn) {
    await front(page);
    await rec.startSegment(name, { kind });
    const ra = await resetAt(page);
    await fn();
    const seg = await rec.endSegment();
    const fo = await frameOver(page, ra);
    seg.framesOver = fo;
    seg.gfx = await gfxRead(page);
    segs.push(seg);
    console.log(`  seg ${name}: fps=${seg.fps.mean} p50=${seg.fps.p50} p95=${seg.fps.p95} max=${seg.fps.max}ms >20ms=${fo.over20}/${fo.n} >50ms=${fo.over50} getImageData=${seg.gfx.ms}ms/${seg.gfx.n}次 lt=${seg.longtasks.count}(${seg.longtasks.totalMs}ms)`);
    return seg;
  }
  await page.evaluate(() => { const g = window.__swGame; g.paused = true; g.input.uiBlocking = true; });
  await sleep(300);
  await doSeg('ref:render', 'dwell', () => sleep(2600));
  await page.evaluate(() => { const g = window.__swGame; g.paused = false; g.input.uiBlocking = false; });
  await sleep(200);

  console.log('== Phase A:全未解锁面 ==');
  await doSeg('fresh:open', 'open', async () => {
    await openPanel(page);
    await sleep(1200);   // 首帧头像 + 400ms 补画扫描
  });
  await doSeg('fresh:chips', 'interact', () => clickChips(page, 8, 110));
  await doSeg('fresh:pages', 'interact', () => wheelPages(page, 12, 70));
  await doSeg('fresh:details', 'interact', () => clickCells(page, 10, 90));
  await closePanel(page);

  // ============ 解锁到中期档(头像/染色/底图全链) ============
  const unlocked = await page.evaluate(function swFx37Unlock() {
    const b = window.__swGame?.world?.bestiary;
    if (!b) return { ok: false };
    // 1..200 敌怪杀满(50=full)→ DropsWithRates;小动物 sight 解锁;1..60 城镇 chat
    for (let n = 0; n < 50; n++) for (let id = 1; id <= 200; id++) b.registerKill(id);
    for (let id = 1; id <= 200; id++) b.registerSight(id);
    return { ok: true, kills: b.kills.size, sights: b.sights.size };
  });
  chk('解锁注入', unlocked.ok, `kills=${unlocked.kills} sights=${unlocked.sights}`);
  await sleep(300);

  // ============ Phase B:解锁面 ×3 轮(稳定面) ============
  for (let r = 1; r <= ROUNDS; r++) {
    console.log(`== Phase B round ${r}/${ROUNDS} ==`);
    await doSeg(`r${r}:open`, 'open', async () => {
      await openPanel(page);
      await sleep(1500);
    });
    await doSeg(`r${r}:chips`, 'interact', () => clickChips(page, 10, 110));
    await doSeg(`r${r}:pages`, 'interact', () => wheelPages(page, 14, 70));
    await doSeg(`r${r}:details`, 'interact', () => clickCells(page, 12, 90));
    await doSeg(`r${r}:idle`, 'dwell', () => sleep(2600));   // 静置:捕捉 400ms 补画扫描+基线渲染
    await closePanel(page);
  }

  // ============ Phase C:单拍微观计量(解锁面,面板开着) ============
  console.log('== Phase C:单拍微观 ==');
  await openPanel(page);
  await sleep(700);
  const micro = {};
  for (const k of ['chip', 'page', 'sel', 'search', 'filter']) {
    micro[k] = await microOp(page, k, 5);
  }
  // micro:open 突发分解(关→开×3;量 import/构造/首帧/尖峰/读回)
  await closePanel(page);
  micro.open = [];
  for (let i = 0; i < 3; i++) {
    micro.open.push(await page.evaluate(async function swFx37OpenBurst() {
      const G = window.__swFx37Gfx;
      const g = window.__swGame;
      await new Promise((r) => setTimeout(r, 150));
      G.ms = 0; G.n = 0;
      const t0 = performance.now();
      if (!window.__swFx37PanelCls) {
        window.__swFx37PanelCls = (await import('/src/ui/BestiaryPanel.ts')).BestiaryPanel;
      }
      const tImport = performance.now();
      g.paused = true; g.input.uiBlocking = true;
      window.__swFx37Panel = new window.__swFx37PanelCls(document.body, {
        getTracker: () => g.world.bestiary,
        atlas: g.atlas ?? g.renderer?.atlas ?? null,
        isCrimson: () => g.world.crimson ?? false,
        onBack: () => {},
      });
      const tConstruct = performance.now();
      let last = performance.now(), first = 0, maxGap = 0, frames = 0;
      await new Promise((resolve) => {
        function tick() {
          const now = performance.now();
          const dt = now - last;
          last = now;
          if (frames === 0) first = dt;
          else maxGap = Math.max(maxGap, dt);
          if (++frames >= 32) { resolve(); return; }   // ~530ms:覆盖首刷 + 400ms 补画扫描
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      return {
        tImport: +(tImport - t0).toFixed(2), tConstruct: +(tConstruct - tImport).toFixed(2),
        tFirst: +first.toFixed(2), maxGap: +maxGap.toFixed(2),
        gfxMs: +G.ms.toFixed(2), gfxN: G.n,
      };
    }));
    console.log(`  micro open[${i}]: import=${micro.open[i].tImport} construct=${micro.open[i].tConstruct} 首帧=${micro.open[i].tFirst} 32帧尖峰=${micro.open[i].maxGap} getImageData=${micro.open[i].gfxMs}ms/${micro.open[i].gfxN}次`);
    await closePanel(page);
    await sleep(150);
  }

  // ---------- 监听者/DOM 残留收口自证 ----------
  const residual = await page.evaluate(function swFx37Residual() {
    return {
      panels: document.querySelectorAll('.sw-bst').length,
      cells: document.querySelectorAll('.sw-bst-cell').length,
      canvasNodes: document.querySelectorAll('.sw-bst canvas').length,
    };
  });
  chk('面板关闭后 DOM 零残留', residual.panels === 0 && residual.cells === 0 && residual.canvasNodes === 0, JSON.stringify(residual));
  chk('页面零错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await removeFrameProbe(page);

  // ---------- 汇总 ----------
  mkdirSync(OUT, { recursive: true });
  const agg = {};
  for (const s of segs) {
    const key = s.name.replace(/^r\d+:/, '');
    (agg[key] ??= []).push(s);
  }
  const stat = (arr, f) => {
    const v = arr.map(f).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    return { min: +v[0].toFixed(2), med: +v[Math.floor(v.length / 2)].toFixed(2), max: +v[v.length - 1].toFixed(2) };
  };
  const summary = Object.fromEntries(Object.entries(agg).map(([k, arr]) => [k, {
    n: arr.length,
    fpsMean: stat(arr, (s) => s.fps.mean),
    p50: stat(arr, (s) => s.fps.p50),
    p95: stat(arr, (s) => s.fps.p95),
    max: stat(arr, (s) => s.fps.max),
    over20: stat(arr, (s) => (s.framesOver ? s.framesOver.over20 : 0)),
    over50: stat(arr, (s) => (s.framesOver ? s.framesOver.over50 : 0)),
    gfxMs: stat(arr, (s) => s.gfx?.ms ?? 0),
    longtaskMs: stat(arr, (s) => s.longtasks.totalMs),
    gcMs: stat(arr, (s) => s.gc?.totalMs ?? 0),
    layout: stat(arr, (s) => s.metrics?.delta?.LayoutCount ?? 0),
    recalcStyle: stat(arr, (s) => s.metrics?.delta?.RecalcStyleCount ?? 0),
    nodesDelta: stat(arr, (s) => s.metrics?.delta?.Nodes ?? 0),
    listenersDelta: stat(arr, (s) => s.metrics?.delta?.JSEventListeners ?? 0),
  }]));

  // Top 热点(interact 段聚合;排除框架注入/特殊节点)
  const hot = new Map();
  for (const s of segs) {
    if (s.kind !== 'interact') continue;
    for (const f of s.profile?.funcs ?? []) {
      if (f.framework || f.special) continue;
      const rec0 = hot.get(f.key) ?? { key: f.key, fn: f.fn, url: f.url, line: f.line, selfMs: 0 };
      rec0.selfMs += f.selfMs;
      hot.set(f.key, rec0);
    }
  }
  const topHot = [...hot.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 20)
    .map((h) => ({ ...h, selfMs: +h.selfMs.toFixed(1) }));

  const report = {
    ts: new Date().toISOString(), seed: SEED, rounds: ROUNDS, origin: ORIGIN,
    summary, micro, topHot, segments: segs, errors, residual,
  };
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const L = ['# SW-FX37 图鉴性能取证', '', `seed=${SEED} rounds=${ROUNDS}`, '',
    '| 段 | n | fps | 帧p50 | 帧p95 | 帧max | >20ms | >50ms | getImageData | 长任务ms | GC ms | Layout | Recalc | ΔNodes | ΔListener |',
    '|---|---|-----|-------|-------|-------|-------|-------|--------------|----------|-------|--------|--------|--------|-----------|'];
  for (const [k, v] of Object.entries(summary)) {
    L.push(`| ${k} | ${v.n} | ${v.fpsMean?.med ?? '-'} | ${v.p50?.med ?? '-'} | ${v.p95?.med ?? '-'} | ${v.max?.max ?? '-'} | ${v.over20?.med ?? '-'} | ${v.over50?.med ?? '-'} | ${v.gfxMs?.med ?? '-'} | ${v.longtaskMs?.med ?? '-'} | ${v.gcMs?.med ?? '-'} | ${v.layout?.med ?? '-'} | ${v.recalcStyle?.med ?? '-'} | ${v.nodesDelta?.med ?? '-'} | ${v.listenersDelta?.med ?? '-'} |`);
  }
  L.push('', '## 单拍微观(解锁面,面板开;5 拍中位)', '',
    '| 操作 | 首帧ms | 首帧max | 帧尖峰 | 尖峰max | getImageData | Δnodes |',
    '|------|--------|---------|--------|---------|--------------|--------|');
  for (const [k, v] of Object.entries(micro)) {
    if (k === 'open') {
      const tC = v.map((r) => r.tConstruct), tF = v.map((r) => r.tFirst), g = v.map((r) => r.maxGap);
      L.push(`| open(突发) | import+construct=${Math.max(...tC)} | - | 32帧尖峰 | ${Math.max(...g)} | ${v.map((r) => r.gfxMs).join('/')} | - |`);
      continue;
    }
    L.push(`| ${k} | ${v.tFirstMed} | ${v.tFirstMax} | ${v.maxGapMed} | ${v.maxGapMax} | ${v.gfxMsMed}/${v.gfxNMed} | ${v.nodesMed} |`);
  }
  L.push('', '## Top 热点(interact 段 self-time 合计)', '');
  L.push('| # | 函数 | 位置 | self ms |', '|---|------|------|---------|');
  topHot.forEach((h, i) => L.push(`| ${i + 1} | ${h.fn} | ${h.url}:${h.line} | ${h.selfMs} |`));
  const md = L.join('\n');
  writeFileSync(join(OUT, 'report.md'), md);
  console.log('\n' + md);

  const failed = ok.filter((v) => !v).length;
  console.log(`\n== ${ok.length - failed}/${ok.length} ==  产物: ${OUT}`);
  process.exitCode = failed ? 2 : 0;
} catch (e) {
  console.error('FX37 ERR:', e);
  try { await closeAllBrowsersSafe(); } catch { /* 收口 */ }
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
async function closeAllBrowsersSafe() {
  const { closeAllBrowsers } = await import('../tools/probe/lib/browser.mjs');
  await closeAllBrowsers();
}
