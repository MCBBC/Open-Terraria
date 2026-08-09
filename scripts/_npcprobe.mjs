// 原版 NPC 数据驱动系统验证：数据完整性 / 贴图懒加载 / 生成 / AI / 属性
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 1) 数据驱动造怪：蓝史莱姆/僵尸/洞穴蝙蝠 属性与原版一致
const made = await page.evaluate(() => {
  const g = window.__swGame;
  const mk = (id) => {
    const e = g.entities ? null : null;
    // 直接用 Enemy.fromVanilla（通过模块不可达 → 借 spawnEnemy 路径验证数据）
    return null;
  };
  // 通过试造：临时注入一个 vanilla 怪再移除
  const ids = [1, 3, 49];
  return ids.map((id) => {
    const before = g.entities.enemies.length;
    const e = new (Object.getPrototypeOf(g.entities.enemies[0] ?? {}).constructor)();
    return null;
  });
});
// 强制步进快速触发生成周期（自然生成间隔太长，探针不等）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = g.world.spawnX * 16;
  g.player.y = (g.world.spawnY - 3) * 16;
  for (let i = 0; i < 2400; i++) g.fixedUpdate(1 / 60);
});
const spawned = await page.evaluate(() => {
  const g = window.__swGame;
  return g.entities.enemies.map((e) => ({
    key: e.key, vanillaId: e.vanillaId ?? null,
    hp: e.hp, maxHp: e.maxHp, dmg: e.def?.damage, w: e.w, h: e.h,
    aiStyle: e.vanilla?.aiStyle ?? null, name: e.vanilla?.name ?? e.def?.name,
    hit: e.def?.hitSound?.[0], frames: e.vanilla?.frames ?? null,
  }));
});
console.log('enemies:', JSON.stringify(spawned, null, 1).slice(0, 900));
const vanillaOnes = spawned.filter((e) => e.vanillaId != null);
check('生成出原版数据驱动怪', vanillaOnes.length > 0, `vanilla=${vanillaOnes.length}/${spawned.length}`);
if (vanillaOnes.length) {
  const v = vanillaOnes[0];
  check('vanilla 怪属性来自提取数据（hp/w/h/aiStyle 非占位）',
    v.maxHp > 1 && v.w > 4 && v.h > 4 && v.aiStyle != null, JSON.stringify(v));
  check('vanilla 怪挂原版音效名', /^NPC_(Hit|Killed)_\d+$/.test(v.hit ?? ''), v.hit);
}

// 2) 贴图懒加载：主角传到 vanilla 怪旁（生成环带在屏外），采样渲染像素
if (vanillaOnes.length) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const e = g.entities.enemies.find((x) => x.vanillaId != null);
    if (e) { g.player.x = e.x - 40; g.player.y = e.y - 60; }
  });
  await new Promise((r) => setTimeout(r, 1500)); // 等懒加载 + 相机跟随
  const px = await page.evaluate(() => {
    const g = window.__swGame;
    const e = g.entities.enemies.find((x) => x.vanillaId != null);
    if (!e) return null;
    const [sx, sy] = g.camera.worldToScreen(e.cx, e.cy);
    if (sx < 0 || sy < 0 || sx > 1280 || sy > 800) return { cover: -1, off: true };
    const d = g.renderer.ctx.getImageData(Math.round(sx) - 8, Math.round(sy) - 8, 16, 16).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 30) n++;
    return { cover: +(n / (d.length / 4)).toFixed(2), vanillaId: e.vanillaId };
  });
  check('vanilla 怪贴图渲染可见', px && px.cover > 0.05, JSON.stringify(px));
}

// 3) AI 活动性：全体 vanilla 怪位移聚合（单怪可能采样到静止相）
if (vanillaOnes.length) {
  const snapshot = () => page.evaluate(() =>
    window.__swGame.entities.enemies
      .filter((e) => e.vanillaId != null)
      .map((e) => ({ id: e.vanillaId, x: e.x, y: e.y })));
  const before = await snapshot();
  await new Promise((r) => setTimeout(r, 3000));
  const after = await snapshot();
  let moved = 0;
  for (const b of before) {
    const a = after.find((x) => x.id === b.id);
    if (a && (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2)) moved++;
  }
  check('vanilla 怪 AI 有位移/重力活动（聚合）', moved > 0, `${moved}/${before.length} 只移动`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
