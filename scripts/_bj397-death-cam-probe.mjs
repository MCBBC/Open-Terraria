// BJ397 死亡态相机/输入锁定取证。
// 场景：
//   A 素机死亡：按住 Left + 鼠标钉屏幕左缘 → 期望 player.x/camera.x 全冻结（原版 UpdateDead
//     早退 :24943 + 相机跟尸 Main.cs:63521 + GetPlayerControlledCameraPan dead 门 :63711-63714）
//   B 手持望远镜(vid 1299)死亡：鼠标移屏缘 → 本仓 pan 通道缺 dead 门 → 期望镜头漂移（bug 面）
//   C 重生：respawnTimer 归零重生 → 期望相机恢复跟随（移动解锁）
// 采样面：player.x/vx（角色锁定）、camera.x（视口）、camera.panX（CurrentPan 分量归属）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&d2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await sleep(2000);
}
if (!inGame) { console.error(JSON.stringify({ fail: 'boot', errors: errors.slice(0, 3) })); await browser.close(); process.exit(1); }
await sleep(1800);

const sample = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, c = g.camera;
  return {
    dead: p.dead, hp: p.hp,
    px: +p.x.toFixed(2), pvx: +p.vx.toFixed(3),
    cx: +c.x.toFixed(2), cy: +c.y.toFixed(2),
    panX: +c.panX.toFixed(2), panY: +c.panY.toFixed(2),
    heldId: p.inv.heldItem()?.id ?? -1,
  };
});
const virtual = (action, level) => page.evaluate((a, l) => window.__swGame.input.setVirtualAction(a, l), action, level);
const mouseAt = (x, y) => page.evaluate((x, y) => {
  const g = window.__swGame;
  g.input.mouseX = x; g.input.mouseY = y;   // 电平面直灌（探针口径,pan 读 input.mouseX/Y）
}, x, y);

// ---- 进场定位：站在开阔地（世界出生点地表附近找一块实心地）----
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.x = g.world.spawnX * 16; p.y = g.world.spawnY * 16;
  p.vx = 0; p.vy = 0;
});
await sleep(1500);   // 相机收敛

// ---- 场景 A：素机死亡 ----
await page.evaluate(() => { window.__swGame.player.hp = 0; });   // 真实 hp<=0 过渡块（Player.fixedUpdate）
await page.waitForFunction(() => window.__swGame.player.dead === true, { timeout: 10000 });
await page.evaluate(() => { window.__swGame.player.respawnTimer = 3600; });   // 拉长死亡窗
await sleep(2000);   // 相机收敛到尸位
const A0 = await sample();
await virtual('Left', true);
await mouseAt(3, 400);   // 左缘（若 pan 通道在死亡态仍活,素机无 pan 件也不应动）
await sleep(1500);
const A1 = await sample();
await virtual('Left', false);
const A = { before: A0, after: A1, dPlayer: +(A1.px - A0.px).toFixed(2), dCam: +(A1.cx - A0.cx).toFixed(2), dPan: +(A1.panX - A0.panX).toFixed(2) };

// ---- 场景 B：手持望远镜 1299 死亡态 pan ----
const B = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const IT = window.__swItems ?? {};
  const key = Object.keys(IT).find((k) => k.startsWith('vi_1299_'));
  if (!key) return { fail: 'no vi_1299 key', keys: Object.keys(IT).filter((k) => k.startsWith('vi_129')).slice(0, 5) };
  p.inv.slots[0] = { id: IT[key], stack: 1 };
  p.inv.selected = 0;
  return { ok: true, key, id: IT[key] };
});
await mouseAt(1277, 400);   // 右缘 → 1299 无右键门,pan 应朝右（若 dead 门缺失=bug 显形）
await sleep(300);
const B0 = await sample();
await sleep(1500);
const B1 = await sample();
const Bres = { give: B, before: B0, after: B1, dCam: +(B1.cx - B0.cx).toFixed(2), dPan: +(B1.panX - B0.panX).toFixed(2) };

// ---- 场景 C：重生解锁 ----
await page.evaluate(() => { window.__swGame.player.respawnTimer = 1; });
await page.waitForFunction(() => window.__swGame.player.dead === false, { timeout: 15000 });
await sleep(1500);
const C0 = await sample();
await page.evaluate(() => { const p = window.__swGame.player; p.x += 400; });   // 强移玩家 → 相机应跟
await sleep(1200);
const C1 = await sample();
const C = { before: C0, after: C1, dCam: +(C1.cx - C0.cx).toFixed(2), dPlayer: +(C1.px - C0.px).toFixed(2) };

console.log(JSON.stringify({ A, B: Bres, C, errors: errors.slice(0, 5) }, null, 1));
await browser.close();
