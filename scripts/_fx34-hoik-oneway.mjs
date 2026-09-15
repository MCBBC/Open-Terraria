// ★SW-FX34b Hoik 单向墙探针（用户实报"不支持单向墙,垂直和水平的单向墙"）。
//  wiki 构图实机复现:①水平单向墙=楼梯平台列(slope2)贴实心墙左面——按住下+右行
//  穿墙/反侧被挡/不按下沿楼梯升越;②竖直单向墙=3 厚天花板开 2 宽井+井底一块
//  底部平台(锤3次=半砖平台)——井内起跳越出天花板顶、井口下落被接住。
//  断言全部走实机玩家(__swGame.player)+真实输入(g.input.keys)。
//  截图 /tmp/fx34-hoik.png。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1.5 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
// 关掉欢迎弹窗(遮挡截图)
try {
  const btn = await page.waitForSelector('button', { timeout: 3000 });
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
    if (b) { b.click(); return true; }
    return false;
  });
  if (clicked) await new Promise((r) => setTimeout(r, 600));
} catch { /* 无弹窗 */ }
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const setup = await page.evaluate(() => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  for (let i = 0; i < 20; i++) p.inv.armor[i] = null;
  p.mount?.dismount?.();
  // ★固定试验场(世界存档跨 run 持久,玩家落点漂移会吃到上 run 残留 tile):固定点+大真空
  const bx = 220, by = 140;
  for (let dx = -90; dx <= 90; dx++) for (let dy = -80; dy <= 80; dy++) st.setTile(bx + dx, by + dy, 0);
  return { bx, by };
});
await new Promise((r) => setTimeout(r, 300));

// ---- 构图 A:水平单向墙(地台 gy,墙 ax 列 rows gy-3..gy-1,楼梯平台列 ax-1 slope2) ----
const rigA = await page.evaluate(({ bx, by }) => {
  const g = window.__swGame, st = g.world.store;
  const ax = bx - 40, gy = by + 10;
  for (let x = ax - 14; x <= ax + 14; x++) st.setTile(x, gy, 1);
  for (let y = gy - 3; y <= gy - 1; y++) st.setTile(ax, y, 1);
  for (let y = gy - 3; y <= gy - 1; y++) { st.setTile(ax - 1, y, 11); st.setSlope(ax - 1, y, 2); }
  return { ax, gy };
}, setup);
await new Promise((r) => setTimeout(r, 200));

async function drive(keys, ms, sample, settle = 400) {
  await page.evaluate(({ sample }) => {
    const g = window.__swGame, p = g.player;
    p.dead = false; p.respawnTimer = 0; p.statLife = p.statLifeMax2;   // 天空带鸟妖骚扰,拍前满血复活
    g.player.x = sample.tx; g.player.y = sample.ty; g.player.vx = 0; g.player.vy = 0; g.player.onGround = false;
  }, { keys, sample });
  await new Promise((r) => setTimeout(r, settle));   // 先落地稳住(跳需按下沿)
  await page.evaluate(({ keys }) => { for (const k of keys) window.__swGame.input.keys.add(k); }, { keys });
  await new Promise((r) => setTimeout(r, ms));
  const out = await page.evaluate((keys) => {
    const p = window.__swGame.player;
    for (const k of keys) window.__swGame.input.keys.delete(k);
    return { x: p.x, y: p.y, feet: p.y + p.h, onGround: p.onGround };
  }, keys);
  return out;
}

// A1 按住下+右行:穿墙
const a1 = await drive(['KeyD', 'KeyS'], 4000, { tx: (rigA.ax - 8) * 16, ty: rigA.gy * 16 - 42 });
check('A1 水平单向墙 按下+右行→穿到墙另一侧', a1.x > (rigA.ax + 1) * 16, `x=${a1.x.toFixed(0)} 墙右缘=${(rigA.ax + 1) * 16}`);
// A2 反侧(左行+按下):被挡
const a2 = await drive(['KeyA', 'KeyS'], 4000, { tx: (rigA.ax + 6) * 16, ty: rigA.gy * 16 - 42 });
check('A2 反侧进入(左行+按下)→被墙挡住', a2.x >= (rigA.ax + 1) * 16 - 1, `x=${a2.x.toFixed(0)} 不得越过 ${(rigA.ax + 1) * 16}`);
// A3 不按下+右行:沿楼梯升越
const a3 = await drive(['KeyD'], 4500, { tx: (rigA.ax - 8) * 16, ty: rigA.gy * 16 - 42 });
check('A3 不按下+右行→沿楼梯升起越过', a3.x > (rigA.ax + 1) * 16, `x=${a3.x.toFixed(0)} feet=${a3.feet.toFixed(0)}`);

