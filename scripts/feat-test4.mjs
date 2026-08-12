// 阶段6 第四轮单测:拉杆开关切换 + 飞镖陷阱触发 + 压力板
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
await page.type('input', 'feat4');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player;
  const tiles = window.__swTiles;
  const vw = g.camera.viewW, vh = g.camera.viewH;
  const toScreen = (tx, ty) => [(tx * 16 + 8 - g.camera.x) * g.camera.zoom + vw / 2, (ty * 16 + 8 - g.camera.y) * g.camera.zoom + vh / 2];
  const rightClick = async (tx, ty) => {
    const [sx, sy] = toScreen(tx, ty);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.rightDown = true;
    await sleep(150);
    g.input.rightDown = false;
    await sleep(80);
  };
  const px = Math.floor(p.cx / 16), py = Math.floor((p.y + p.h) / 16);
  const results = {};
  // 隔离城镇 NPC(商人/护士出生在玩家旁,会游走进测试区抢右键对话)
  for (const n of g.entities.npcs) {
    n.x = (px - 300) * 16; n.y = py * 16;
  }

  // ===== 1. 开关切换(帧 0↔18) =====
  const SW = tiles['v_136_switch'];
  const sx = px + 3, sy = py - 2;
  st.setTile(sx, sy, SW, 0, 0);
  await rightClick(sx, sy);
  const f1 = st.frameX[st.idx(sx, sy)];
  await rightClick(sx, sy);
  const f2 = st.frameX[st.idx(sx, sy)];
  results.switchToggle = { f1, f2, ok: f1 === 18 && f2 === 0 };

  // ===== 2. 拉杆驱动直线陷阱 → 飞镖生成 =====
  const LEVER = tiles['v_132_lever'];
  const TRAP = tiles['v_137_traps'];
  const lx = px - 3, ly = py - 2;
  const tx2 = px - 8, ty2 = py - 2;
  // 造通道(直线无阻挡)
  for (let x = lx; x >= tx2; x--) {
    if (st.isActive(x, ly)) st.setTile(x, ly, 0);
    if (st.isActive(x, ly + 1)) st.setTile(x, ly + 1, 0);
  }
  st.setTile(lx, ly, LEVER, 0, 0);
  st.setTile(tx2, ty2, TRAP, 0, 0);
  await rightClick(lx, ly);
  await sleep(60);  // 飞镖撞走廊尽头墙即消失——采样必须紧跟触发,否则竞态
  const darts = g.entities.projectiles.filter((e) => e.constructor.name === 'Dart');
  results.trapFires = { dartCount: darts.length, ok: darts.length > 0 };

  // ===== 3. 压力板触发 =====
  const PLATE = tiles['v_135_pressure_plates'];
  // 在玩家脚下放压力板 + 直线远处放陷阱
  const plx = px, ply = py + 1; // 脚下
  while (st.isActive(plx, ply)) { st.setTile(plx, ply, 0); }
  st.setTile(plx, ply, PLATE, 0, 0);
  const t2x = px - 6;
  for (let x = plx - 1; x >= t2x; x--) { if (st.isActive(x, ply)) st.setTile(x, ply, 0); if (st.isActive(x, ply + 1)) st.setTile(x, ply + 1, 0); }
  st.setTile(t2x, ply, TRAP, 0, 0);
  p.x = plx * 16 + 2; p.y = (ply - 3) * 16; p.vy = 0;
  await sleep(120);  // 同上:飞镖存活窗口短,尽早采样
  const darts2 = g.entities.projectiles.filter((e) => e.constructor.name === 'Dart');
  results.plateTriggers = { dartTotal: darts2.length, ok: darts2.length > 0 };

  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
