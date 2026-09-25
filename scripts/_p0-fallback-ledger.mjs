// ★P0 回退路径去毒 验收探针（2026-09-25;_b1-world-ab 页内范式）。
// 定谳背景（trace 2026-09-25）:GL 世界批把 2D 回退路径的画布后备整体降成 CPU/SHM
// （PAGE_WRF=bgl 旗耦合 + worldCanvas WRF）,而该会话 GL 世界路径未介入 → 每帧
// 260 drawImage 落软件光栅（单 op 5.4µs→36-66µs=7-12×）,渲染帧 5.1→26.7ms。
// 判据:
//   A. 「SHM 慢路径」判别器:页画布 9 参 drawImage 单价 GPU vs WRF(SHM) 双臂
//      ——GPU ≤ 10µs/op(验收线);SHM 臂复现 36-66µs 病灶量级。
//   B. 健康态路径账:bgl 路径全 GL('world-gl-*'/'b2b-acc*');cloudPathStats='cloudpipe';
//      worldCompose lreconUsable()=true;b2bWorldCanvasCreations 稳态 0。
//   C. 闩指纹矩阵:
//      C1 rawBroken 预检:wc._rawBroken=true → 路径 'lrecon-skip:guard:rawBroken'
//         (预检生效=CPU 重建前知情,不再每帧 compose 进入+guard 早退双付费)
//      C2 闩解除自愈:_rawBroken=false → 路径回 'lrecon*'。
//   D. 帧耗对照(bgl 正常态 vs 强制 2D 回退态,页恒 GPU 后备):回退态 ≤ 正常态+3ms
//      ——回退路径恢复"可用"级(病灶会话 26.7ms→验收 ≤8ms 渲染帧)。
//   E. merged 全幅 blit 单价定谳(备案面):drawImage(GL 画布→主 ctx) 单 op µs。
//   F. 雨 miss 克隆池:池冷启动后 createElement 停增(淘汰回池/取池闭环)。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_p0-fallback-ledger.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 页内工具面 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const glStats = await import('/src/render/GLStats.ts');
  window.__R = () => g.renderer;
  window.__bglSet = (v) => g.renderer.constructor.bglSetForTest(v);
  window.__ledger = () => {
    const r = g.renderer;
    const wc = r['worldCompose'];
    return {
      bglPathUsed: r.bglPathUsed,
      bglPathStats: { ...r.bglPathStats },
      b2bCreations: r.b2bWorldCanvasCreations,
      opresentStats: { ...r.opresentStats },
      cloudPathStats: { ...r.cloudPathStats },
      composePathUsed: r.composePathUsed,
      composePathStats: { ...r.composePathStats },
      composeLastFail: r.composeLastFail,
      lreconUsable: wc ? wc.lreconUsable() : null,
      starvedEver: glStats.starvedEver(),
      accMode: r['_accMode'],
    };
  };
});
// 停 rAF 主循环——渲染全权由 g.frame(vnow) 同步驱动
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.renderScale = 1;
}));
await pump(page, 40);
async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
await waitFrame(8);

