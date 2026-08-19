// contextlost 失效扫验证:载入存档→驱动 tintAtlas/墓碑→合成 contextlost→
// 断言全部写一次缓存清零 + 下一帧玩家仍在画面(截图亮度非全黑)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/ctxlost-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const prep = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer;
  g.player.x = 383 * 16; g.player.y = 254 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  let tex = null;
  for (let k = 0; k < 6 && !tex; k++) {
    tex = r.atlas?.ensureVImage?.('vanilla/NPC_1.png') ?? g.atlas?.ensureVImage?.('vanilla/NPC_1.png') ?? null;
    if (!tex) await new Promise((res) => setTimeout(res, 1000));
  }
  for (let i = 0; i < 5; i++) r.tintedSprite(`sweep${i}`, { img: tex, sx: i * 42, sy: 0, sw: 42, sh: 56 }, [i * 40, 60, 120]);
  return { entries: r.tintAtlas.size, pages: r.tintAtlas.pageCount };
});
console.log('[前置]', JSON.stringify(prep));
// 合成 contextlost(冒泡到 window 捕获监听也覆盖主画布直挂监听)
const after = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  r.canvas.dispatchEvent(new Event('contextlost'));
  return { entries: r.tintAtlas.size, pages: r.tintAtlas.pageCount };
});
console.log('[contextlost 后]', JSON.stringify(after));
await new Promise((r) => setTimeout(r, 2500));
// 重驱动应重新入图集(自愈)
const reheal = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  return { entries: r.tintAtlas.size, pages: r.tintAtlas.pageCount, cloudGL: !!r.sky.cloudGL };
});
console.log('[2.5s 后自愈]', JSON.stringify(reheal));
const fs = await import('node:fs');
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) fs.writeFileSync('/Users/vinlic/.claude/jobs/8405c930/tmp/ctxlost.png', shot);
await browser.close();
