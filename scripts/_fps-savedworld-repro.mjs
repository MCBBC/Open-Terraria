// 真存档复现探针 v2（2026-10-07 用户实报掉帧：出生点往右走一段出现）。
// 与上一版差异：走游戏真实「导入世界」UI 把用户 Starter World 存档落库→进世界→
// 出生点向右自然行走，逐秒对齐 fps 与 GLShimExecutor.degradeOps/flushes 账。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-savedworld-repro.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-Starter_World (38).json';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173') + '/?savedrepro=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1540,920'] });
const page = (await browser.pages())[0] ?? await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

// ---- 标题 → 世界选择 ----
async function clickText(re, tag = 'button, [role=button], .sw-btn, div, span') {
  const ok = await page.evaluate((reSrc, tagSel) => {
    const re = new RegExp(reSrc);
    const el = [...document.querySelectorAll(tagSel)].find((e) => re.test((e.textContent ?? '').trim()) && (e.offsetParent !== null || e.getClientRects().length));
    if (el) { el.click(); return (el.textContent ?? '').trim().slice(0, 30); }
    return null;
  }, re.source, tag);
  if (ok) console.log(`点击[${tag}]: ${ok}`);
  return ok;
}
await new Promise((r) => setTimeout(r, 1200));
console.log('--- 标题层 ---');
if (!(await clickText('单人|单机|Single'))) { console.log('未找到单人钮——截图排查'); }
await new Promise((r) => setTimeout(r, 1500));
console.log('--- 角色层（若有） ---');
await clickText('选择|继续|使用|确认|新角色|新建');
await new Promise((r) => setTimeout(r, 1200));
console.log('--- 世界层 ---');
// 导入世界（隐藏 file input）
const fileInput = await page.$('input[type=file]');
if (fileInput) {
  await fileInput.uploadFile(SAVE);
  console.log('已提交存档文件到导入 input');
  await new Promise((r) => setTimeout(r, 6000));   // 落库+列表刷新
} else {
  console.log('未见 input[type=file]——尝试直接点导入钮再选');
  await clickText('导入');
  await new Promise((r) => setTimeout(r, 1500));
  const fi2 = await page.$('input[type=file]');
  if (fi2) { await fi2.uploadFile(SAVE); await new Promise((r) => setTimeout(r, 6000)); }
}
// 进世界：点 Starter World 列表项（可能需先选角色）
await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => /Starter World/.test(e.textContent ?? '') && e.children.length === 0);
  if (el) { el.click(); }
});
await new Promise((r) => setTimeout(r, 2000));
// 可能出现确认/进入按钮
await clickText('进入|开始|游玩|选择|创建');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 240000, polling: 500 });
console.log('=== 已进入世界 ===');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
  if (b) b.click();
});
// 场景确认
console.log(await page.evaluate(() => {
  const g = window.__swGame;
  return JSON.stringify({ w: g.world.store.w, h: g.world.store.h, night: !g.world.clock.isDay, player: [Math.round(g.player.x / 16), Math.round(g.player.y / 16)] });
}));

// ---- shim 账 + 采样 rig ----
await page.evaluate(`(window.__shimSnap = () => {
  const r = window.__swGame.renderer, out = [];
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v && v.constructor && v.constructor.degradeOps) {
      out.push({ f: k, fb: v.stats?.fallback ?? 0, fl: v.stats?.flushes ?? 0, dr: v.stats?.draws ?? 0,
        ops: { ...v.constructor.degradeOps }, callers: { ...v.constructor.degradeCallers } });
    }
  }
  return out;
})()`);
const fpsFor = (ms) => `new Promise((res) => { let n = 0; const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick); else res({ n, ms: performance.now() - t0 }); };
  requestAnimationFrame(tick); })`;
const diffAgg = (a, b) => {
  const d = {}; let tot = 0;
  for (let i = 0; i < a.length; i++) {
    for (const op of new Set([...Object.keys(a[i]?.ops ?? {}), ...Object.keys(b[i]?.ops ?? {})])) {
      const dv = (b[i]?.ops?.[op] ?? 0) - (a[i]?.ops?.[op] ?? 0);
      if (dv > 0) { d[op] = (d[op] ?? 0) + dv; tot += dv; }
    }
  }
  return { d, tot };
};
// 静止 6s（读档后基线）
const s0 = await page.evaluate('window.__shimSnap()');
for (let w = 0; w < 6; w++) {
  const f = await page.evaluate(fpsFor(1000));
  console.log(`静止 t=${w + 1}s fps=${f.n}`);
}
const s1 = await page.evaluate('window.__shimSnap()');
const sd = diffAgg(s0, s1);
console.log(`静止段 degradeΔ(${sd.tot}):`, JSON.stringify(sd.d));

// 行走 18s（出生点向右——用户配方）
await page.evaluate(`window.__swGame.input.keys.add('ArrowRight'); 'walking'`);
for (let w = 0; w < 18; w++) {
  const f = await page.evaluate(fpsFor(1000));
  const sNow = await page.evaluate('window.__shimSnap()');
  const { d, tot } = diffAgg(s1, sNow);
  const fl = sNow.reduce((a, x) => a + x.fl, 0) - s1.reduce((a, x) => a + x.fl, 0);
  const fb = sNow.reduce((a, x) => a + x.fb, 0) - s1.reduce((a, x) => a + x.fb, 0);
  const px = await page.evaluate('Math.round(window.__swGame.player.x/16)');
  const dstr = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
  console.log(`行走 t=${w + 1}s fps=${f.n} x=${px} flushΔ=${fl} fbΔ=${fb} degradeΔ(${tot})=${dstr}`);
}
const sEnd = await page.evaluate('window.__shimSnap()');
console.log('\n=== degradeCallers 终账 ===');
for (const sh of sEnd) {
  const top = Object.entries(sh.callers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of top) console.log(`[${sh.f}] ${k} = ${v}`);
}
console.log('\npageerrors:', errors.slice(0, 6));
await browser.close();
