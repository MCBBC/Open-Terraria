// ★BJ650件1 返工实机探针（2026-10-13 用户实报「本体右上品红半透影子=不同颜色」）：
//   定谳=色相源 whoAmI 误用 this.id（EntityManager 全实体递增计数器）→ 档位随会话
//   总生成数漂移落高档 4/5=品红;修=出生拍注册表插入位懒快照（原版 Main.projectile
//   首空闲槽对映）。嫌疑「辉光位偏二次旋转」已否证（位偏 translate 先于 rotate 烘入
//   =世界系;原版 AI_169 空闲档 rot=π 与仓内同值 :46612-46614）。
// 判据：
//   ① whoAmI=注册表插入位（干净局≈0）→ 辉光/残影 hue 0.66 蓝紫档（旧 id 源=漂移档）;
//   ② 像素分类：刃周高饱和像素主 hue 落蓝紫域（<0.8）,品红簇（>0.85）占比显著低于
//      旧实现（实报品红形态）;
//   ③ 真机截图 docs/evidence/bj650-rework/（闲置辉光 + 僵尸靶引冲刺拉残影）。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj650-glow-shot.mjs
import { mkdirSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, savePageShot, resolveShotPath,
} from '../tools/probe/lib/index.mjs';

const OUT = '/tmp/probe-out/bj650-rework';
mkdirSync(OUT, { recursive: true });
const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: 'bj650glow', size: 'small' });
L.chk('世界已建', gen.ok);
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
});

// ---- 布景：僵尸靶（引冲刺拉残影）+ 刃杖 864 本体直召（走真 fixedUpdate 快照面）----
const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  g.__bj650tag = 42;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const px = Math.trunc(g.player.cx), py = Math.trunc(g.player.cy);
  const st = g.world.store;
  let gy = Math.trunc(py / 16);
  while (gy < st.h - 2 && !st.isSolid(Math.trunc(px / 16), gy)) gy++;
  const e = Enemy.fromVanilla(3, px + 300, (gy - 1) * 16 - 20);
  e.maxHp = 500000; e.hp = 500000; e.vx = 0; e.vy = 0;
  g.entities.add(e, 'enemies');
  const m = new MinionProj(px + 60, py - 30, 864, 6, 0, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  // 随从 buff 维持凭证（附魔飞刀=271;缺 buff=upkeep 同拍直杀 :3398-3410）
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 300);
  window.__bj650probe = { added: true, projCount: g.entities.projectiles.length,
    enemyCount: g.entities.enemies.length, bt };
  return { px, py, gy, projCount: g.entities.projectiles.length, bt };
});
L.chk('布景完成', !!setup, JSON.stringify(setup));
L.say(`add 后快照: ${JSON.stringify(await page.evaluate(() => window.__bj650probe))}`);

// 驱动 ~90 拍（冲刺/残影/辉光进入稳态）——中途两拍诊断（实例替换/清扫面定位）
await wait(400);
L.say(`t+400ms: ${JSON.stringify(await page.evaluate(() => {
  const g = window.__swGame;
  return { tag: g.__bj650tag, proj: g.entities.projectiles.length, enemy: g.entities.enemies.length };
}))}`);
await wait(1200);

const state = await page.evaluate(() => {
  const g = window.__swGame;
  const all = g.entities.projectiles;
  const m = all.find((p) => p.projId === 864);
  const diag = { total: all.length, ids: all.slice(0, 8).map((p) => `${p.projId}${p.dead ? 'D' : ''}`) };
  if (!m) return { err: 'no 864', ...diag };
  return { ...diag, dead: m.dead, whoAmI: m.whoAmI, id: m.id, tier: ((m.whoAmI < 0 ? 0 : m.whoAmI) % 6),
    cx: m.cx, cy: m.cy, rot: m.rot, ring: m.ghostRing ? m.ghostRing.filled : -1 };
});
L.say(`864 状态: ${JSON.stringify(state)}`);
L.chk('whoAmI 快照=注册表插入位（0 档蓝紫,非 id 漂移档）', state.whoAmI === 0,
  `whoAmI=${state.whoAmI} id=${state.id} tier=${state.tier}`);
L.chk('残影环在填充', state.ring >= 2, `filled=${state.ring}`);

// 像素分类：游戏画布刃周 80px 半径窗内高饱和像素 hue 分布（蓝紫域 vs 品红簇）
const hue = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const ctx = cv.getContext('2d');
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  if (!m) return { blue: 0, magenta: 0, body: 0, total: 0, err: 'no 864' };
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  // cam.x/y = 视野中心（Camera.ts:7）——屏位 = (world−cam)×z + 半屏
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const R = 48;
  const x0 = Math.max(0, Math.trunc(sx - R)), y0 = Math.max(0, Math.trunc(sy - R));
  const x1 = Math.min(cv.width, Math.trunc(sx + R)), y1 = Math.min(cv.height, Math.trunc(sy + R));
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  let blue = 0, magenta = 0, body = 0;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 40) continue;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < 0.25 || mx < 70) continue;             // 灰背景/暗域不入
    const df = mx - mn;
    let h;
    if (mx === r) h = ((gg - b) / df) % 6;
    else if (mx === gg) h = (b - r) / df + 2;
    else h = (r - gg) / df + 4;
    h = (h / 6 + 1) % 1;
    if (h >= 0.85 || h < 0.02) magenta++;            // 品红簇（0.85-1.0 档=旧漂移形态）
    else if (h >= 0.5 && h < 0.85) blue++;           // 蓝紫域（0.5-0.85=身体紫+0.66 档辉光）
    else body++;
  }
  return { blue, magenta, body, total: blue + magenta + body };
});
L.say(`刃周像素分类: ${JSON.stringify(hue)}`);
L.chk('品红簇占比 < 12%（旧漂移形态=主簇）', hue.magenta / Math.max(1, hue.total) < 0.12,
  `magenta=${hue.magenta}/${hue.total} (${(100 * hue.magenta / Math.max(1, hue.total)).toFixed(1)}%)`);

const shot1 = await savePageShot(page, resolveShotPath('bj650-glow-idle.png'));
L.say(`截图: ${shot1}`);

// 冲刺拉残影：驱一拍冲刺态（twA0 等价面=直接置 velocity 脉冲）再截
await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  m.vx = -6; m.vy = -1.5;
});
await wait(700);
const shot2 = await savePageShot(page, resolveShotPath('bj650-glow-trail.png'));
L.say(`截图: ${shot2}`);

// 3× 局部放大（刃周 160px 窗）——辉光/残影色相取证图
const zoomed = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  if (!m) return null;
  const cam = g.camera;
  const z = cam.zoom ?? 1;
  const sx = (m.cx - cam.x) * z + cv.width / 2, sy = (m.cy - cam.y) * z + cv.height / 2;
  const W = 160, H = 160;
  const out = document.createElement('canvas');
  out.width = W * 3; out.height = H * 3;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(cv, sx - W / 2, sy - H / 2, W, H, 0, 0, W * 3, H * 3);
  return out.toDataURL('image/png');
});
if (zoomed) {
  const { writeFile } = await import('node:fs/promises');
  const p3 = resolveShotPath('bj650-glow-zoom3x.png');
  await writeFile(p3, Buffer.from(zoomed.split(',')[1], 'base64'));
  L.say(`截图: ${p3}`);
}

L.say(`耗时 ${L.elapsed()}`);
L.print();
process.exit(L.ok ? 0 : 2);
