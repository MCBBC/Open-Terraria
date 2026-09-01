// 实机走廊坠落取证:真实游戏内重建用户走廊地形,键盘驱动 L→R 穿越逐 tick 采样
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const FIX = JSON.parse(readFileSync(new URL('../tests/fixtures/plat-corridor-window.json', import.meta.url), 'utf8'));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (t.includes('[platfall]')) console.log(t); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5202') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async (cells) => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  // 关闭可能干扰的装备/坐骑
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  await new Promise(r => setTimeout(r, 200));
  // 写入用户走廊地形(cells=[type,slope,half,plat])
  for (const [k, v] of Object.entries(cells)) {
    const [x, y] = k.split(',').map(Number);
    st.setTile(x, y, v[0]);
    const i = st.idx(x, y);
    st.slope[i] = v[1]; st.half[i] = v[2]; st.flags[i] |= 1;
    if (v[3]) st.flags[i] |= 64;
    st.wire[i] = 0;   // 清致动器位
  }
  // 外扩清空,保证周围无外来地形干扰
  const cx0 = 3155, cy0 = 270;
  for (let x = cx0 - 10; x <= 3200; x++) for (let y = cy0 - 6; y <= 296; y++) {
    if (!cells[`${x},${y}`]) { st.setTile(x, y, 0); }
  }
  await new Promise(r => setTimeout(r, 300));
  p.x = 3161 * 16 + 2; p.y = 275 * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = true; p.fallStartY = p.y;
  await new Promise(r => setTimeout(r, 400));
  // 长按 D 模拟走右(玩家全速后恒定)
  g.input.keys.add('KeyD');
  const t0 = g.tickCount;
  const samples = [];
  return await new Promise((resolve) => {
    let n = 0;
    const iv = setInterval(() => {
      samples.push({ t: g.tickCount - t0, x: +p.x.toFixed(2), y: +p.y.toFixed(2), vx: +p.vx.toFixed(3), vy: +p.vy.toFixed(3), g: !!p.onGround });
      n++;
      if (n >= 260) {          // ~4.3 秒足够穿完整个结构
        g.input.keys.delete('KeyD');
        resolve(samples);
      }
    }, 1000 / 60);            // 每 tick 采一次
  });
}, FIX.cells);

writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/platfall-live.json', JSON.stringify(out));
console.log('[platfall-live] samples:', out.length, '→ 已写盘');
await browser.close();
