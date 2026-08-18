// 鸟族帧调度探针:地面站定 → 帧4(收翅站立,FindFrame case 74 :74333-74337);
// 飞行 → 帧 0..3 每 4t。曾落通用 6t 全帧循环 = 地面播飞行动画(2026-08-18 报)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  // 放玩家到地表空旷处,取脚下坐标
  const surfY = Math.floor(g.world.groundLevel ?? 100);
  p.x = 800; p.y = surfY * 16;
  await new Promise((r) => setTimeout(r, 200));
  // 找 x=820 列的真实地表(首个实心格上表面)
  const st = g.world.store;
  let groundTile = surfY;
  for (let y = surfY; y < surfY + 200; y++) {
    if (st.isSolid(820 / 16 | 0, y)) { groundTile = y; break; }
  }
  // 玩家先远离(±100 flee 盒外)
  p.x = 820 - 500; p.y = (groundTile - 3) * 16;
  // spawnNpcByVanilla(74) 生成在地面上一格
  const spawned = g.spawnNpcByVanilla(74, 820, (groundTile - 1) * 16);
  await new Promise((r) => setTimeout(r, 100));
  let bird = spawned ?? g.entities.enemies.find((e) => e.vanillaId === 74);
  if (!bird) return { err: 'spawn failed' };
  // 钉到地面站定:盒底=地表,速度清零,ai0 复位(出生下落 vy>0.3 会触发起飞,原版
  // SpawnNPC 出生即站定零速——探针复刻该初态)
  bird.y = groundTile * 16 - bird.h; bird.x = 820;
  bird.vx = 0; bird.vy = 0; bird.ai0 = 0;
  // 等落地静止(重力+碰撞,2s 足够)
  await new Promise((r) => setTimeout(r, 2000));
  const grounded = {
    vx: bird.vx, vy: bird.vy, onGround: bird.onGround,
    ai0: bird.ai0,
  };
  // 直接调用渲染层帧函数(权威)
  const mod = await import('/src/render/Renderer.ts');
  const framesOf = (e) => {
    // frames = 贴图表帧数:vanilla-npcs.json
    return e.vanilla?.frames ?? 5;
  };
  const gFrame = mod.vanillaFrameIdx(bird, framesOf(bird));
  // 驱动起飞(玩家进 ±100 flee 盒)后采样飞行帧
  p.x = bird.x - 60; p.y = bird.y;
  await new Promise((r) => setTimeout(r, 600));
  const fFrame = mod.vanillaFrameIdx(bird, framesOf(bird));
  return {
    err: null, grounded, gFrame, fFrame,
    flyState: { ai0: bird.ai0, vx: +bird.vx.toFixed(2), vy: +bird.vy.toFixed(2), id: bird.vanillaId, frames: framesOf(bird) },
  };
});
if (res.err) { check('生成鸟', false, res.err); }
else {
  check('地面站定 vx==0 && vy==0', res.grounded.vx === 0 && res.grounded.vy === 0, JSON.stringify(res.grounded));
  check('地面帧 = 4(收翅站立)', res.gFrame === 4, `got ${res.gFrame}`);
  check('起飞进入飞行态(ai0=1)', res.flyState.ai0 === 1, JSON.stringify(res.flyState));
  check('飞行帧 ∈ 0..3(扑翼带)', res.fFrame >= 0 && res.fFrame <= 3, `got ${res.fFrame}`);
}
check('无页面错误', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
