// 一次性:持久化 renderMode:'cpu' 开机验证。
// 回归场景:options.onChange 注册即派发(Options.ts:95-98),renderMode='cpu' 存档
// 会让 Game 构造期(input 尚未建)走进 setRenderMode→recreateMainCanvas→
// onCanvasRecreated 裸 this.input.destroy() → TypeError 崩整个 boot。
// 修复后预期:进世界成功 / renderer.cpuRender=true / input 单实例绑在当前画布。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 340_000,
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
const log = (s) => process.stdout.write(`[probe] ${s}\n`);
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
log('goto#1 origin 预置 cpu 档');
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.evaluate(() => {
  const cur = { ...(JSON.parse(localStorage.getItem('sandboxworld.options') ?? '{}')) };
  cur.renderMode = 'cpu';
  localStorage.setItem('sandboxworld.options', JSON.stringify(cur));
});
log('goto#2 ?play=small 重新开机');
await page.goto(origin + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60_000 });
let inGame = false;
for (let i = 0; i < 40 && !inGame; i++) {
  inGame = await page.evaluate(() =>
    !!(window.__swGame && window.__swGame.renderer && window.__swGame.input)).catch(() => false);
  if (!inGame) {
    await new Promise((r) => setTimeout(r, 5000));
    if (i % 4 === 3) {
      const st = await page.evaluate(() => ({
        hasG: !!window.__swGame,
        hasR: !!(window.__swGame && window.__swGame.renderer),
        hasI: !!(window.__swGame && window.__swGame.input),
        bodyCls: document.body.className.slice(0, 40),
        canvasN: document.querySelectorAll('canvas').length,
      })).catch((e) => ({ evalErr: String(e) }));
      log(`poll#${i} ${JSON.stringify(st)} errors=${errors.length} last=${errors.at(-1)?.slice(0, 220) ?? ''}`);
    }
  }
}
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    inGame: !!g,
    cpuRender: g?.renderer?.cpuRender ?? null,
    inputBoundToCanvas: g?.input?.el === g?.renderer?.canvas,
    canvasInDom: !!g?.renderer?.canvas?.isConnected,
    savedMode: JSON.parse(localStorage.getItem('sandboxworld.options') ?? '{}').renderMode,
  };
});
const destroyErr = errors.filter((e) => e.includes('destroy'));
console.log(JSON.stringify({
  ...out, destroyErrors: destroyErr.length,
  totalConsoleErrors: errors.length, sample: errors.slice(0, 5),
}, null, 1));
await browser.close();
