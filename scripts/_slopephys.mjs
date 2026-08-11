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
      // 落点净空:坡格及左邻上方 2 行(正上方有块会接住下落玩家干扰断言)
      let ok = !st.flags[st.idx(x, y - 1)] && !st.flags[st.idx(x, y - 2)] && !st.flags[st.idx(x - 1, y - 1)];
      if (st.flags[st.idx(x, y - 3)] && st.isSolid(x, y - 3)) ok = false;
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
      // 出生区净空:坡列/右侧列上方(树干等实心会让玩家卡死)
      let clear = true;
      for (let dx = 0; dx <= 2 && clear; dx++) for (let dy = 1; dy <= 3; dy++) {
        const j = st.idx(x + dx, y - dy);
        if (st.flags[j] && st.isSolid(x + dx, y - dy)) clear = false;
      }
      if (!clear) continue;
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
  // 轨迹式断言:出现过显著爬升 + 持续前进 + 无长时间冻结(玩家会继续走过地形,
  // 终点高度不能作断言)
  const minFeet = Math.min(...traj.map((t) => t.feet));
  const climbed = start.feet - minFeet;
  const progressed = start.x - end.x;
  let frozen = 0, maxFrozen = 0;
  for (let k = 1; k < traj.length; k++) {
    frozen = Math.abs(traj[k].x - traj[k - 1].x) < 1 ? frozen + 1 : 0;
    maxFrozen = Math.max(maxFrozen, frozen);
  }
  const dbg = await page.evaluate(() => {
    const g = window.__swGame; const p = g.player; const st = g.world.store;
    const fx = Math.floor((p.x + p.w / 2) / 16), fy = Math.floor((p.y + p.h + 2) / 16);
    const dump = [];
    for (let dx = -3; dx <= 2; dx++) for (let dy = -3; dy <= 2; dy++) {
      const j = st.idx(fx + dx, fy + dy);
      dump.push(`${fx + dx},${fy + dy}:t${st.type[j]}${st.half[j] ? 'H' : ''}s${st.slope[j]}${st.flags[j] ? '' : '·'}${st.isSolid(fx + dx, fy + dy) ? '' : '!'}`);
    }
    return { px: p.x, py: p.y, feet: p.y + p.h, vx: p.vx, vy: p.vy, onGround: p.onGround, dump: dump.join(' ') };
  });
  check('上坡行走:爬升且前进(不卡死)', climbed >= 10 && progressed >= 40,
    `maxClimb ${climbed}px, 前进 ${Math.round(progressed)}px | dbg x ${Math.round(dbg.px)} feet ${Math.round(dbg.feet)} vx ${dbg.vx.toFixed(1)} vy ${dbg.vy.toFixed(1)} g ${dbg.onGround} | ${dbg.dump}`);
}

