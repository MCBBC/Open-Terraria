// 门口列地形剖面 + 老人出生即时/延迟位置对比（判断是否坠入入口井）
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 800));

const info = await p.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const om0 = g.entities.npcs.find((n) => n.npcKey === 'old_man');
  const res = {
    dungeonX: w.dungeonX, dungeonY: w.dungeonY, groundLevel: w.groundLevel,
    at0: om0 ? { x: Math.round(om0.x / 16), y: Math.round(om0.y / 16) } : null,
  };
  // 门口列剖面 dx±2，从 dungeonY-20 到 dungeonY+80：1=实心
  const dx = w.dungeonX, y0 = w.dungeonY - 20;
  res.profile = [];
  for (let y = y0; y < w.dungeonY + 80; y += 4) {
    res.profile.push([
      st.isSolid(dx - 2, y) ? 1 : 0, st.isSolid(dx - 1, y) ? 1 : 0,
      st.isSolid(dx, y) ? 1 : 0,
      st.isSolid(dx + 1, y) ? 1 : 0, st.isSolid(dx + 2, y) ? 1 : 0,
    ]);
  }
  res.profileY0 = y0;
  // 首个实心扫描（复刻 Game 逻辑）
  let dy = Math.max(4, w.dungeonY - 10);
  while (dy < w.dungeonY + 200 && !st.isSolid(dx, dy)) dy++;
  res.firstSolidY = dy;
  await sleep(3000);
  const om1 = g.entities.npcs.find((n) => n.npcKey === 'old_man');
  res.at3s = om1 ? { x: Math.round(om1.x / 16), y: Math.round(om1.y / 16) } : null;
  return res;
});
console.log(JSON.stringify(info));
await b.close();
