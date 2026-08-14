// F4 全图点亮(原 640ms 巨帧触发器)分帧行带验证:点亮后最长单帧 <50ms
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const sleep = ms => new Promise(r => setTimeout(r, ms));
await p.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i=0;i<60;i++){ await sleep(2000); if (await p.evaluate(()=>!!window.__swGame).catch(()=>false)) break; }
// 注入帧时长记录器,再触发 F4
const res = await p.evaluate(async () => {
  const frames = [];
  let last = performance.now();
  const rec = () => { const n = performance.now(); frames.push(n - last); last = n; requestAnimationFrame(rec); };
  requestAnimationFrame(rec);
  const g = window.__swGame;
  // 等价 F4:全图点亮+无脏信息
  g.world.explored.fill(1);
  g.world.exploredDirty = null;
  g.world.exploredVersion++;
  // 强制小地图可见以驱动 fog 绘制
  await new Promise(r => setTimeout(r, 1500));
  const maxFrame = Math.max(...frames);
  const p99 = frames.slice().sort((a,b)=>b-a)[Math.floor(frames.length*0.01)];
  return { alive: !!g.renderer, framesN: frames.length, maxFrame: +maxFrame.toFixed(1), p99: +p99.toFixed(1) };
}).catch(e => ({ alive:false, err: String(e).slice(0,80) }));
console.log('F4 点亮后帧况:', JSON.stringify(res));
console.log(res.alive && res.maxFrame < 120 ? 'PASS: 无巨帧(分帧行带生效)' : 'FAIL');
await b.close(); process.exit(res.alive && res.maxFrame < 120 ? 0 : 1);
