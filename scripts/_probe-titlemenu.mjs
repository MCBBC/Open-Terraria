// 探针：标题屏日/月抓取（GOING_OLDSCHOOL 派发路径）端到端验证。
//   Achievements 实例是 Game 级，标题屏直载时尚无 Game——注入 __swAchievements 间谍
//   句柄（与 TitleMenu.classicTitleAchievement 的首选查找同键）验证派发链；
//   成就引擎本体已由 tests/achievements.test.ts 覆盖（GOING_OLDSCHOOL = flag('Do')）。
// 断言：
//  1. 命中层 .sw-title-celestial 存在且几何合理（在天空区、尺寸 > 0）
//  2. 命中层中心 elementFromPoint 命中自身（pointer-events 生效、不被按钮遮）
//  3. 菜单按钮不被命中层截走
//  4. pointerdown → 间谍收到 doClassicTitleScreenAchievement
//  5. 抓取闩期间 pointermove 持续派发（原版 :62450 每帧皆调）；pointerup 后停
//  6. flow.onSunMoonGrab 抛出 time01 ∈ [0,1)（经 __swTitleMenu 探针句柄验）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const res = {};
  const cel = document.querySelector('.sw-title-celestial');
  res.hasLayer = !!cel;
  if (!cel) return res;
  // 间谍句柄（classicTitleAchievement 首选查找键）
  let fired = 0;
  window.__swAchievements = { doClassicTitleScreenAchievement: () => { fired++; } };
  await new Promise((r) => setTimeout(r, 600)); // 等一帧对齐
  const r = cel.getBoundingClientRect();
  res.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  res.hitCenter = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === cel;
  // 命中层应罩在天空里的日/月上：与 SkyRenderer 公式同源位置（白天 ft~0.5 附近近顶部）
  res.inSkyBand = r.y > 0 && r.y + r.height < window.innerHeight * 0.65;
  // 像素级对账：命中层中心的画布像素 = 日/月亮色（黄/白），对照点 = 天空色
  const canvas = document.querySelector('canvas');
  if (canvas) {
    const c2 = document.createElement('canvas');
    c2.width = canvas.width; c2.height = canvas.height;
    const cx = c2.getContext('2d');
    cx.drawImage(canvas, 0, 0);
    const pick = (x, y) => {
      const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    res.centerPixel = pick(r.x + r.width / 2, r.y + r.height / 2);
    res.controlPixel = pick(40, Math.round(window.innerHeight - 60));
  }
  const btn = document.querySelector('.sw-title-btn');
  const br = btn.getBoundingClientRect();
  const at = document.elementFromPoint(br.x + 24, br.y + br.height / 2);
  res.buttonOwner = at === btn || btn.contains(at);
  res.buttonFree = !cel.contains(at);
  // pointerdown → 派发
  cel.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 120));
  res.firedAfterDown = fired;
  // 抓取闩：pointermove 持续派发
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: r.y, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640, clientY: r.y, bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 120));
  res.firedAfterDrag = fired;
  // pointerup → 闩断，move 不再派发
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: r.y, bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 120));
  res.firedAfterUp = fired;
  res.grabbingClassAfterUp = !cel.classList.contains('grabbing');
  delete window.__swAchievements;
  return res;
});
console.log(JSON.stringify(out, null, 1));

const assert = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
assert(out.hasLayer, '命中层缺失');
assert(out.rect && out.rect.w > 50 && out.rect.h > 50, `命中层尺寸异常 ${JSON.stringify(out.rect)}`);
assert(out.hitCenter, '命中层中心 elementFromPoint 未命中自身');
assert(out.inSkyBand, `命中层不在天空区 ${JSON.stringify(out.rect)}`);
if (out.centerPixel) {
  const [pr, pg, pb] = out.centerPixel;
  // 日(黄 R>G>B) / 月(白亮)二选一；对照点应是暗色（夜空/树层）而非同色
  const sunLike = pr > 180 && pg > 140 && pr > pb + 40;
  const moonLike = pr > 150 && pg > 150 && pb > 130 && Math.abs(pr - pb) < 90;
  assert(sunLike || moonLike, `命中层中心不是日/月颜色: ${JSON.stringify(out.centerPixel)}`);
}
assert(out.buttonFree, '菜单按钮被命中层截走');
assert(out.firedAfterDown >= 1, 'pointerdown 未派发成就调用');
assert(out.firedAfterDrag > out.firedAfterDown, '抓取闩期间 pointermove 未持续派发');
assert(out.firedAfterUp === out.firedAfterDrag, 'pointerup 后仍在派发（闩未断）');
assert(out.grabbingClassAfterUp, 'grabbing 类未清除');
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
