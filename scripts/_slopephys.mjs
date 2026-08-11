// 坡面物理 E2E:玩家落到 slope 格上应贴对角线(不悬空在格顶/不穿落)
// slope1 左高右低:表面 y = ty*16 + (px - tx*16)(左缘 0 右缘 16)
// slope2 右高左低:表面 y = ty*16 + (16 - (px+w - tx*16)) 近似(取脚底中心估算)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 找地表 slope1 格:其上两格空、下方实心
const cell = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const gl = Math.floor(g.world.groundLevel);
  for (let x = 300; x < st.w - 300; x++) {
    for (let y = gl; y < gl + 40; y++) {
      const i = st.idx(x, y);
      if (st.slope[i] !== 1 || !st.flags[i]) continue;
      const ok = !st.flags[st.idx(x, y - 1)] && !st.flags[st.idx(x, y - 2)] && !st.flags[st.idx(x - 1, y - 1)];
      if (ok) return { x, y };
    }
  }
  return null;
});
check('找到可测试的 slope1 格', !!cell, JSON.stringify(cell));

if (cell) {
  // 玩家落到坡面正上方(玩家宽约 20px,中心对齐格子中心)
  await page.evaluate((c) => {
    const g = window.__swGame;
    const p = g.player;
    p.x = c.x * 16 + 8 - p.w / 2;
    p.y = (c.y - 4) * 16;
    p.vx = 0; p.vy = 0;
  }, cell);
  await new Promise((r) => setTimeout(r, 1800));
  const res = await page.evaluate((c) => {
    const g = window.__swGame;
    const p = g.player;
    const feet = p.y + p.h;
    // 对角线在玩家左缘与右缘处的期望高度(slope1: y = cellTop + localX)
    const top = c.y * 16;
    const lx0 = Math.max(0, p.x - c.x * 16), lx1 = Math.min(16, p.x + p.w - c.x * 16);
    const diagL = top + lx0, diagR = top + lx1;
    return { feet, diagL, diagR, onGround: p.onGround, cellTop: top };
  }, cell);
  // 脚底应落在 [diagL, diagR] 对角线带内(±3px 容差),而不是停在格顶
  const onDiag = res.feet >= res.diagL - 3 && res.feet <= res.diagR + 3;
  check('玩家贴 slope1 对角线', onDiag && res.onGround, JSON.stringify(res));

  // 对照:slope=0 整砖格上应停在格顶
  let flat = null;
  try {
    flat = await page.evaluate((cc) => {
      const g = window.__swGame;
      if (!g || !g.world) return null;
      const st = g.world.store;
      for (let x = cc.x - 60; x < cc.x + 60; x++) {
        for (let y = cc.y; y < cc.y + 10; y++) {
          const i = st.idx(x, y);
          if (st.isSolid(x, y) && !st.half[i] && st.slope[i] === 0) {
            let clear = true;
            for (let dx = -1; dx <= 2 && clear; dx++) {   // 玩家宽 20px 跨 3 列
              if (st.flags[st.idx(x + dx, y - 1)] || st.flags[st.idx(x + dx, y - 2)]) clear = false;
            }
            if (clear) return { x, y };
          }
        }
      }
      return null;
    }, cell);
  } catch (e) { console.log('flat search error:', e.message); }
  if (flat) {
    await page.evaluate((f) => {
      const g = window.__swGame; const p = g.player;
      p.x = f.x * 16 + 8 - p.w / 2; p.y = (f.y - 4) * 16; p.vx = 0; p.vy = 0;
    }, flat);
    await new Promise((r) => setTimeout(r, 1500));
    const r2 = await page.evaluate((f) => {
      const g = window.__swGame; const p = g.player; const st = g.world.store;
      const dump = [];
      const fx = Math.floor((p.x + p.w / 2) / 16), fy = Math.floor((p.y + p.h + 2) / 16);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 2; dy++) {
        const i = st.idx(fx + dx, fy + dy);
        dump.push(`${fx + dx},${fy + dy}:t${st.type[i]}${st.half[i] ? 'H' : ''}s${st.slope[i]}${st.flags[i] ? '' : '·'}`);
      }
      return { feet: p.y + p.h, top: f.y * 16, onGround: p.onGround, px: p.x, py: p.y, dump: dump.join(' ') };
    }, flat);
    check('整砖格正常落地(回归)', Math.abs(r2.feet - r2.top) < 2 && r2.onGround, JSON.stringify(r2));
  }
}
// ===== 上坡行走(用户报告:卡住+往后退) =====
// 模式:slope1 在 (sx,sy);左邻 (sx-1,sy) 整砖(高处);下方 (sx,sy+1) 整砖(低处落脚)
// 玩家站低处块顶,按住 A 向左走上坡 → 应爬到高处块顶(y 下降 16px,x 前进),不卡死
const up = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const gl = Math.floor(g.world.groundLevel);
  for (let x = 300; x < st.w - 300; x++) {
    for (let y = gl; y < gl + 40; y++) {
      const i = st.idx(x, y);
      if (st.slope[i] !== 1 || !st.flags[i]) continue;
      const L = st.idx(x - 1, y), B = st.idx(x, y + 1);
      const solidFull = (j) => st.flags[j] && !st.half[j] && st.slope[j] === 0;
      if (!solidFull(L) || !solidFull(B)) continue;
      if (st.flags[st.idx(x - 1, y - 1)] || st.flags[st.idx(x - 1, y - 2)]) continue; // 高处上方净空
      return { x, y };
    }
  }
  return null;
});
if (!up) {
  check('找到上坡测试点(slope1 台阶)', false, '');
} else {
  const start = await page.evaluate((u) => {
    const g = window.__swGame; const p = g.player;
    p.x = u.x * 16 + 2; p.y = (u.y + 1) * 16 - p.h; p.vx = 0; p.vy = 0;
    return { x: p.x, feet: p.y + p.h };
  }, up);
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.down('KeyA');
  const traj = [];
  for (let k = 0; k < 8; k++) {
    await new Promise((r) => setTimeout(r, 200));
    traj.push(await page.evaluate(() => {
      const p = window.__swGame.player;
      return { x: Math.round(p.x), feet: p.y + p.h };
    }));
  }
  await page.keyboard.up('KeyA');
  const end = traj[traj.length - 1];
  console.log('  轨迹:', JSON.stringify(traj));
  const climbed = start.feet - end.feet; // >0 为爬升
  const progressed = start.x - end.x;    // >0 为前进
  check('上坡行走:爬升且前进(不卡死)', climbed >= 10 && progressed >= 8,
    `start feet ${start.feet} x ${Math.round(start.x)} → end feet ${end.feet} x ${Math.round(end.x)} (爬升 ${climbed}px, 前进 ${Math.round(progressed)}px, onGround ${end.onGround})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
