// 音效懒加载验证：建世界期间 sounds/ 请求数应为 0（旧实现是 ~57 个全量）；
// 世界就绪后预热小集合，触发播放后按需出现
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
const soundReqs: string[] = [];
page.on('request', (r) => {
  if (r.url().includes('/sounds/')) soundReqs.push(r.url().split('/sounds/')[1]);
});
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const sel = document.querySelector('select');
  if (sel) { sel.selectedIndex = 0; (sel.parentElement!.querySelector('button') as HTMLButtonElement).click(); }
  const t0 = Date.now();
  while (!(window as any).__swGame?.world && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const game = (window as any).__swGame;
  if (!game?.world) return { err: 'world not ready' };
  const duringGen = (window as any).__soundCount ?? -1;
  void duringGen;
  // 触发一个未预热的音效（怪物专属声走 playFiles 懒加载）
  const before = game.sfx.buffers?.size ?? -1;
  game.sfx.playFiles(['Zombie_1']);
  await new Promise((r) => setTimeout(r, 600));
  const after = game.sfx.buffers?.size ?? -1;
  return {
    buffersBefore: before,
    buffersAfterZombie: after,
    zombieHit: game.sfx.buffers instanceof Map,
  };
});
console.log(JSON.stringify({
  soundsDuringSession: soundReqs.length,
  first10: [...new Set(soundReqs)].slice(0, 12),
  ...out,
}, null, 1));
await browser.close();
