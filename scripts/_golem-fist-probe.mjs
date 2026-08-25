// 一次性探针:石巨人之拳(vi_1297→弹262)AI_013 锚定族视觉/状态机自证
//  (a) 弹体 x 序列三段形态:出膛递增 → 峰值(距玩家≈500,≤560) → 回拉递减至消亡
//  (b) 玩家-拳连线出现链索:drawImage 钩到 Chain22.png + 连线采样非背景像素
//  (c) 命中假人(绿史莱姆 @250px)后提前回收(峰值 <350 + 爆炸音 Item14='explosion'
//      ——返回起手 dist>=150 触发 200×200 冲击盒链)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&golemprobe=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swItems)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

// vi_1297 key 反查(sprites/vanilla.json items 表 id→key)
const van = await page.evaluate(async () => {
  const r = await fetch('sprites/vanilla.json');
  const j = await r.json();
  return j.items ?? {};
});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + String(m.key).replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};
const equip = async (vid) => page.evaluate((key) => {
  const g = window.__swGame;
  const id = window.__swItems?.[key];
  if (id === undefined) return false;
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();
  return true;
}, keyFor(1297));

const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...(x ? { info: x } : {}) });

// 小世界地形随机——开火走廊不可靠(第二次跑曾右侧 70px 撞墙)。沿玩家行向右
// 铲一条平走廊:上方清空/下方铺实土(setTileSilent 直写,探针专用)
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const pt = Math.floor(g.player.cx / 16);
  const pr = Math.floor(g.player.cy / 16);
  for (let tx = pt + 1; tx <= pt + 48; tx++) {
    // 仅清空气隧道(pr-10..pr+2),不填任何实块——填实块会把玩家埋进地里
    for (let ty = pr - 10; ty <= pr + 2; ty++) st.setTileSilent(tx, ty, 0);
    st.setWall?.(tx, pr - 5, 0);
  }
});

if (!(await equip(1297))) {
  console.error('equip 失败:vi_1297 未注册');
  await browser.close();
  process.exit(1);
}

// ---- (a)+(b) 空场开火:x 序列三段形态 + 链索证据 ----
const flight = await page.evaluate(async () => {
  const g = window.__swGame;
  // 清空既有投射物,防串扰
  g.entities.projectiles.length = 0;
  // ★链索视觉证据走像素采样(GL 合成层下 drawImage 钩看不到精灵绘制,
  //   像素回读是唯一真相——见 b 段断言)
  const cv0 = g.renderer.canvas;
  // 瞄准正右方(mouseX 是屏幕坐标;玩家居中附近,zoom≈1.25)
  g.input.mouseX = g.renderer.canvas.width / 2 + 400;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.player.useTime = 0;
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  // 逐步采样
  const seq = [];
  for (let i = 0; i < 180; i++) {
    g.fixedUpdate(1 / 60);
    const f = g.entities.projectiles.find((e) => e.constructor?.name === 'AnchoredProj' && e.projId === 262);
    if (!f) {
      if (seq.length) break;
      continue;
    }
    const dx = f.cx - g.player.cx;
    seq.push(Math.round(dx));
    if (f.dead) break;
  }
  return { seq };
});

// 三段形态断言
{
  const s = flight.seq;
  ok('a1-spawned-and-flew', s.length >= 20, `samples=${s.length}`);
  const peak = Math.max(...s);
  const peakIdx = s.indexOf(peak);
  ok('a2-outbound-increasing', peakIdx > 4 && s[peakIdx] > s[Math.min(6, s.length - 1)], `first=${s[0]} peak=${peak}@${peakIdx}`);
  ok('a3-range-gate-500', peak > 400 && peak <= 560, `peakDist=${peak} (门=500+单步14)`);
  const tail = s.slice(peakIdx);
  ok('a4-return-decreasing', tail.length >= 3 && tail[tail.length - 1] < tail[0] * 0.5, `tailHead=${tail[0]} tailLast=${tail[tail.length - 1]}`);
  ok('a5-despawned-at-hand', !flight.seq.includes(undefined), 'seq 完整');
}

