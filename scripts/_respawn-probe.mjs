// 死亡重生风暴探针:进世界→远传地牢(积累)→模拟死亡重生跳回出生点→站 20s
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
let errs = 0; p.on('console', m => { if (m.type()==='error') errs++; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i=0;i<60;i++){ await sleep(2000); if (await p.evaluate(()=>!!window.__swGame).catch(()=>false)) break; }
// ①去地牢积累
await p.evaluate(() => { const g = window.__swGame; g.player.x = g.world.dungeonX*16; g.player.y=(g.world.dungeonY+20)*16; g.camera.x=g.player.cx; g.camera.y=g.player.cy; });
await sleep(6000);
// ②模拟死亡重生:跳回出生点(远距离)
await p.evaluate(() => { const g = window.__swGame; g.player.x = g.world.spawnX*16; g.player.y=(g.world.spawnY-3)*16; g.camera.x=g.player.cx; g.camera.y=g.player.cy; });
await sleep(20000);
const res = await p.evaluate(() => { const g = window.__swGame; return { alive: !!g.renderer, dirty: g.chunks.dirtyQueue.length, cached: g.chunks.chunks.size }; }).catch(e=>({alive:false,err:String(e).slice(0,80)}));
console.log('重生后 20s:', JSON.stringify(res), 'errors:', errs);
console.log(res.alive ? 'PASS' : 'FAIL');
await b.close(); process.exit(res.alive?0:1);
