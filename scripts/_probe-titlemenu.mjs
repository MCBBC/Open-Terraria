// 探针：标题屏日/月抓取（GOING_OLDSCHOOL 派发路径）端到端验证。
//   Achievements 实例是 Game 级，标题屏直载时尚无 Game——注入 __swAchievements 间谍
//   句柄（与 TitleMenu.classicTitleAchievement 的首选查找同键）验证派发链；
//   成就引擎本体已由 tests/achievements.test.ts 覆盖（GOING_OLDSCHOOL = flag('Do')）。
// 断言：
//  1. 命中层 .sw-title-celestial + 可见体 .body 存在，几何与画布同源公式自洽
//  2. 可见体贴图 = Sun.png（昼）/ Moon_0.png（夜），带旋转（ft*2-7.3 rad）
//  3. 命中层中心 elementFromPoint 命中自身；菜单按钮不被截走
//  4. pointerdown → 间谍收到 doClassicTitleScreenAchievement
//  5. 抓取闩期间 pointermove 持续派发（原版 :62450 每帧皆调）；pointerup 后停
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(async () => {
  const res = {};
  const cel = document.querySelector('.sw-title-celestial');
  res.hasLayer = !!cel;
  if (!cel) return res;
  let fired = 0;
  window.__swAchievements = { doClassicTitleScreenAchievement: () => { fired++; } };
  await new Promise((r) => setTimeout(r, 700)); // 等数帧对齐
  const r = cel.getBoundingClientRect();
  res.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  res.hitCenter = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === cel;
  res.inSkyBand = r.y > 0 && r.y + r.height < window.innerHeight * 0.7;
  // 可见体
  const body = cel.querySelector('.body');
  res.hasBody = !!body;
  if (body) {
    const bs = getComputedStyle(body);
    res.bodyBg = bs.backgroundImage;
    res.bodyRotate = body.style.transform;
    res.isNight = cel.classList.contains('night');
  }
  // 与 __swMenuBg 时钟自洽：menuT 反推 ft → 位置应与命中层中心一致
  const mt = window.__swMenuBg ? window.__swMenuBg.clockTime() : null;
  res.menuT = mt;
  if (mt != null) {
    const isDay = mt > 0.1875 && mt < 0.8125;
    const W = window.innerWidth;
    const dayTime = isDay ? ((mt - 0.25) / 0.5) * 54000 : 0;
    const nightTime = !isDay ? ((((mt - 0.75) + 1) % 1) / 0.5) * 32400 : 0;
    const size0 = isDay ? 114 : 50;
    const ft = (isDay ? dayTime : nightTime) / (isDay ? 54000 : 32400);
    const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
    const x = ft * (W + size0 * 2) - size0;
    const y = dip * 250 + 180;
    const scale = (1.2 - dip * 0.4) * (isDay ? 1.1 : 1);
    const size = size0 * scale;
    res.expected = { cx: Math.round(x), cy: Math.round(y), size: Math.round(size) };
    res.center = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
  }
  // 菜单按钮不被截走
  const btn = document.querySelector('.sw-title-btn');
  const br = btn.getBoundingClientRect();
  const at = document.elementFromPoint(br.x + 24, br.y + br.height / 2);
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
  // pointerup → 闩断
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
assert(out.hasBody, '可见体缺失');
const dayNow = out.menuT != null && out.menuT > 0.1875 && out.menuT < 0.8125;
assert(out.bodyBg && out.bodyBg.includes(dayNow ? 'Sun.png' : 'Moon_0.png'),
  `可见体贴图不符（昼=${dayNow}）: ${out.bodyBg}`);
assert(out.isNight === !dayNow, `night 类与昼夜不符: night=${out.isNight} 昼=${dayNow}`);
assert(out.bodyRotate && out.bodyRotate.startsWith('rotate('), '可见体缺旋转');
if (out.expected) {
  assert(Math.abs(out.expected.cx - out.center.cx) <= 2 && Math.abs(out.expected.cy - out.center.cy) <= 2,
    `命中层中心与公式不符: ${JSON.stringify({ expected: out.expected, got: out.center })}`);
  assert(Math.abs(out.expected.size - out.rect.w) <= 3, `命中层尺寸与公式不符: ${out.expected.size} vs ${out.rect.w}`);
}
assert(out.hitCenter, '命中层中心 elementFromPoint 未命中自身');
assert(out.inSkyBand, `命中层不在天空区 ${JSON.stringify(out.rect)}`);
assert(out.buttonFree, '菜单按钮被命中层截走');
assert(out.firedAfterDown >= 1, 'pointerdown 未派发成就调用');
assert(out.firedAfterDrag > out.firedAfterDown, '抓取闩期间 pointermove 未持续派发');
assert(out.firedAfterUp === out.firedAfterDrag, 'pointerup 后仍在派发（闩未断）');
assert(out.grabbingClassAfterUp, 'grabbing 类未清除');
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
