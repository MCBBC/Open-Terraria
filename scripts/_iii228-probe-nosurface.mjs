// IIIII228 探针（运行时债 A 组清偿）：
//   ①remix 刷怪率臂（深岩 0.5/1.7 + 血月 0.3/1.8 + 深岩软化 0.6 → clamp 60）+ 经典翻转对照（零扰动）
//   ②StatusFromNPC 全表 type 臂（木乃伊 78 → Slow 900t=15s；141 毒泥 → Poisoned 10s）
//   ③魔法海螺 RequestMagicConchTeleportPosition（左右洋两向落点带）
//   ④商店 remix 抑制门（树妖净化粉 66 旗驱剔补）+ 公主 tenth 臂
//   ⑤noSurface 世界 DoNoSurfaceFillTheTop 顶带填充普查（mole people 独立世界）
// 用法:SW_ORIGIN=http://localhost:5284 node tools/run-diag.mjs scripts/_iii228-probe-nosurface.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld("don't dig up", 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

// ── ⑤noSurface 世界（FillTheTop 顶带填充）——先退回标题再建第二世界 ──
await page.evaluate(() => window.__swFlow.quitToMenu());
await page.waitForFunction(() => !window.__swGame, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('mole people', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.seedFlags?.noSurface, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out2 = await page.evaluate(() => {
  const w = window.__swGame.world;
  const st = w.store;
  const R = [];
  const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
  let activeTop = 0, total = 0;
  for (let x = 100; x < 4100; x += 7) {
    for (let y = 10; y < 60; y++) {
      total++;
      if (st.flags[st.idx(x, y)] & 1) activeTop++;
    }
  }
  chk('⑤noSurface 顶带填充普查（rows 10-60 大量活性格）', activeTop / total > 0.5, `ratio=${(activeTop / total).toFixed(3)}`);
  chk('⑤noSurface 种子旗确认', w.seedFlags.noSurface === true);
  return R;
});

console.log([...out, ...out2].join('\n'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
const all = [...out, ...out2];
const fails = all.filter((l) => l.startsWith('FAIL'));
console.log(fails.length ? `RESULT: ${fails.length} FAIL` : 'RESULT: ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
