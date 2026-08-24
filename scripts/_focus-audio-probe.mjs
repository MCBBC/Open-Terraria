// 失焦音频闸探针（Sfx.setAudioSuspension ≡ Main.cs:11193-11202 PauseAll/ResumeAll）：
// 直调协调器断言全部 AudioContext suspend/resume 翻转（BGM + 游戏 sfx 双系统）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 2000));
  const { Sfx } = await import('/src/core/Sfx.ts');
  const g = window.__swGame;
  // 触发双系统 ctx 懒建（游戏侧 cue 层 + BGM 侧）
  g.sfx.setWind(0, false);
  const states = () => ({
    gameSfx: g.sfx.ctx ? g.sfx.ctx.state : null,
    bgm: window.__swAudio && window.__swAudio.ac ? window.__swAudio.ac.state : null,
    registered: undefined,   // WeakRef 私有,以翻转行为为准
  });
  const res = { before: states() };
  // 连 document.hidden 一起模拟——否则游戏帧循环里的 ensure() 自动 resume 会
  // 合法地拆闸（守卫条件 !document.hidden 不成立），探针测不出真实行为
  const desc = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  Sfx.setAudioSuspension(true);   // ≡ visibilitychange → hidden
  await new Promise((r) => setTimeout(r, 800));   // 让游戏帧跑几拍：守卫应拦住 resume
  res.afterHide = states();
  Object.defineProperty(document, 'hidden', desc ?? { configurable: true, get: () => false });
  Sfx.setAudioSuspension(false);  // ≡ 回前台
  await new Promise((r) => setTimeout(r, 300));
  res.afterShow = states();
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
