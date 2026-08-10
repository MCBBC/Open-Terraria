// 老人落位细节:门口 ±6 格实心/门分布 + 老人速度/脚底
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));

const info = await p.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const om = g.entities.npcs.find((n) => n.npcKey === 'old_man');
  const res = {
    dungeonX: w.dungeonX, dungeonY: w.dungeonY,
    om: om ? { x: Math.round(om.cx / 16), y: Math.round(om.y / 16), vy: +om.vy.toFixed(2), home: om.home } : null,
    doors: [],
  };
  // 门口区域的门 tile 与实心剖面
  const dX = w.dungeonX, dY = w.dungeonY;
  const x0 = dX - 50, x1 = dX + 50;
  for (let x = x0; x <= x1; x++) {
    for (let y = dY - 30; y < dY + 30; y++) {
      if (st.type[st.idx(x, y)] === 17) res.doors.push([x, y]);
    }
  }
  // om 周围 7×7 剖面（1=实心 D=门）
  if (om) {
    const tx = Math.floor(om.cx / 16), ty = Math.floor((om.y + om.h) / 16);
    res.gridY0 = ty - 5; res.gridX0 = tx - 3;
    res.grid = [];
    for (let y = ty - 5; y <= ty + 2; y++) {
      const row = [];
      for (let x = tx - 3; x <= tx + 3; x++) {
        row.push(st.type[st.idx(x, y)] === 17 ? 'D' : st.isSolid(x, y) ? 1 : 0);
      }
      res.grid.push(row);
    }
  }
  return res;
});
console.log(JSON.stringify(info));
await b.close();
