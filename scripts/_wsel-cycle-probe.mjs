// 一次性:世界选择图标轮播/天顶故障动画探针（2026-09-03 三项清偿②）
//   ① 天顶世界（getfixedboi）行首 = .sw-vitem-zenith canvas 7×16 帧故障动画，
//      且内容随时间变化（200ms 间隔两次采样像素哈希不同）；无 IconMixedSeed 徽标
//   ② 普通世界行 = .sw-vitem-icon img，src = worldIconNames[0]；单图标无徽标
//   ③ 轮播行（多图标）构造：直接造 meta 不经 parseSeed 的多旗路径在本仓不可达
//      （parseSeed 逐路由 break），轮播推进语义由 tests/world-icon-cycle.test.ts 锁
// SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs scripts/_wsel-cycle-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5210') + '/?menu=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const { WorldSelectPanel, worldIconNames, worldIconName, WORLD_ICON_CYCLE_MS } = await import('/src/ui/WorldSelect.ts');
  const metas = [
    { id: 1, name: '天顶测试', seed: 'getfixedboi', w: 4200, h: 1200, difficulty: 0, evil: 0, hardMode: false, createdAt: 1, lastPlayed: 1, playTimeMs: 0, favorite: false },
    { id: 2, name: '醉酒测试', seed: '05162020', w: 4200, h: 1200, difficulty: 0, evil: 0, hardMode: false, createdAt: 2, lastPlayed: 2, playTimeMs: 0, favorite: false },
    { id: 3, name: '普通测试', seed: '12345', w: 6400, h: 1800, difficulty: 0, evil: 1, hardMode: true, createdAt: 3, lastPlayed: 3, playTimeMs: 0, favorite: false },
  ];
  const fakeStore = { ensureLoaded: async () => {}, list: () => metas, setFavorite: async () => {}, rename: async () => {}, delete: async () => {} };
  const panel = new WorldSelectPanel(document.body, fakeStore, { onPlay: () => {}, onNew: () => {}, onBack: () => {}, onImport: async () => {} });
  await new Promise((r) => setTimeout(r, 500));
  const items = [...document.querySelectorAll('.sw-vsel .sw-vitem')];
  const hash = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i + 1] + d[i + 2]) | 0; }
    return h;
  };
  const zenithCanvas = items[0]?.querySelector('.sw-vitem-zenith');
  let anim1 = null, anim2 = null, animChanged = false;
  if (zenithCanvas) {
    await new Promise((r) => setTimeout(r, 300));
    anim1 = hash(zenithCanvas);
    await new Promise((r) => setTimeout(r, 400));
    anim2 = hash(zenithCanvas);
    animChanged = anim1 !== anim2;
  }
  const icons = items.map((it) => it.querySelector('.sw-vitem-icon')?.getAttribute('src') ?? null);
  const badges = document.querySelectorAll('.sw-vsel .sw-vitem-mixed').length;
  const derived = metas.map((m) => ({ names: worldIconNames(m), single: worldIconName(m), cycleMs: WORLD_ICON_CYCLE_MS }));
  panel.close();
  return { rows: items.length, icons, badges, zenith: { present: !!zenithCanvas, animChanged, anim1, anim2 }, derived };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