// ---- A. SHM 慢路径判别器:页画布 9 参 drawImage 单价双臂 ----
//   修后回退态 = GPU 页→GPU worldCanvas;病灶态 = WRF 页→WRF worldCanvas（双双降
//   SHM——用户会话真实形态）。Canvas2D 是 display-list:逐 op 计时只测到 recording
//   (~0.3µs)——必须批 260 op(≙drawChunkGrid 每帧 op 数)+1 次 getImageData 强制
//   flush 物化,再摊到单 op。两臂 flush 开销同型,差值=SHM 慢路径判别量。
const opUs = await page.evaluate(() => {
  const mk = (wrf) => {
    const c = document.createElement('canvas');
    c.getContext('2d', wrf ? { willReadFrequently: true } : undefined);
    c.width = 1024; c.height = 1024;
    const x = c.getContext('2d', wrf ? { willReadFrequently: true } : undefined);
    x.fillStyle = 'rgb(190,170,150)';
    for (let i = 0; i < 256; i++) x.fillRect((i % 16) * 64, ((i / 16) | 0) * 64, 60, 60);   // 烘焙态内容
    return c;
  };
  const pageGPU = mk(false), pageSHM = mk(true);
  const dstGPU = document.createElement('canvas');
  dstGPU.width = 512; dstGPU.height = 512;
  const gctx = dstGPU.getContext('2d');   // GPU dest ≙ worldCanvas(修后)
  const dstSHM = document.createElement('canvas');
  dstSHM.getContext('2d', { willReadFrequently: true });
  dstSHM.width = 512; dstSHM.height = 512;
  const sctx = dstSHM.getContext('2d', { willReadFrequently: true });   // SHM dest ≙ worldCanvas(WRF 病灶)
  const bench = (src, ctx, dstCv) => {
    for (let i = 0; i < 26; i++) {   // 预热 2 轮
      ctx.drawImage(src, (i % 4) * 256, 0, 256, 256, (i % 2) * 256, 0, 256, 256);
      if (i % 13 === 12) ctx.getImageData(0, 0, 1, 1);
    }
    const ROUNDS = 10, OPS = 260;
    const t0 = performance.now();
    for (let r0 = 0; r0 < ROUNDS; r0++) {
      for (let i = 0; i < OPS; i++) ctx.drawImage(src, (i % 4) * 256, 0, 256, 256, (i % 2) * 256, 0, 256, 256);
      ctx.getImageData(0, 0, 1, 1);   // 强制物化（flush 含栅格化;两臂同型）
    }
    void dstCv;
    return (performance.now() - t0) / ROUNDS / OPS * 1000;   // µs/op(含 flush 摊销)
  };
  const gpu = bench(pageGPU, gctx, dstGPU);
  const shm = bench(pageSHM, sctx, dstSHM);
  return { gpu, shm };
});
console.log(`[A] 页画布单 op(flush 摊销): GPU→GPU=${opUs.gpu.toFixed(1)}µs  SHM→SHM=${opUs.shm.toFixed(1)}µs  倍率=${(opUs.shm / Math.max(opUs.gpu, 0.01)).toFixed(1)}×`);
chk('[A] GPU 页单 op ≤10µs（回退路径单 op 验收线）', opUs.gpu <= 10, `${opUs.gpu.toFixed(1)}µs`);
chk('[A] SHM 慢路径判别器成立（SHM 臂 ≥3× GPU 臂）', opUs.shm >= opUs.gpu * 3, `${opUs.shm.toFixed(1)}µs vs ${opUs.gpu.toFixed(1)}µs`);

// ---- B. 健康态路径账 ----
const ledB = await page.evaluate(() => window.__ledger());
console.log('[B] 健康态账面', JSON.stringify(ledB));
const glPaths = Object.entries(ledB.bglPathStats).filter(([k]) => k.startsWith('world-gl-') || k.startsWith('b2b-acc')).reduce((s, [, v]) => s + v, 0);
const d2Paths = Object.entries(ledB.bglPathStats).filter(([k]) => k.startsWith('world-2d-')).reduce((s, [, v]) => s + v, 0);
chk('[B] 健康态:世界格段全 GL（2D 段=0）', glPaths > 0 && d2Paths === 0, `gl=${glPaths} 2d=${d2Paths} last=${ledB.bglPathUsed}`);
chk('[B] 健康态:云会话=cloudpipe（共管活）', (ledB.cloudPathStats.cloudpipe || 0) > 0 && (ledB.cloudPathStats['2d'] || 0) === 0,
  JSON.stringify(ledB.cloudPathStats));
chk('[B] 健康态:lreconUsable=true', ledB.lreconUsable === true, `usable=${ledB.lreconUsable}`);
// b2b 建面=窗内零增量（稳态 acc 不建 worldCanvas;启动期一次性建面不算现势病灶）
await waitFrame(30);
const ledB2 = await page.evaluate(() => window.__ledger());
chk('[B] 健康态:b2b 建面稳态零增量', ledB2.b2bCreations === ledB.b2bCreations,
  `creations=${ledB2.b2bCreations} (窗前=${ledB.b2bCreations})`);

// ---- C. 闩指纹矩阵 ----
// C1 rawBroken 预检（P0 闩位收口刀的行为面）
const c1 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const wc = r['worldCompose'];
  wc['_rawBroken'] = true;
  return true;
});
await waitFrame(3);
const ledC1 = await page.evaluate(() => window.__ledger());
console.log('[C1] rawBroken 置位后', JSON.stringify({ composePathUsed: ledC1.composePathUsed, stats: ledC1.composePathStats, usable: ledC1.lreconUsable, lastFail: ledC1.composeLastFail }));
// 判据读 composePathStats(累计面)——composePathUsed 只留帧内最后一次 mark
// (skip 后 CPU 重建+A2 会覆写为 'a2',与旧 fail 路径同账面行为)
chk('[C1] rawBroken→预检 skip 路径(不再 compose 进入+guard 早退双付费)',
  ledC1.lreconUsable === false
  && (ledC1.composePathStats['lrecon-skip:guard:rawBroken'] || 0) > 0
  && ledC1.composeLastFail === 'guard:rawBroken',
  `skipCount=${ledC1.composePathStats['lrecon-skip:guard:rawBroken'] || 0} lastFail=${ledC1.composeLastFail}`);
