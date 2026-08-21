import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/rg',
  args: ['--no-first-run', '--use-gl=angle'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  // waterWaves 是 Renderer 内部模块引用——查暴露
  const ww = r.waterWaves;
  if (!ww) return { error: 'no waterWaves on renderer' };
  const st = g.world.store;
  let wx = 0, wy = 0;
  for (let y = 200; y < 350; y++) {
    let run = 0;
    for (let x = 300; x < 600; x++) {
      if (st.liquid[st.idx(x, y)] > 200 && !st.isSolid(x, y - 1)) {
        run++;
        if (run >= 20) { wx = x - 10; wy = y; break; }
      } else run = 0;
    }
    if (wx) break;
  }
  g.player.x = wx * 16 + 8; g.player.y = (wy - 8) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.debugGod = true;
  const readR = (wx2, wy2) => {
    // sampleDisplace 间接读——直接用内部:找暴露方法
    // WaterWaves 有 sampleGlint(worldX, worldY) 返回波场强度
    return ww.sampleGlint(wx2, wy2);
  };
  const before = readR(wx * 16 + 8, wy * 16 + 8);
  // 等玩家入水
  const samples = [];
  let wasWet = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => requestAnimationFrame(res));
    const p = g.player;
    if (p.inWater && !wasWet) {
      wasWet = true;
      for (let j = 0; j < 15; j++) {
        await new Promise((res) => requestAnimationFrame(res));
        samples.push({ j, glint: readR(p.cx, p.cy).toFixed(4), wc: p.wetCount });
      }
      break;
    }
  }
  return { before: before.toFixed(4), samples };
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