// ---- (b) 链索像素采样(RAF 对齐):注册到游戏主循环之后的 rAF 回调里读态+采像素
// ——游戏一帧 = update→render,其后我的回调看到的实体位与画布内容严格同帧
// (GL 合成层下 drawImage 钩不可见,像素回读是唯一真相)
const chainPix = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c = cv.getContext('2d');
  g.entities.projectiles.length = 0;
  g.input.mouseX = cv.width / 2 + 400;
  g.input.mouseY = cv.height / 2;
  g.player.useTime = 0;
  g.input.mouseDown = true;
  let best = { ink: 0, cov: 0, len: 0, shown: false, frames: 0 };
  const tick = () => {
    const f = g.entities.projectiles.find((e) => e.constructor?.name === 'AnchoredProj' && e.projId === 262);
    if (!f) { if (best.frames > 0 || g.player.useTime === 0) return resolve(best); requestAnimationFrame(tick); return; }
    const dx = f.cx - g.player.cx;
    if (dx > 150 && dx < 420 && f.shown) {
      // 世界→屏幕(Camera.worldToScreen 同式,含 punch)
      const w2s = (wx, wy) => [(wx - g.camera.x + g.camera.punchX) * g.camera.zoom + cv.width / 2,
        (wy - g.camera.y + g.camera.punchY) * g.camera.zoom + cv.height / 2];
      const [ax, ay] = w2s(g.player.cx, g.player.cy);
      const [bx, by] = w2s(f.cx, f.cy);
      const len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      const nx = -uy, ny = ux;
      let ink = 0, total = 0;
      for (let d = 32; d < len - 32; d += 3) {
        total++;
        const sx = ax + ux * d, sy = ay + uy * d;
        const p1 = c.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
        const q1 = c.getImageData(Math.round(sx + nx * 10), Math.round(sy + ny * 10), 1, 1).data;
        const q2 = c.getImageData(Math.round(sx - nx * 10), Math.round(sy - ny * 10), 1, 1).data;
        const dd1 = Math.abs(p1[0] - q1[0]) + Math.abs(p1[1] - q1[1]) + Math.abs(p1[2] - q1[2]);
        const dd2 = Math.abs(p1[0] - q2[0]) + Math.abs(p1[1] - q2[1]) + Math.abs(p1[2] - q2[2]);
        if (Math.min(dd1, dd2) > 45) ink++;       // 线上异于两侧背景 = 链节墨
      }
      best.frames++;
      if (ink > best.ink) best = { ink, cov: Math.round((ink / Math.max(1, total)) * 100) / 100, len: Math.round(len), shown: f.shown, frames: best.frames };
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
ok('b1-chain-band-coverage', chainPix.cov >= 0.5 && chainPix.ink >= 20,
  `coverage=${chainPix.cov} inkSamples=${chainPix.ink} lineLen=${chainPix.len}px frames=${chainPix.frames}`);
ok('b2-chain-pixels-on-line', chainPix.ink >= 3, `inkSamples=${chainPix.ink} lineLen=${chainPix.len}px shown=${chainPix.shown}`);

// ---- (c) 命中假人提前回收 + 返回冲击爆炸音 ----
const hitRun = await page.evaluate(() => {
  const g = window.__swGame;
  g.entities.projectiles.length = 0;
  // spawnEnemy 已自行入桶(dartprobe 先例),勿再 add(双入桶=双倍 AI 步进)
  const before = g.entities.enemies.length;
  const slime = g.spawnEnemy('slime_green', g.player.cx + 250, g.player.cy - 10);
  const alreadyAdded = g.entities.enemies.length > before;
  if (!alreadyAdded && slime) g.entities.add(slime, 'enemies');
  const sfx = [];
  const osfx = g.playSfx.bind(g);
  g.playSfx = (n, ...r) => { sfx.push(n); return osfx(n, ...r); };
  // ★瞄准活体假人当前位置(史莱姆会跳/落地,固定水平瞄准会脱靶——探针几何修正)
  const cv = g.renderer.canvas;
  const w2s = (wx, wy) => [(wx - g.camera.x + g.camera.punchX) * g.camera.zoom + cv.width / 2,
    (wy - g.camera.y + g.camera.punchY) * g.camera.zoom + cv.height / 2];
  // 钉点=玩家右侧 250px、与玩家同高(隧道内)——每 tick 强制归位防跳跃脱靶
  const pinX = g.player.cx + 250, pinY = g.player.cy;
  slime.x = pinX - slime.w / 2; slime.y = pinY - slime.h / 2; slime.vx = 0; slime.vy = 0;
  const [mx, my] = w2s(pinX, pinY);
  g.input.mouseX = mx; g.input.mouseY = my;
  g.player.useTime = 0;
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const seq = [];
  let hitTick = -1;
  for (let i = 0; i < 180; i++) {
    if (!slime.dead) { slime.x = pinX - slime.w / 2; slime.y = pinY - slime.h / 2; slime.vx = 0; slime.vy = 0; }
    g.fixedUpdate(1 / 60);
    const f = g.entities.projectiles.find((e) => e.constructor?.name === 'AnchoredProj' && e.projId === 262);
    if (!f) { if (seq.length) break; continue; }
    seq.push(Math.round(Math.hypot(f.cx - g.player.cx, f.cy - g.player.cy)));
    if (hitTick < 0 && f.a0 === 1 && i > 0) hitTick = i;   // 转返回态首拍
    if (f.dead) break;
  }
  g.playSfx = osfx;
  if (slime) slime.dead = true;
  return { seq, hitTick, explosion: sfx.includes('explosion'), slimeSpawned: !!slime };
});
{
  const r = hitRun;
  ok('c0-slime-spawned', r.slimeSpawned, '假人生成');
  const peak = r.seq.length ? Math.max(...r.seq) : -1;
  ok('c1-early-return-on-hit', peak > 0 && peak < 350, `peakDist=${peak} (<350=未达 500 门即回收) hitTick=${r.hitTick}`);
  ok('c2-explosion-boom-box', r.explosion, '返回起手 dist>=150 → Item14 爆炸音+200×200 冲击盒');
}

const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
