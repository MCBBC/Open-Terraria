import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
let errs = 0;
p.on('console', m => { if (m.type()==='error') errs++; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i=0;i<60;i++){ await sleep(2000); if (await p.evaluate(()=>!!window.__swGame).catch(()=>false)) break; }
// 放置篝火+火把在玩家旁(动画 tile),传送地牢门口,暂停,站 25s
await p.evaluate(() => {
  const g = window.__swGame;
  const px = Math.floor(g.player.cx/16), py = Math.floor(g.player.cy/16);
  const st = g.world.store;
  const campfire = window.__swTileByKey('v_215_campfire') ?? -1;
  const torch = window.__swTileByKey('v_4_torch') ?? -1;
  if (campfire>0) st.setTile(px+3, py-1, campfire);
  if (torch>0) st.setTile(px-3, py-1, torch);
  g.player.x = g.world.dungeonX*16; g.player.y = (g.world.dungeonY+20)*16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.paused = true;
});
await sleep(25000);
const res = await p.evaluate(() => {
  const g = window.__swGame;
  return { alive: !!g.renderer, dirty: g.chunks.dirtyQueue.length, chunks: g.chunks.size ?? g.chunks.chunks.size };
}).catch(e => ({ alive: false, err: String(e).slice(0,80) }));
console.log('站定+暂停 25s:', JSON.stringify(res), 'errors:', errs);
console.log(res.alive ? 'PASS' : 'FAIL');
await b.close();
