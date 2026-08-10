// 守卫老人门口落位验证：old_man 应站在 dungeonY 附近的地表（非地底），
// 头顶露天可见；顺带采样门口列的地表结构
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const info = await p.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const om = g.entities.npcs.find((n) => n.npcKey === 'old_man');
  const res = {
    dungeonX: w.dungeonX, dungeonY: w.dungeonY, groundLevel: w.groundLevel,
    oldMan: om ? { x: Math.round(om.x / 16), y: Math.round(om.y / 16), dead: om.dead } : null,
  };
  if (om) {
    const tx = Math.floor(om.cx / 16), ty = Math.floor((om.y + om.h) / 16);
    // 头顶向上 10 格的实心情况（全空=露天可见）
    res.above = [];
    for (let k = 1; k <= 10; k++) res.above.push(st.isSolid(tx, ty - k) ? 1 : 0);
    res.onGroundSolid = st.isSolid(tx, ty);
    res.distToEntrance = Math.abs(Math.round(om.y / 16) - w.dungeonY);
  }
  return res;
});
console.log(JSON.stringify(info));
await b.close();