// ===== 用户标注复现(违法的要塞 (2236,276)):坡顶过渡沉入 =====
// 构造同款布局:[X..X-3 整砖顶面(行G)] [X+1 = slope1] [X+1..X+4 行G+1 整砖(低处地面)]
// 玩家从低处向左爬坡 → 过顶瞬间不得下沉(脚底应保持在 G*16 一线)
{
  const layout = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store;
    // 直接雕刻(不依赖自然地形):玩家附近地下 12 行处开一个测试腔
    const cx = Math.floor(g.player.cx / 16), G = Math.floor(g.player.cy / 16) + 14;
    const x = cx + 4;
    // 清空 x-9..x+6 × G-4..G+2
    for (let dx = -9; dx <= 6; dx++) for (let dy = -4; dy <= 2; dy++) st.setTile(x + dx, G + dy, 0);
    const dirt = st.type[st.idx(cx, G + 20)] || 1;
    // 安全地板:G+2 整行(防掉落摔死重生干扰断言)
    for (let dx = -9; dx <= 6; dx++) st.setTile(x + dx, G + 2, dirt);
    // 高处顶面:x-8..x 行G 整砖;低处地面:x-1..x+4 行G+1 整砖
    for (let dx = -8; dx <= 0; dx++) st.setTile(x + dx, G, dirt);
    for (let dx = -1; dx <= 4; dx++) st.setTile(x + dx, G + 1, dirt);
    // slope1 在 (x+1, G) —— 与用户标注(2236,276)同款:整砖(左) + slope1 + 下方整砖地面(右)
    st.setTile(x + 1, G, dirt);
    st.setSlope(x + 1, G, 1);
    return { x, G };
  });
  if (!layout) {
    check('构造坡顶过渡布局', false, '');
  } else {
    const start = await page.evaluate((L) => {
      const g = window.__swGame; const p = g.player;
      p.x = (L.x + 3) * 16 + 8 - p.w / 2; p.y = (L.G + 1) * 16 - p.h; p.vx = 0; p.vy = 0;
      return { x: p.x, feet: p.y + p.h };
    }, layout);
    await new Promise((r) => setTimeout(r, 400));
    await page.keyboard.down('KeyA');
    await new Promise((r) => setTimeout(r, 1400));
    await page.keyboard.up('KeyA');
    const end = await page.evaluate(() => {
      const p = window.__swGame.player;
      return { x: p.x, feet: p.y + p.h, onGround: p.onGround };
    });
    const topY = layout.G * 16;
    const sink = end.feet - topY;               // >4 = 沉入坡顶行(用户报告症状)
    const passedSlope = end.x < layout.x * 16 + 4; // 已走过坡顶进入整砖区
    check('坡顶过渡不沉入(用户标注复现)', passedSlope && sink <= 4 && sink >= -4,
      `布局@(${layout.x},${layout.G}) start feet ${start.feet} → end feet ${end.feet} (坡顶线 ${topY}, 沉入 ${sink}px, x ${Math.round(start.x)}→${Math.round(end.x)}, onGround ${end.onGround})`);
  }
}

// ===== 墙角坡:天花板压住坡顶 → 抬升受阻应回退挡停(不楔进角落) =====
{
  const corner = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store;
    const cx = Math.floor(g.player.cx / 16), G = Math.floor(g.player.cy / 16) + 16;
    const sx = cx + 4;
    // 雕刻 3 高走廊:x-2..x+8 × G-1..G+3(G-1 留作天花板上方,走廊 = 行 G..G+2)
    for (let dx = -2; dx <= 8; dx++) for (let dy = -1; dy <= 3; dy++) st.setTile(sx + dx, G + dy, 0);
    const dirt = st.type[st.idx(cx, G + 20)] || 1;
    for (let dx = -2; dx <= 8; dx++) st.setTile(sx + dx, G + 3, dirt);   // 地板
    for (let dx = -2; dx <= 1; dx++) st.setTile(sx + dx, G + 2, dirt);   // 高侧顶面(行G+2)
    // 悬垂块压住高侧上方(行G+1)——爬到坡顶必被挡
    for (let dx = -2; dx <= 0; dx++) st.setTile(sx + dx, G + 1, dirt);
    st.setTile(sx, G + 2, dirt); st.setSlope(sx, G + 2, 1);              // slope1 在走廊地面
    return { sx, G };
  });
  const cstart = await page.evaluate((C) => {
    const g = window.__swGame; const p = g.player;
    p.x = (C.sx + 6) * 16 + 8 - p.w / 2; p.y = (C.G + 3) * 16 - p.h; p.vx = 0; p.vy = 0;
    return { x: p.x, feet: p.y + p.h };
  }, corner);
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.down('KeyA');
  await new Promise((r) => setTimeout(r, 1800));
  await page.keyboard.up('KeyA');
  const cend = await page.evaluate((C) => {
    const g = window.__swGame; const p = g.player; const st = g.world.store;
    // 嵌入检测:身体盒覆盖的整砖格(排除坡/半砖)
    let embed = 0;
    const bx0 = Math.floor(p.x / 16), bx1 = Math.floor((p.x + p.w - 0.01) / 16);
    const by0 = Math.floor(p.y / 16), by1 = Math.floor((p.y + p.h - 0.01) / 16);
    for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) {
      const j = st.idx(x, y);
      if (st.flags[j] && !st.half[j] && st.slope[j] === 0 && st.isSolid(x, y)) embed++;
    }
    return { x: p.x, feet: p.y + p.h, embed, wallX: (C.sx - 2) * 16, floorY: (C.G + 3) * 16 };
  }, corner);
  const stopped = cend.x >= cend.wallX;                 // 没穿进墙
  const notEmbedded = cend.embed === 0;                 // 不楔进任何整砖
  const onSurface = cend.feet >= cend.floorY - 24 && cend.feet <= cend.floorY + 4; // 停在坡面/地板
  check('墙角坡受阻回退(挡停不楔入)', stopped && notEmbedded && onSurface,
    `start x ${Math.round(cstart.x)} → end x ${Math.round(cend.x)} (墙线 ${cend.wallX}), feet ${Math.round(cend.feet)} / 地板 ${cend.floorY}, 嵌入格 ${cend.embed}`);
}