// C2 闩解除自愈
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  r['worldCompose']['_rawBroken'] = false;
});
await waitFrame(3);
const ledC2 = await page.evaluate(() => window.__ledger());
chk('[C2] 闩解除→lreconUsable 恢复+路径回 GL 合成', ledC2.lreconUsable === true && /^(lrecon|a2|oldchain)/.test(ledC2.composePathUsed),
  `usable=${ledC2.lreconUsable} path=${ledC2.composePathUsed}`);

// ---- D. 帧耗对照:bgl 正常态 vs 强制 2D 回退态(页恒 GPU 后备) ----
async function frameTiming() {
  return page.evaluate(() => {
    const g = window.__swGame;
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    }
    return (performance.now() - t0) / 60;
  });
}
await page.evaluate(() => window.__bglSet(true));
await waitFrame(6);
const msGl = await frameTiming();
await page.evaluate(() => window.__bglSet(false));
await waitFrame(6);
const ms2d = await frameTiming();
await page.evaluate(() => window.__bglSet(true));
await waitFrame(6);
console.log(`[D] 渲染帧: GL正常态=${msGl.toFixed(2)}ms  2D回退态(GPU页)=${ms2d.toFixed(2)}ms`);
chk('[D] 回退态渲染帧 ≤8ms（病灶会话 26.7ms→验收线）', ms2d <= 8, `${ms2d.toFixed(2)}ms`);
chk('[D] 回退态 ≤ GL 正常态+3ms（分级回退不塌方）', ms2d <= msGl + 3, `Δ=${(ms2d - msGl).toFixed(2)}ms`);

// ---- E. merged 全幅 blit 单价定谳（C10b 备案面:trace 值 5.44ms/帧 vs 健康单价）----
const mergeBlit = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const gl = r['cloudPipeLayer'];
  const main = r.canvas;
  const mctx = main.getContext('2d');
  if (!gl || !gl.canvas || gl.canvas.width === 0) return -1;
  mctx.drawImage(gl.canvas, 0, 0);   // 预热
  mctx.getImageData(0, 0, 1, 1);     // 预热 flush
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) mctx.drawImage(gl.canvas, 0, 0);
  mctx.getImageData(0, 0, 1, 1);     // 强制物化（1 次 flush 摊 60 op）
  return (performance.now() - t0) / 60;
});
console.log(`[E] merged 全幅 blit 单价=${mergeBlit < 0 ? 'N/A(无云会话)' : (mergeBlit * 1000).toFixed(0) + 'µs'}（trace 病灶值 5440µs）`);
chk('[E] 健康态 merged blit 单价 ≤2ms（60× 病灶=环境性,非设计成本）', mergeBlit >= 0 && mergeBlit <= 2, `${(mergeBlit * 1000).toFixed(0)}µs`);

// ---- F. 雨 miss 克隆池:池闭环（淘汰回池→取池→createElement 停增）----
const pool = await page.evaluate(async () => {
  const m = await import('/src/render/WeatherRenderer.ts');
  const wr = new m.WeatherRenderer();
  let creates = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...a) => { if (String(tag).toLowerCase() === 'canvas') creates++; return orig(tag, ...a); };
  const src = orig('canvas'); src.width = 2; src.height = 40;
  const sctx = src.getContext('2d'); sctx.fillStyle = '#89c'; sctx.fillRect(0, 0, 2, 40);
  const gen = () => src;
  try {
    for (let i = 0; i < 4200; i++) wr['bakeMemoized']('k' + i, gen);   // 越过 CAP=4096 触发内部淘汰
    const afterFill = creates;
    for (let i = 4200; i < 4300; i++) wr['bakeMemoized']('k' + i, gen);   // 稳态 miss:淘汰回池+取池
    return { afterFill, afterSteady: creates, cap: m.WeatherRenderer.BAKE_MEMO_CAP };
  } finally {
    document.createElement = orig;
  }
});
console.log(`[F] 克隆池: 冷启动 createElement=${pool.afterFill}（CAP=${pool.cap}+1 src）, 稳态 100 miss 后=${pool.afterSteady}`);
chk('[F] 池闭环:稳态 miss 不再 createElement', pool.afterSteady === pool.afterFill, `Δ=${pool.afterSteady - pool.afterFill}`);

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