// ---- 构图 B:竖直单向墙(房+3厚天花板,2宽井,井底一块底部平台=半砖平台) ----
const rigB = await page.evaluate(({ bx, by }) => {
  const g = window.__swGame, st = g.world.store;
  const vx0 = bx + 40, fy = by + 26, cy = fy - 8;      // 天花板 rows cy..cy+2(3厚),地板 fy
  for (let x = vx0 - 14; x <= vx0 + 14; x++) st.setTile(x, fy, 1);
  for (let y = cy; y <= fy - 1; y++) { st.setTile(vx0 - 14, y, 1); st.setTile(vx0 + 14, y, 1); }
  for (let y = cy; y <= cy + 2; y++) for (let x = vx0 - 13; x <= vx0 + 13; x++) st.setTile(x, y, 1);
  for (let y = cy; y <= cy + 2; y++) { st.setTile(vx0 - 1, y, 0); st.setTile(vx0, y, 0); }   // 2宽井
  st.setTile(vx0 - 1, cy + 2, 11); st.setHalfBrick(vx0 - 1, cy + 2, true);                    // 井底底部平台
  st.setTile(vx0, cy + 2, 11); st.setHalfBrick(vx0, cy + 2, true);
  return { vx0, fy, cy };
}, setup);
await new Promise((r) => setTimeout(r, 200));

// B1 室内井下起跳:上穿天花板(被井底底部平台接住/更高,绝非站在室内地板)
const b1 = await drive(['Space'], 2600, { tx: (rigB.vx0 - 1) * 16 + 6, ty: rigB.fy * 16 - 42 });
check('B1 竖直单向墙 井下起跳→上穿进井(被底部平台接住)',
  b1.feet <= (rigB.cy + 3) * 16 && b1.feet < rigB.fy * 16 - 40, `feet=${b1.feet.toFixed(0)} 接住面=${(rigB.cy + 2) * 16 + 8} 室内地板=${rigB.fy * 16}`);

// B2 井内(底部平台面)起跳+右行:越出天花板顶——轨迹采样(越出后可能跑出 rig 摔落,取曾越出即过)
const b2out = await (async () => {
  await page.evaluate((rigB) => {
    const p = window.__swGame.player;
    p.x = (rigB.vx0 - 1) * 16 + 6; p.y = (rigB.cy + 2) * 16 + 8 - 42; p.vx = 0; p.vy = 0; p.onGround = false;
  }, rigB);
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const g = window.__swGame;
    g.__b2samples = [];
    g.__b2sampler = setInterval(() => {
      const p = g.player;
      g.__b2samples.push({ x: p.x, feet: p.y + p.h });
    }, 80);
    for (const k of ['Space', 'KeyD']) g.input.keys.add(k);
  });
  await new Promise((r) => setTimeout(r, 2600));
  return page.evaluate(() => {
    const g = window.__swGame;
    clearInterval(g.__b2sampler);
    for (const k of ['Space', 'KeyD']) g.input.keys.delete(k);
    return g.__b2samples;
  });
})();
const b2ok = b2out.some((s) => s.feet <= rigB.cy * 16 + 1 && s.x > (rigB.vx0 + 1) * 16);
const b2last = b2out[b2out.length - 1] ?? {};
check('B2 井内底部平台起跳+右行→越出天花板顶(轨迹曾越出)', b2ok,
  `末样 feet=${(b2last.feet ?? 0).toFixed(0)} x=${(b2last.x ?? 0).toFixed(0)} 顶=${rigB.cy * 16}`);

// B3 井口上方下落:被井底底部平台接住(不得落到室内地板)——带轨迹采样
const b3 = await drive([], 2600, { tx: (rigB.vx0 - 1) * 16 + 6, ty: (rigB.cy - 6) * 16 });
check('B3 井口下落→被井底平台接住(单向,不落室内)',
  b3.feet <= (rigB.cy + 3) * 16 + 1 && b3.feet >= rigB.cy * 16 - 1, `feet=${b3.feet.toFixed(0)} 室内地板=${rigB.fy * 16}`);

// 截图:玩家站天花板顶(越出后姿态)——复活满血防鸟妖击杀姿态
await page.evaluate((rigB) => {
  const p = window.__swGame.player;
  p.dead = false; p.respawnTimer = 0; p.statLife = p.statLifeMax2;
  p.x = (rigB.vx0 + 4) * 16; p.y = rigB.cy * 16 - 42; p.vx = 0; p.vy = 0;
}, rigB);
await new Promise((r) => setTimeout(r, 900));
await page.evaluate((rigB) => {
  const p = window.__swGame.player;
  p.dead = false; p.respawnTimer = 0; p.statLife = p.statLifeMax2;
  p.x = (rigB.vx0 + 4) * 16; p.y = rigB.cy * 16 - 42; p.vx = 0; p.vy = 0;
}, rigB);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/fx34-hoik.png' });
console.log(`截图 /tmp/fx34-hoik.png`);
console.log(`RESULT: ${pass} pass / ${fail} fail`);
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
process.exit(fail > 0 ? 1 : 0);
