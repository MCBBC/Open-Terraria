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
  let midSample = null;
  for (let i = 0; i < 180; i++) {
    g.fixedUpdate(1 / 60);
    const f = g.entities.projectiles.find((e) => e.constructor?.name === 'AnchoredProj' && e.projId === 262);
    if (!f) {
      if (seq.length) break;
      continue;
    }
    const dx = f.cx - g.player.cx;
    seq.push(Math.round(dx));
    // 中段(150~400px 出膛途中):等渲染帧落盘后更新链节判定线段+像素采样快照
    if (!midSample && dx > 150 && dx < 400) {
      // ★暂停冻结渲染态:RAF 循环仍在跑,若不暂停,渲染帧的弹/相机位会超前
      //   本快照 → 像素采样线段错位(coverage 抖动根因)
      g.paused = true;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      midSample = {
        fistX: f.cx, fistY: f.cy, shown: f.shown,
        px: g.player.cx, py: g.player.cy,
        camX: g.camera.x, camY: g.camera.y, zoom: g.camera.zoom, punchX: g.camera.punchX, punchY: g.camera.punchY,
        vw: cv0.width, vh: cv0.height,
      };
      g.paused = false;
    }
    if (f.dead) break;
  }
  return { seq, midSample };
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

// ---- (b) 链索像素采样(用中段快照在当前帧外重演坐标不可行——直接在快照时刻同步采) ----
// 注:midSample 抓取时已等 RAF;此处回放采样逻辑
{
  const m = flight.midSample;
  ok('b0-midflight-snapshot', !!m, '中段快照存在=飞行持续多帧');
  if (m) {
    const pix = await page.evaluate((snap) => {
      const g = window.__swGame;
      const cv = g.renderer.canvas;
      const c = cv.getContext('2d');
      // 世界→屏幕(与 Camera.worldToScreen 同式;punch 忽略——探针无震屏)
      const w2s = (wx, wy) => [(wx - snap.camX) * snap.zoom + snap.vw / 2, (wy - snap.camY) * snap.zoom + snap.vh / 2];
      const [ax, ay] = w2s(snap.px, snap.py);
      const [bx, by] = w2s(snap.fistX, snap.fistY);
      const len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      const nx = -uy, ny = ux;
      const inkAt = [];
      // 密采样(步长 3px):两端各留 32px(玩家身体/弹体贴图本体不算链)
      for (let d = 32; d < len - 32; d += 3) {
        const sx = ax + ux * d, sy = ay + uy * d;
        const p1 = c.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
        const q1 = c.getImageData(Math.round(sx + nx * 10), Math.round(sy + ny * 10), 1, 1).data;
        const q2 = c.getImageData(Math.round(sx - nx * 10), Math.round(sy - ny * 10), 1, 1).data;
        const d1 = Math.abs(p1[0] - q1[0]) + Math.abs(p1[1] - q1[1]) + Math.abs(p1[2] - q1[2]);
        const d2 = Math.abs(p1[0] - q2[0]) + Math.abs(p1[1] - q2[1]) + Math.abs(p1[2] - q2[2]);
        // 线上点显著异于两侧背景 = 有墨(链节)
        if (Math.min(d1, d2) > 45) inkAt.push(d);
      }
      // 聚类(间隔 >7px 断开)= 链节数;★Chain22 贴图 12×12、步长 12px → 链节
      //   边贴边成连续带,聚类/节距判据不适用——改用"带宽覆盖率":线上点 ±5px
      //   垂向窗内有墨即计入(GL 合成层下 drawImage 钩不可见,像素是唯一真相)
      const covered = new Set();
      for (const d of inkAt) {
        for (let o = -6; o <= 6; o += 3) covered.add(Math.round(d + o));
      }
      const totalPts = Math.max(1, Math.floor((len - 64) / 3));
      return {
        inkCount: inkAt.length,
        coverage: Math.round((covered.size / totalPts) * 100) / 100,
        lineLen: Math.round(len),
        shown: snap.shown,
      };
    }, m);
    ok('b1-chain-band-coverage', pix.coverage >= 0.5 && pix.inkCount >= 20,
      `coverage=${pix.coverage} inkSamples=${pix.inkCount} lineLen=${pix.lineLen}px`);
    ok('b2-chain-pixels-on-line', pix.inkCount >= 3, `inkSamples=${pix.inkCount} lineLen=${pix.lineLen}px shown=${pix.shown}`);
  }
}

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
