// 用户标注区链帧倾倒(用用户自己的存档 map json = 现场真实状态):
// 对 marks 里 111 格输出生产路径帧(vanillaFrameFor 缺省缓存语义)+ 八邻类型/half/slope。
// 输出与 rig SWFR 行同构:x,y,typeInternal,fx,fy,n*:t
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = '/Users/vinlic/Downloads/map-FTW_V2 (6).json';
const MARKS = '/Users/vinlic/Downloads/marks-FTW_V2 (6).json';
const OUT = '/Users/vinlic/.claude/jobs/4a66e745/tmp/marks-chain-dump.txt';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const marks = JSON.parse(fs.readFileSync(MARKS, 'utf8')).marks;
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 900, height: 600 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(4000);
const lines = await p.evaluate((marks) => {
  const st = window.__swGame.world.store;
  const rock = window.__swGame.world.rockLevel ?? 0;
  const g = window.__swGame;
  void g;
  return (async () => {
    const vf = await import('/src/render/VanillaFraming.ts');
    const out = [];
    for (const m of marks) {
      const { x, y } = m;
      const i = st.idx(x, y);
      const t = st.flags[i] ? st.type[i] : -1;
      const nb = [];
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (!st.inBounds(xx, yy)) { nb.push(-2); continue; }
        const ii = st.idx(xx, yy);
        nb.push(st.flags[ii] ? st.type[ii] : 0);
      }
      // 生产路径两档:带缓存(实际绘制所见)+ forceFresh(链纯函数值)
      const vCached = vf.vanillaFrameFor(st, x, y, st, ((x * 7) + (y * 11)) % 3, rock);
      const vFresh = vf.vanillaFrameFor(st, x, y, st, ((x * 7) + (y * 11)) % 3, rock, true);
      out.push(`${x},${y},${t},${vCached.fx},${vCached.fy},${vFresh.fx},${vFresh.fy},${st.half[i]},${st.slope[i]},${nb.join('|')}`);
    }
    return out;
  })();
}, marks);
fs.writeFileSync(OUT, '# x,y,typeInt,cfx,cfy,ffx,ffy,half,slope,nb(U D L R UL UR DL DR)\n' + lines.join('\n') + '\n');
console.log(JSON.stringify({ dumped: lines.length, out: OUT }));
await b.close();
