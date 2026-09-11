/**
 * SW-BJ59 探针：绿溜冰鞋（RollerSkatesGreenMountItem 5640 → mount 58）法证实机复现。
 *
 * 定谳面：
 *  A. 视觉：召唤坐骑后脚下【绿色一坨】应为零——原版 SetAsRollerSkate（Mount.cs:2596-2606）
 *     四贴图全 Empty → 机身零绘制，修复前走 drawMountLayer 色块近似（'#58C058' 胶囊体）。
 *     手段 = 页内 patch ellipse 记录玩家世界邻域的绿色填充。
 *  B. 鞋甲载体：mount.Active → 鞋面覆写 shoe=28（Player.cs:37096-37115），Acc_Shoes_28
 *     绘制于玩家脚部（截图人眼判型 + drawImage 源高记录）。
 *  C. 速度链：修复前 vanilla-mounts.json 漂移（dashSpeed 7.5 → additive maxRun 10.5 px/t
 *     ≈ 54-58 mph 用户实测）；修复后 1457 终值 1f → maxRun 4 px/t ≈ 20 mph。
 *  D. 滑行-放置速度联动：巡航挡 1.6（默认）→ 2.0（建筑工药水 tileSpeed 0.8）。
 *  E. 轨骑：CanRideMinecartTracks → onTrack/贴轨滑行/跳离。
 *
 * 运行：node tools/probe.mjs run scripts/_bj59.mjs --seed=05162020 --size=small
 */
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, screenshot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj59';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj59 = { green: 0, shoeDraws: 0, blobSamples: [] };
window.__bj59Install = () => {
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj59Patched) return 'already';
  proto.__bj59Patched = true;
  const oEllipse = proto.ellipse;
  const oFill = proto.fill;
  proto.ellipse = function (...a) {
    this.__bj59At = a;
    return oEllipse.apply(this, a);
  };
  proto.fill = function (...a) {
    try {
      const g = window.__swGame;
      const p = g && g.player;
      const t = this.__bj59At;
      if (p && t && t.length >= 6) {
        const [x, y, rx, ry] = t;
        const cw = this.canvas ? this.canvas.width : 0, ch = this.canvas ? this.canvas.height : 0;
        // 屏幕坐标与玩家世界坐标同域（renderer 直绘世界系）
        const near = Math.abs(x - p.cx) < 80 && Math.abs(y - (p.y + p.h)) < 80;
        const style = String(this.fillStyle ?? '');
        if (near && /#58C058|rgb\\(88,\\s*192,\\s*88\\)|green/i.test(style)) {
          window.__bj59.green++;
          window.__bj59.blobSamples.push({ x, y, style, sx: (p.cx).toFixed(0), sy: (p.y + p.h).toFixed(0) });
        }
      }
    } catch {}
    return oFill.apply(this, a);
  };
  return 'ok';
};
window.__bj59Reset = () => { window.__bj59.green = 0; window.__bj59.blobSamples = []; };
`;

const browser = await launchBrowser();
const page = await openPage(browser, { errors: L.fails });
page.__probeOrigin = process.env.SW_ORIGIN;
const boot = await bootstrap(page, process.env.SW_ORIGIN);
L.chk('bootstrap', boot.ok, boot.why ?? '');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('createGame', gen.ok, gen.why ?? '');
await godMode(page, true);
await clearEnemies(page);
await pump(page, 40, { clearEnemies: true });
await page.evaluate(INSTALL);
await page.evaluate('window.__bj59Install()');

// ---- 场景布置：平整地面 + 修复玩家落点 ----
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  const surf = Math.ceil(g.world.groundLevel);
  for (let x = px - 24; x <= px + 24; x++) {
    for (let y = surf - 6; y <= surf + 2; y++) st.setTile(x, y, 0);
    for (let y = surf; y <= surf + 1; y++) st.setTile(x, y, 1);
    st.setLiquid(x, surf - 1, 0, 0);
  }
  g.player.x = px * 16; g.player.y = (surf - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  window.__bj59home = { x: px * 16, y: (surf - 4) * 16 };
  return { px, surf };
});
await pump(page, 30, { clearEnemies: true });
L.say(`prep @ tile(${prep.px}, surf=${prep.surf})`);

// ---- A. 基线（未骑乘）绿色填充采样 ----
await page.evaluate('window.__bj59Reset()');
await pump(page, 20, { clearEnemies: true });
const baseGreen = await page.evaluate('window.__bj59.green');
L.chk('基线无绿色胶囊', baseGreen === 0, `green=${baseGreen}`);

// ---- 召唤绿溜冰鞋（物品使用链：mountOfItem(5640)=58 → useMountItem）----
const iid = await itemByVid(page, 5640);
L.chk('vid5640→iid', Number.isInteger(iid) && iid > 0, `iid=${iid}`);
const summon = await page.evaluate((iid) => {
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  return g.useMountItem(5640);
}, iid);
await pump(page, 30, { clearEnemies: true });
const mstate = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { riding: p.ridingMount, type: p.mount.type, buff: p.mount.buff,
    buff379: p.buffs.has(379), additive: p.mount.movementStatsAdditive,
    accRun: p.equipStats.accRunSpeed };
});
L.chk('mount58 上坐', summon === true && mstate.riding === true && mstate.type === 58,
  JSON.stringify(mstate));
L.say(`buff379 in buffs.has=${mstate.buff379}（mount buff 以 ridingMount 态承载,图标面备案）`);
L.chk('MovementStatsAreAdditive', mstate.additive === true);

// ---- B. 绿色一坨复查（骑乘态）----
await page.evaluate('window.__bj59Reset()');
await pump(page, 30, { clearEnemies: true });
const rideGreen = await page.evaluate('window.__bj59.green');
L.chk('骑乘态零绿色胶囊（修复验证）', rideGreen === 0, `green=${rideGreen} samples=${JSON.stringify(await page.evaluate('window.__bj59.blobSamples.slice(0,3)'))}`);
await screenshot(page, 'bj59-mounted', { time: 'day', wx: prep.px * 16, wy: (prep.surf - 2) * 16, w: 40, h: 26, zoom: 4 });

// ---- C. 速度链：满速帽 = 3+1 = 4 px/t（修复前 10.5）----
await page.keyboard.down('ArrowRight');
const speed = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  let vmax = 0;
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 1000 / 60));
    vmax = Math.max(vmax, Math.abs(p.vx));
  }
  return { vmax, mph: vmax * 5.1136 };
});
await page.keyboard.up('ArrowRight');
L.chk('满速 4 px/t（±0.6）— 1457 additive 终值', Math.abs(speed.vmax - 4) < 0.6,
  `vmax=${speed.vmax.toFixed(3)} ≈ ${speed.mph.toFixed(1)} mph（修复前漂移值 ≈54-58 mph）`);

// ---- D. 滑行-放置速度联动（巡航挡）——置中段速度 2.5（带内），无输入收敛到 cap ----
const coast = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const set = () => { p.x = window.__bj59home.x; p.y = window.__bj59home.y; p.vx = 2.5; p.vy = 0; };
  set();
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 0; i < 70; i++) await new Promise((r) => setTimeout(r, 1000 / 60));
  return { plain: Math.abs(p.vx) };
});
// 建筑工臂：Builder buff → tileSpeed 倒数域 0.8 → num4=8 → cap 2.0
const coast2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  p.buffs.apply(32, 30);                      // BuffType.Builder（raw 1.25；30s 防测量窗内过期）
  p.x = window.__bj59home.x; p.y = window.__bj59home.y; p.vx = 2.5; p.vy = 0;
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 0; i < 70; i++) await new Promise((r) => setTimeout(r, 1000 / 60));
  return Math.abs(p.vx);
});
L.chk('巡航挡默认 ≈1.6（16/10）', Math.abs(coast.plain - 1.6) < 0.3,
  `plain=${coast.plain.toFixed(3)}（${(coast.plain * 5.1136).toFixed(1)} mph）`);
L.chk('建筑工 buff 巡航 ≈2.0（16/8——滑行速度与放置速度相匹配）', Math.abs(coast2 - 2) < 0.35,
  `builder=${coast2.toFixed(3)}（${(coast2 * 5.1136).toFixed(1)} mph）`);

// ---- E. 轨骑（CanRideMinecartTracks=true：上轨/贴轨/跳离）----
const rail = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const px = Math.floor(p.cx / 16);
  const surf = Math.ceil(g.world.groundLevel);
  const row = surf - 2;                                    // 轨行（地面上方一格）
  for (let x = px - 24; x <= px + 24; x++) {
    for (let y = row; y <= surf + 1; y++) st.setTile(x, y, 0);
    st.setTile(x, row, 142, 1, 0xFFFF);                    // 平轨 frame1（两侧连接）
    st.setTile(x, surf, 1);
  }
  // 玩家置于轨上方自由下落
  p.x = (px + 2) * 16; p.y = (row - 4) * 16; p.vx = 0; p.vy = 0;
  p.inputX = 0; p.inputLeft = false; p.inputRight = false;
  const traj = [];
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 1000 / 60));
    traj.push({ i, y: +p.y.toFixed(1), vy: +p.vy.toFixed(2), onTrack: p.onTrack });
    if (p.onTrack) break;
  }
  window.__bj59x0 = p.x;
  return { onTrack: p.onTrack, x0: p.x, traj, row, railLine: row * 16 + 5 };
});
await page.keyboard.down('ArrowRight');                    // 真实键盘驱动（输入管线每拍覆写 player.inputX）
await page.evaluate(async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 1000 / 60));
});
const glide = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { dx: p.x - window.__bj59x0, onTrack: p.onTrack, vx: p.vx };
});
await page.keyboard.up('ArrowRight');
await page.keyboard.down('Space');                         // 跳离（down-保持-up 防落帧间隙扑空）
const jumpDiag = await page.evaluate(async () => {
  const p = window.__swGame.player;
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 1000 / 60));
    seen.push({ i, inputJump: p.inputJump, vy: +p.vy.toFixed(2), onTrack: p.onTrack });
  }
  return seen;
});
await page.keyboard.up('Space');
await page.evaluate(async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 1000 / 60));
});
const after = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { onTrack: p.onTrack, vy: p.vy, inputJump: p.inputJump };
});
L.chk('上轨：下落贴轨 onTrack=true', rail.onTrack === true, JSON.stringify(rail.onTrack));
L.chk('贴轨滑行前进', glide.onTrack === true && glide.dx > 30,
  `dx=${glide.dx?.toFixed(1)} vx=${glide.vx?.toFixed(2)}`);
const airborne = (jumpDiag ?? []).some((s) => s.onTrack === false && s.vy < -1);
L.chk('跳离轨道：腾空帧 onTrack 翻假（原地跳回落回同一轨=原版物理）', airborne && after.onTrack === true,
  JSON.stringify({ airborne, after }));
await screenshot(page, 'bj59-rail', { time: 'day', wx: prep.px * 16, wy: (prep.surf - 2) * 16, w: 60, h: 30, zoom: 3 });

console.log('BJ59-RESULT', JSON.stringify({
  green: { base: baseGreen, ride: rideGreen },
  mount: mstate,
  speed, coast, coast2, rail,
  fails: L.fails,
}));
await browser.close();
