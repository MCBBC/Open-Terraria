// 一次性探针:坠星掉落物尺寸验证
//  原版:Item_75 单帧 22×26(DrawAnimationVertical(5,8,PingPong)),掉落物按
//  贴图原尺寸绘制(Main.DrawItem texture.Frame 原大)——比 16px 方块还大。
//  曾统一压 14px 宽 → 星星视觉偏小(用户报"大小不一致")。
//  断言:drop 渲染占用宽 ≥20px(22 原尺寸);且动画切片后高度 ~26 而非 208 整条。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&starprobe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const r = await page.evaluate(() => {
  const g = window.__swGame;
  const key = Object.keys(window.__swItems).find((k) => k.startsWith('vi_75_'));
  if (!key) return { err: 'star key 未注册' };
  const d = g.spawnDrop(g.player.cx, g.player.y - 40, key, 1, 0, 0);
  if (!d) return { err: 'spawnDrop null' };
  // 白盒:drawDrop 消费的正是 atlasIcon 切片结果——量它即量绘制尺寸
  const ar = g.renderer.atlasIcon(d.itemId);
  if (!ar) return { err: 'atlasIcon null' };
  return { key, sw: ar.sw, sh: ar.sh };
});
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('star-registered', !r.err, r);
if (!r.err) {
  // 原版单帧 = 22×26(贴图 22×208 ÷ 8 帧);drawDrop 现按 sw×sh 原尺寸画
  ok('star-frame-native-size', r.sw === 22 && r.sh === 26, { sw: r.sw, sh: r.sh });
  // 切片动画推进:两 tick 相差 5 时帧应变化(PingPong 8 帧,dur=5)
}
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
