// 原版真值:Starter_World Master.wld 里【水|泥土】交界泥土格 vanilla 实存的
// frameX/frameY —— 即 vanilla 分帧为这些格实际选的帧(与我们的帧选择对拍)。
// node 读文件 → base64 → 页内 parseWld(vite 转译)。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dw5-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
const b64 = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/Starter_World Master.wld').toString('base64');
const out = await page.evaluate(async (b64) => {
  const { parseWld } = await import('/src/wld/WldParser.ts');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const w = parseWld(buf);
  const t = w.tiles;
  const W = w.tilesWide;
  // 全图 type 0/1/2/53 的 frame 分布(前 12 个高频)
  const dist = { 0: new Map(), 1: new Map(), 2: new Map(), 53: new Map() };
  for (let i = 0; i < t.type.length; i++) {
    const ty = t.type[i];
    if (!t.active[i] || !(ty in dist)) continue;
    const k = t.frameX[i] + ',' + t.frameY[i];
    const m = dist[ty]; m.set(k, (m.get(k) ?? 0) + 1);
  }
  const out = {};
  for (const k of Object.keys(dist)) {
    out[k] = [...dist[k].entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }
  return { dist: out };
}, b64);
for (const [ty, entries] of Object.entries(out.dist)) {
  console.log(`type ${ty}: ` + entries.map(([f, n]) => `${f}(${(Math.floor(f.split(',')[0]/18))},${Math.floor(f.split(',')[1]/18)})x${n}`).join(' '));
}
await browser.close();
