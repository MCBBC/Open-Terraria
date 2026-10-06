// 真存档复现探针 v5（人机协作）：探针只起有头窗口+采样；导入/进世界由用户手动。
// 运行：SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs scripts/_fps-savedworld-v5.mjs
// 操作提示打印后，请在弹出的浏览器窗口中手动完成：标题→单人→（选/建角色）→
// 世界列表→导入世界（选 map-Starter_World (38).json）→进入 Starter World。
// 探针检测到进世界后自动开始：静止 6s → 行走 20s 逐秒采样。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:4173');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: null, args: ['--window-size=1540,960', '--auto-open-devtools-for-window'] });
const page = (await browser.pages())[0] ?? await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL + '/?v5=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('==============================================================');
console.log('请在弹出的浏览器窗口中手动操作：');
console.log('  1. 标题 → 单人 → （选/新建角色）→ 世界列表');
console.log('  2. 点「导入世界」选择 /Users/vinlic/Downloads/map-Starter_World (38).json');
console.log('  3. 进入 Starter World');
console.log('探针检测到进世界后自动开始采样（最多等 10 分钟）');
console.log('==============================================================');

await page.waitForFunction(() => {
  const g = window.__swGame;
  return !!(g && g.player && g.world?.store?.w > 0);
}, { timeout: 600000, polling: 1000 });
console.log('=== 检测到已进入世界，3s 后开始采样 ===');
await sleep(3000);
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn, div')].find((e) => /我已知晓|已知/.test(e.textContent ?? '') && e.children.length === 0);
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }
console.log(await page.evaluate(() => {
  const g = window.__swGame;
  return JSON.stringify({ w: g.world.store.w, h: g.world.store.h, night: !g.world.clock.isDay, player: [Math.round(g.player.x / 16), Math.round(g.player.y / 16)] });
}));

// 采样 rig 注入
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
// 静止 6s
const s0 = await page.evaluate('window.__shimSnap()');
for (let w = 0; w < 6; w++) {
  const f = await page.evaluate(fpsFor(1000));
  console.log(`静止 t=${w + 1}s fps=${f.n}`);
}
const s1 = await page.evaluate('window.__shimSnap()');
const sd = diffAgg(s0, s1);
console.log(`静止段 degradeΔ(${sd.tot}):`, JSON.stringify(sd.d));
// 行走 22s：按住右（不改玩家位置——自然走用户地形）
await page.evaluate(`window.__swGame.input.keys.add('ArrowRight'); 'walking'`);
for (let w = 0; w < 22; w++) {
  const f = await page.evaluate(fpsFor(1000));
  const sNow = await page.evaluate('window.__shimSnap()');
  const { d, tot } = diffAgg(s1, sNow);
  const fl = sNow.reduce((a, x) => a + x.fl, 0) - s1.reduce((a, x) => a + x.fl, 0);
  const fb = sNow.reduce((a, x) => a + x.fb, 0) - s1.reduce((a, x) => a + x.fb, 0);
  const pos = await page.evaluate('JSON.stringify({x:Math.round(window.__swGame.player.x/16), y:Math.round(window.__swGame.player.y/16)})');
  const dstr = Object.entries(d).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
  console.log(`行走 t=${w + 1}s fps=${f.n} p=${pos} flushΔ=${fl} fbΔ=${fb} degradeΔ(${tot})=${dstr}`);
}
const sEnd = await page.evaluate('window.__shimSnap()');
console.log('\n=== degradeCallers 终账 ===');
for (const sh of sEnd) {
  const top = Object.entries(sh.callers ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [k, v] of top) console.log(`[${sh.f}] ${k} = ${v}`);
}
console.log('\npageerrors:', errors.slice(0, 6));
console.log('=== 采样完毕，窗口可关 ===');
await browser.close();
