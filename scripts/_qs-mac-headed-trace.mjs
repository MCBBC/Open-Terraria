// ★QS-Mac 对照面(任务#16):本机有头 Chrome 召唤皇后史莱姆(NPC 657)采战斗 trace
//   与 Windows Trace-20261010T225221 三元凶(getError 33.6ms GL 队列/SM2 fit GC 风暴/
//   LightWorker 91%)对表。
//   语义:真 GPU 路径(headed + ANGLE/Metal,III248 先例)、boss 战斗 AI+小怪+凝胶弹幕
//   45s、玩家 godmode 站桩(免死亡断链;Windows 面含玩家输出,此处取 boss 侧负载共性)。
//   trace = CDP Tracing(ReportEvents + enableSampling,含 .stack 类目)→ ProfileChunk
//   落盘,与 DevTools 导出同构(trace-x-ray/stall-window 族直读)。
import { writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, godMode, spawnEnemy,
  saveCanvasShot, TRACE_CATEGORIES } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FIGHT_MS = Number(process.env.QS_FIGHT_MS || 45000);
const OUT = process.env.QS_OUT || '/Users/vinlic/.claude/jobs/d3098226/tmp/qs-mac-trace.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({
  headed: true,
  viewport: { width: 1600, height: 900 },
  extraArgs: ['--use-gl=angle', '--use-angle=metal'],
});
const errs = [];
try {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  await bootstrap(page, ORIGIN + '/');
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await godMode(page, true);
  await sleep(2500);   // 入场稳定(烘焙洪峰出计量窗)

  // 轻量 rAF 计数(战斗期 realized fps 旁证;不装 evaluateOnNewDocument 大框架)
  await page.evaluate(() => {
    window.__swQs = { n: 0, t0: performance.now() };
    const tick = () => { window.__swQs.n++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const fps0 = await page.evaluate(() => window.__swQs.n);
  console.log('BASELINE rAF frames in 2.5s window ≈', fps0);

  // trace 开录
  const client = await page.createCDPSession();
  const events = [];
  client.on('Tracing.dataCollected', (d) => {
    const v = d.value;
    if (Array.isArray(v)) { for (const e of v) events.push(e); } else if (v) events.push(v);
  });
  await client.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      recordMode: 'record-continuously',
      // +v8.cpu_profiler:ProfileChunk 落盘的前置类目(DevTools 导出面同款;缺它
      //   enableSampling 只出 v8 计数不出样本——首采 0 样本判例)
      includedCategories: [...TRACE_CATEGORIES, 'disabled-by-default-v8.cpu_profiler'],
      excludedCategories: [],
      enableSampling: true,
    },
  });
  const tStart = Date.now();

  // 召唤:玩家右侧 200px / 上方 100px(盒中心口径,spawnEnemy 坑表 I1)
  const p = await page.evaluate(() => { const g = window.__swGame; return { x: g.player.x, y: g.player.y }; });
  const meta = await spawnEnemy(page, 657, p.x + 200, p.y - 100);
  console.log('SPAWN', JSON.stringify(meta));
  if (!meta?.ok) { console.log('spawn failed — abort'); await browser.close(); process.exit(1); }

  // 战斗窗:每 5s 采样 boss hp/实体数/rAF realized fps
  for (let t = 5000; t <= FIGHT_MS; t += 5000) {
    await sleep(5000);
    const st = await page.evaluate(() => {
      const g = window.__swGame, en = g.entities.enemies ?? [];
      const q = window.__swQs;
      const now = performance.now();
      const fps = (q.n * 1000) / (now - q.t0);
      q.n = 0; q.t0 = now;
      return {
        fps: +fps.toFixed(1),
        enemies: en.length,
        bossHp: en.find((e) => e.vanillaId === 657 || e.vid === 657)?.hp ?? null,
        projs: (g.entities.projectiles ?? []).length,
      };
    });
    console.log(`T+${t / 1000}s`, JSON.stringify(st));
  }

  // 收 trace:排空(报告模式 dataCollected 可能晚于 tracingComplete 数百 ms)
  const complete = new Promise((r) => client.once('Tracing.tracingComplete', r));
  await client.send('Tracing.end');
  await complete;
  await sleep(800);
  client.removeAllListeners('Tracing.dataCollected');
  await client.detach().catch(() => {});
  console.log('TRACE events =', events.length, 'wall =', ((Date.now() - tStart) / 1000).toFixed(1) + 's');

  // ★刀①②终态统计(lwbp 跳发率=worker 消化压力直读;light/wave posted 对账)——
  //   动态 import 必须在【页内】evaluate(脚本侧 import 解析到 node,页模块域不通)
  try {
    const stats = await page.evaluate(async () => {
      const lw = await import('/src/lighting/LightWorkerLink.ts');
      const ww = await import('/src/render/WaterWaves.ts');
      const lws = lw.lightWorkerStats();
      const wws = ww.wwWorkerStats();
      return {
        lw: { posted: lws.posted, results: lws.results, bpSkips: lws.bpSkips, falls: lws.falls, fmt: lws.fmt },
        ww: { posted: wws.posted, fields: wws.fields, bpSkips: wws.bpSkips, quietSkips: wws.quietSkips, falls: wws.falls },
      };
    });
    console.log('LWSTAT', JSON.stringify(stats.lw));
    console.log('WWSTAT', JSON.stringify(stats.ww));
  } catch (e) { console.log('STATS unavailable:', String(e?.message ?? e).slice(0, 120)); }
  writeFileSync(OUT, JSON.stringify({ metadata: { probe: 'qs-mac-headed-trace', origin: ORIGIN, fightMs: FIGHT_MS }, traceEvents: events }));
  console.log('WROTE', OUT);

  await saveCanvasShot(page, '/Users/vinlic/.claude/jobs/d3098226/tmp/qs-mac-fight.png');
} finally {
  await browser.close().catch(() => {});
}
if (errs.length) console.log('PAGEERRORS', errs.slice(0, 6));
