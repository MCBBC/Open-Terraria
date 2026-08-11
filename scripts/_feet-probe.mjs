import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
const run = () => page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__swGame && window.__swGame.player) {
      clearInterval(iv);
      (async () => {
        const g = window.__swGame;
        await new Promise((r2) => setTimeout(r2, 1200));
        g.world.explored.fill(1); g.world.exploredVersion++;
        g.renderer.fullbright = true;
        const STONE = g.tileByKey['stone'];
        // 建一块平石台(y=120 一整行),把玩家放上面
        for (let x = 40; x < 80; x++) g.world.store.setTile(x, 120, STONE, 0, 0);
        const py = 120 * 16 - 42; // 盒底恰在 y=1920(地面顶)
        g.player.x = 50 * 16; g.player.y = py; g.player.vx = 0; g.player.vy = 0;
        // 僵尸 + 商人
        const { Enemy } = await import('/src/entities/Enemy.ts');
        const z = Enemy.fromVanilla(3, 55 * 16, py);   // 构造参=中心? fromVanilla(x,y)是中心语义(x-w/2)
        const npc = g.entities.npcs.find((n) => n.npcKey === 'merchant') || g.entities.npcs[0];
        if (npc) { npc.x = 60 * 16 - npc.w / 2; npc.y = py + 42 - npc.h; npc.vx = 0; npc.vy = 0; }
        if (z) { z.y = py + 42 - z.h; z.vx = 0; z.vy = 0; g.entities.add(z, 'enemies'); }
        const pins = setInterval(() => {
          g.player.x = 50 * 16; g.player.y = py; g.player.vx = 0; g.player.vy = 0;
          if (z) { z.y = py + 42 - z.h; z.vx = 0; z.vy = 0; }
          if (npc) { npc.y = py + 42 - npc.h; npc.vx = 0; npc.vy = 0; }
        }, 16);
        await new Promise((r2) => setTimeout(r2, 600));
        clearInterval(pins);
        const zZoom = g.camera.zoom;
        const camRX = Math.round(g.camera.x * zZoom) / z;
        const ctx = g.renderer.canvas.getContext('2d');
        const groundTopScreen = (120 * 16 - g.camera.y) * zZoom + 800 / 2;
        const sxOf = (wx) => Math.round((wx - camRX) * zZoom + 1280 / 2);
        // 逐列:找每个实体精灵的最低不透明像素行(排除地面:只扫 groundTop 上方 80px 窗)
        const measure = (cxWorld) => {
          const sx = sxOf(cxWorld);
          const W = Math.round(30 * zZoom); // 半宽 30 世界px
          const top = Math.round(groundTopScreen - 90 * zZoom);
          const H = Math.round(90 * zZoom);
          const img = ctx.getImageData(sx - W, top, W * 2, H).data;
          let lowest = -1;
          for (let y = H - 1; y >= 0; y--) {
            let hit = false;
            for (let x = 0; x < W * 2; x++) {
              const i = (y * W * 2 + x) * 4;
              if (img[i + 3] > 60) { hit = true; break; }
            }
            if (hit) { lowest = y; break; }
          }
          const lowestScreen = top + lowest;
          return Math.round((groundTopScreen - lowestScreen) / zZoom); // 正=脚在地面上方多少px(悬空量)
        };
        res({
          groundRef: 'y=120 行石顶(=盒底)',
          playerGap: measure(g.player.cx),
          zombieGap: z ? measure(z.cx) : 'no zombie',
          npcGap: npc ? measure(npc.cx) : 'no npc',
          note: '正数=悬空px,负数=入地px,0=贴地',
        });
      })();
    } else if (Date.now() - t0 > 180000) { clearInterval(iv); res('timeout'); }
  }, 250);
}));
for (let a = 0; a < 12; a++) {
  try { const r = await run(); console.log(JSON.stringify(r, null, 1)); break; }
  catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', a + 1, e.message.slice(0, 60));
    await new Promise((r2) => setTimeout(r2, 2500));
    await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  }
}
console.log('PROBE GAVE UP');
await browser.close();
