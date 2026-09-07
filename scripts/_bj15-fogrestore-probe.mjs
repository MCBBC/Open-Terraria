// 探针（SW-BJ15 2026-09-07）：Shift+F4 全图迷雾消除→恢复切换实测。
// 链路：真实按键 → 首用确认门（点"确认启用"）→ 消除 → 再按 → 恢复。
// 断言：位图逐字节等价（恢复前 vs 恢复后）、版本 bump（渲染端整幅重建失效标记）、
// 快照槽清理、雾缓冲实际回填（ensureFogData 产物）。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(URL + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.renderer, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1800));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? '  [' + detail + ']' : ''}`); ok ? pass++ : fail++; };

// 位图指纹：{count(explored=1), md5-ish 校验和, 字节串采样}
const snap = () => page.evaluate(() => {
  const w = window.__swGame.world;
  const ex = w.explored;
  let count = 0, sum = 0;
  for (let i = 0; i < ex.length; i++) { if (ex[i]) count++; sum = (sum + ex[i] * (i % 97 + 1)) % 4294967296; }
  return { count, sum, ver: w.exploredVersion, snap: !!w.exploredRevealSnapshot, len: ex.length };
});

const pressShiftF4 = async () => {
  await page.keyboard.down('Shift');
  await page.keyboard.press('F4');
  await page.keyboard.up('Shift');
  await new Promise((r) => setTimeout(r, 150));
  // 首用确认门：若弹窗在，点"确认启用"
  const gate = await page.evaluate(() => !!document.getElementById('sw-journeyquick-gate-fog'));
  if (gate) {
    const btns = await page.$$('button');
    for (const b of btns) {
      const t = await b.evaluate((el) => el.textContent);
      if (t === '确认启用') { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return gate;
};

const before = await snap();
check('初始有正常探索态（部分点亮）', before.count > 0 && before.count < before.len, `count=${before.count}/${before.len}`);
check('初始无快照', before.snap === false);

// ---- 第一次 Shift+F4：消除 ----
const gated = await pressShiftF4();
console.log(`  (首用确认门弹出: ${gated})`);
const revealed = await snap();
check('消除后全图点亮', revealed.count === revealed.len, `count=${revealed.count}/${revealed.len}`);
check('消除后持有快照', revealed.snap === true);
check('消除后版本 bump', revealed.ver > before.ver, `${before.ver} -> ${revealed.ver}`);

// 消除态停留 600ms（玩家继续模拟,雾缓存整幅重建推进）后按恢复
await new Promise((r) => setTimeout(r, 600));
// ---- 第二次 Shift+F4：恢复 ----
await pressShiftF4();
const restored = await snap();
check('恢复后位图等价于消除前', restored.count === before.count && restored.sum === before.sum,
  `count ${restored.count} vs ${before.count}, sum ${restored.sum} vs ${before.sum}`);
check('恢复后快照已释放', restored.snap === false);
check('恢复后版本再 bump', restored.ver > revealed.ver, `${revealed.ver} -> ${restored.ver}`);

// ---- 渲染端雾缓存收敛：ensureFogData 版本追平 + 未探索区确实回填雾色 ----
await new Promise((r) => setTimeout(r, 900));   // 分带重建(120行/帧)推进完
const fog = await page.evaluate(() => {
  const r = window.__swGame.renderer, w = window.__swGame.world;
  const proto = Object.getPrototypeOf(r);
  const ensure = proto.ensureFogData;
  ensure.call(r, w);   // 空转一帧（实际每帧 render 已在调）
  const pix = r.fogPix, p32 = r.fogP32, FOG = 0xff080505;
  let fogCells = 0, litCells = 0;
  if (p32) for (let i = 0; i < p32.length; i++) { if (p32[i] === FOG) fogCells++; else if (p32[i] === 0) litCells++; }
  return { fogVer: r.fogVersion, worldVer: w.exploredVersion, fogCells, litCells, hasPix: !!pix };
});
check('雾缓存版本追平（恢复已触发整幅重建并完成）', fog.fogVer === fog.worldVer, `fog=${fog.fogVer} world=${fog.worldVer}`);
check('雾缓冲含未探索雾格', fog.fogCells > 0, `fogCells=${fog.fogCells} litCells=${fog.litCells}`);

// ---- 第三次 Shift+F4：恢复后再消除（切换可循环）----
await pressShiftF4();
const revealed2 = await snap();
check('循环：再次消除成功', revealed2.count === revealed2.len && revealed2.snap === true);
await pressShiftF4();
const restored2 = await snap();
check('循环：再次恢复位图等价', restored2.count === before.count && restored2.sum === before.sum,
  `count=${restored2.count}`);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
