// 阶段6 第一轮功能单测:生命水晶(物品+放置态)/床重生点/桶三态/药草收获
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
await page.type('input', 'feat1');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.player && window.__swGame.liquid, {timeout: 300000});
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const tiles = window.__swTiles, items = window.__swItems;
  const p = g.player;
  const results = {};
  const inv = p.inv;

  // 屏幕坐标换算:cam.tileUnder 逆变换(screen = (world - camCenter) * zoom + view/2)
  const vw = g.camera.viewW, vh = g.camera.viewH;
  const toScreen = (tx, ty) => [
    (tx * 16 + 8 - g.camera.x) * g.camera.zoom + g.camera.viewW / 2,
    (ty * 16 + 8 - g.camera.y) * g.camera.zoom + g.camera.viewH / 2,
  ];
  // 异步驱动:设 input 后等真实 rAF 帧消费
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clickTile = async (tx, ty, button) => {
    const [sx, sy] = toScreen(tx, ty);
    g.input.mouseX = sx; g.input.mouseY = sy;
    if (button === 'right') g.input.rightDown = true; else g.input.mouseDown = true;
    await sleep(150);
    g.input.rightDown = false; g.input.mouseDown = false;
    await sleep(80);
  };
  const rightClickTile = (tx, ty) => clickTile(tx, ty, 'right');

  // ===== 1. 物品态生命水晶 =====
  const before = p.baseMaxHp;
  const ci = inv.add(items['life_crystal'], 1);
  // 找到它所在格并选中
  let slot = -1;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['life_crystal']) { slot = i; break; }
  inv.selected = slot;
  // 模拟右键使用(直接调内部不可,改走公开路径:设置 heldItem 并触发 useTime 逻辑不可达)——
  // 这里直接验证 maxHp 变化通过调用一次 rightDown 流程不可行(需输入),改为读 baseMaxHp 由用例外部验证
  // 实际驱动:g.input.rightDown 在 update 中消费。直接调 g 右键处理:设置 input 并 tick 一帧
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  // 放置态测试:在玩家旁放 crystal_heart 2×2 并右键
  const HEART = tiles['crystal_heart'];
  const hx = px + 3, hy = py;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTile(hx + dx, hy + dy, HEART, dx * 18, dy * 18);
  }
  const hpBefore = p.baseMaxHp;
  // 调 interactAt 不可直接(私有),通过 input 驱动一帧
  await rightClickTile(hx, hy);
  results.lifeCrystalPlaced = {
    hpBefore, hpAfter: p.baseMaxHp,
    used: p.baseMaxHp > hpBefore,
    tileGone: st.get(hx, hy) !== HEART,
  };

  // ===== 2. 床重生点 =====
  const BED = tiles['bed'];
  const bx = px + 9, by = py;
  st.setTile(bx, by, BED, 0, 0);
  const spBefore = [g.world.spawnX, g.world.spawnY];
  await rightClickTile(bx, by);
  results.bedSpawn = { spBefore, spAfter: [g.world.spawnX, g.world.spawnY], ok: g.world.spawnX === bx + 1 };

  // ===== 3. 桶:封闭口袋舀水 → 倒水(最小已验证序列) =====
  await sleep(700); // 等此前 useTime 清零
  const DIRT = tiles['dirt'];
  const wx = px + 8, wy = py - 2;
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) st.setTile(wx + dx, wy + dy, DIRT, 0, 0);
  st.setTile(wx, wy, 0, 0, 0);
  st.setLiquid(wx, wy, 255, 1);
  inv.add(items['empty_bucket'], 1);
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items['empty_bucket']) { inv.selected = i; break; }
  await clickTile(wx, wy, 'left');
  const heldNow = inv.slots[inv.selected];
  results.bucketScoop = {
    gotWater: heldNow && heldNow.id === items['water_bucket'],
    liquidGone: st.liquid[st.idx(wx, wy)] === 0,
  };
  // 倒回
  await clickTile(wx, wy, 'left');
  const held2 = inv.slots[inv.selected];
  let anyLiquid = false;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 2; dy++) {
    if (st.liquid[st.idx(wx + dx, wy + dy)] > 0) anyLiquid = true;
  }
  results.bucketPour = {
    backEmpty: held2 && held2.id === items['empty_bucket'],
    liquidNear: anyLiquid,
  };

  // ===== 4. 药草收获 =====
  const HERB = tiles['v_83_herbs_mature'];
  const h2x = px - 8, h2y = py - 1;
  st.setTile(h2x, h2y, HERB, 0, 0); // style 0 = daybloom
  await rightClickTile(h2x, h2y);
  results.herbHarvest = {
    tileGone: st.get(h2x, h2y) !== HERB,
  };

  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
