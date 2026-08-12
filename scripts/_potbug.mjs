// 陶罐错位 bug 复现:真帧/零帧两种陶罐 + 开关门重建 → chunk 像素前后对比
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swTileByKey, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

// 雕刻测试台:玩家附近地表平台,放 2 个陶罐(真帧/零帧) + 1 扇门
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const POT = window.__swTileByKey('pot');
  const DOOR = window.__swTileByKey('door_closed');
  const DIRT = window.__swTileByKey('dirt');
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const y0 = py + 12;
  // 清空 + 平台
  for (let x = px - 12; x <= px + 16; x++) for (let y = y0 - 6; y <= y0 + 2; y++) st.setTile(x, y, 0);
  for (let x = px - 12; x <= px + 16; x++) st.setTile(x, y0, DIRT);
  // 陶罐 A(真帧,样式 0):4 格 (0,0)(18,0)(0,18)(18,18)
  const ax = px - 6, ay = y0 - 2;
  st.setTile(ax, ay, POT, 0, 0); st.setTile(ax + 1, ay, POT, 18, 0);
  st.setTile(ax, ay + 1, POT, 0, 18); st.setTile(ax + 1, ay + 1, POT, 18, 18);
  // 陶罐 B(全零帧,样式随机第 2 行 36):锚点重建路径
  const bx = px + 2;
  st.setTile(bx, ay, POT, 0, 0); st.setTile(bx + 1, ay, POT, 0, 0);
  st.setTile(bx, ay + 1, POT, 0, 0); st.setTile(bx + 1, ay + 1, POT, 0, 0);
  // 门(3 格,锚点底)
  const dx = px + 8;
  st.setTile(dx, y0 - 1, DOOR, 0, 0);
  st.setTile(dx, y0 - 2, DOOR, 0, 18);
  st.setTile(dx, y0 - 3, DOOR, 0, 36);
  // 玩家站旁边
  g.player.x = px * 16; g.player.y = (y0 - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  return { POT, DOOR, ax, ay, bx, dx, y0, px };
});
console.log('setup:', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 1500));

const grab = (label) => page.evaluate((s) => {
  const g = window.__swGame;
  const out = {};
  for (const [name, tx, ty] of [['potA', s.ax, s.ay], ['potB', s.bx, s.ay], ['door', s.dx, s.y0 - 3]]) {
    const key = (Math.floor(tx / 16) & 0xffff) | ((Math.floor(ty / 16) & 0xffff) << 16);
    const pair = g.chunks.chunks.get(key);
    if (!pair) { out[name] = 'no chunk'; continue; }
    const ctx = pair.tile.getContext('2d');
    const lx = (tx % 16) * 16, ly = (ty % 16) * 16;
    // 抓 2×2 格 32×32 像素哈希(陶罐)或 1×3(门)
    const w = name === 'door' ? 16 : 32, h = name === 'door' ? 48 : 32;
    const d = ctx.getImageData(lx, ly, w, h).data;
    let hash = 2166136261;
    for (let i = 0; i < d.length; i += 4) { hash = (hash ^ (d[i] + d[i + 1] * 3 + d[i + 2] * 5 + d[i + 3])) >>> 0; hash = (hash * 16777619) >>> 0; }
    // 附带每格中心采样色(判断错位直观些)
    const px2 = (ox, oy) => {
      const i = ((oy * w) + ox) * 4;
      return d.slice(i, i + 4).join(',');
    };
    out[name] = { hash, c: [px2(8, 8), px2(24, 8), px2(8, 24), px2(24, 24)] };
  }
  return out;
}, setup);
const before = await grab('before');
console.log('BEFORE:', JSON.stringify(before));

// 开门(点门格 → toggleDoor 走 breakTile? 用 Game 内部:模拟右键门)——直接调 toggleDoor
await page.evaluate((s) => {
  const g = window.__swGame;
  // 私有方法经 any 调用
  g.toggleDoor(s.dx, s.y0 - 2, true);
}, setup);
await new Promise((r) => setTimeout(r, 600));
const afterOpen = await grab('afterOpen');
console.log('AFTER OPEN:', JSON.stringify(afterOpen));
console.log('陶罐 A 变化:', before.potA.hash !== afterOpen.potA.hash ? '是(!)' : '否');
console.log('陶罐 B 变化:', before.potB.hash !== afterOpen.potB.hash ? '是(!)' : '否');

await page.evaluate((s) => {
  const g = window.__swGame;
  g.toggleDoor(s.dx, s.y0 - 2, false);
}, setup);
await new Promise((r) => setTimeout(r, 600));
const afterClose = await grab('afterClose');
console.log('AFTER CLOSE:', JSON.stringify(afterClose));
await page.screenshot({ path: '/tmp/pot-bug.png' });
await browser.close();