// ===== 下坡粘性:速度辅助消除格顶滑行 =====
{
  const dh = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store;
    const cx = Math.floor(g.player.cx / 16), G = Math.floor(g.player.cy / 16) + 20;
    const sx = cx + 3;
    for (let dx = -3; dx <= 9; dx++) for (let dy = -3; dy <= 3; dy++) st.setTile(sx + dx, G + dy, 0);
    const dirt = st.type[st.idx(cx, G + 20)] || 1;
    for (let dx = -3; dx <= 9; dx++) st.setTile(sx + dx, G + 2, dirt);   // 安全地板
    for (let dx = -3; dx <= 0; dx++) st.setTile(sx + dx, G, dirt);       // 高台(行G)
    for (let dx = 1; dx <= 14; dx++) st.setTile(sx + dx, G + 1, dirt);   // 低处地面(行G+1,加宽防走出条外)
    st.setTile(sx, G, dirt); st.setSlope(sx, G, 1);                      // slope1 高台右缘下行
    return { sx, G };
  });
  const ds = await page.evaluate((D) => {
    const g = window.__swGame; const p = g.player;
    p.x = (D.sx - 1) * 16 + 8 - p.w / 2; p.y = D.G * 16 - p.h; p.vx = 0; p.vy = 0;
    return { x: p.x, feet: p.y + p.h };
  }, dh);
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.down('KeyD');
  const dtraj = [];
  for (let k = 0; k < 6; k++) {
    await new Promise((r) => setTimeout(r, 200));
    dtraj.push(await page.evaluate(() => {
      const p = window.__swGame.player;
      return { x: Math.round(p.x), feet: p.y + p.h };
    }));
  }
  await page.keyboard.up('KeyD');
  // 断言:走过坡区、无下沉(<=低地面+4)、无中途回弹(下坡后 feet 再升高>2px)
  const slopeX0 = dh.sx * 16, slopeX1 = slopeX0 + 16;
  const crossed = dtraj.some((t) => t.x > slopeX1);
  const floorY = (dh.G + 1) * 16;
  const last = dtraj[dtraj.length - 1];
  const sunk = last.feet > floorY + 4;
  let bounce = 0;
  for (let k = 1; k < dtraj.length; k++) {
    if (dtraj[k].feet < dtraj[k - 1].feet - 2) bounce++; // feet 升高 = 回弹到格顶
  }
  check('下坡粘性(走过坡区不滑行回弹)', crossed && !sunk && bounce <= 1,
    `start ${Math.round(ds.x)} → last x ${last.x} feet ${Math.round(last.feet)} (坡区 ${slopeX0}-${slopeX1}, 地面 ${floorY}, 回弹 ${bounce} 次), traj ${JSON.stringify(dtraj.map(t => [t.x, Math.round(t.feet)]))}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
