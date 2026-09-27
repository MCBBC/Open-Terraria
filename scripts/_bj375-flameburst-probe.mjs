// BJ375 爆炸烈焰手杖（3819）弹 666「半贴图」实拍探针 v3。
// 启动 = bgdesert 模板（建角色→建世界 UI 流），headless rAF 节流 → 手动 fixedUpdate 步进。
// 场景 A：3 发独立 Arrow(666)（右/下45/上45，速度 15=T2 档）天空直飞。
// 场景 B：塔 665 落地 + 僵尸诱饵 → 塔开火实拍。
// 产物：/tmp/bj375-full.png + /tmp/bj375-shot-*.png + /tmp/bj375-tower*.png + 日志。
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const OUT = '/tmp/bj375';

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.mouse.click(8, 8);
for (let i = 0; i < 6 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
}
if (!(await page.$('.sw-vsel'))) throw new Error('面板未出现');
// 建角色
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  for (let i = 0; i < 4 && !(await page.$('.sw-char-row input[type=text]')); i++) {
    await page.click('.sw-vsel [data-act=new]').catch(() => {});
    await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  }
  await page.click('.sw-char-row input[type=text]').catch(() => {});
  await page.keyboard.type('bj375p');
  for (let i = 0; i < 4; i++) {
    await page.click('[data-act=create]').catch(() => {});
    if (await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 5000 }).catch(() => false)) break;
  }
}
for (let i = 0; i < 3; i++) {
  if (!(await page.$('.sw-vsel .sw-vitem'))) break;
  try { await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img'); break; }
  catch { await new Promise((r) => setTimeout(r, 800)); }
}
await new Promise((r) => setTimeout(r, 600));
// 建世界（小+固定 seed）
let seedForm = false;
for (let i = 0; i < 3 && !seedForm; i++) {
  await page.click('.sw-vsel [data-act=new]').catch(() => {});
  seedForm = await page.waitForSelector('[data-f=seed]', { timeout: 8000 }).then(() => true).catch(() => false);
  if (!seedForm) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|确定|是/.test(x.textContent ?? ''));
      b?.click();
    }).catch(() => {});
  }
}
if (!seedForm) throw new Error('世界创建表单未出现');
await page.click('[data-f=seed]');
await page.keyboard.type('bj375');
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
await page.click('[data-act=create]');
for (let i = 0; i < 10; i++) {
  const gone = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|已知晓/.test(x.textContent ?? ''));
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 420000, polling: 1000 });
// 关欢迎弹窗（世界就绪后才出现）
for (let i = 0; i < 10; i++) {
  const gone = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|已知晓/.test(x.textContent ?? ''));
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 800));
}
// 手动步进驱动世界运行
await page.evaluate(() => {
  const g = window.__swGame;
  for (let i = 0; i < 240; i++) { try { g.fixedUpdate(1 / 60); } catch { break; } }
});
console.log('[boot] world ready');
await new Promise((r) => setTimeout(r, 800));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = (n) => { for (let i = 0; i < n; i++) { try { g.fixedUpdate(1 / 60); } catch { break; } } };
  const log = { err: [] };
  const p = g.player;
  p.vx = 0; p.vy = 0; p.hp = p.maxHp ?? p.hp;
  step(30);
  // ---- 找地表：玩家脚下为地面基准
  const feetY = p.y + p.h;
  const skyY = feetY - 160;           // 地表上空 160px（留塔与弹同框）
  p.x = p.x; p.y = skyY; p.vy = 0;    // 玩家提到空中悬停（避免挡弹）
  step(2);
  // ---- 场景 B 先行：塔 665 落在原地表（逐列扫实心格取真地表）
  const A = await import('/src/entities/Arrow.ts');
  const M = await import('/src/entities/MinionProj.ts');
  const st = g.world.store;
  const tw = st.w, ty8 = st.type;
  const towerX = p.cx + 60;
  const tx = Math.floor(towerX / 16);
  let surfaceY = 0;
  for (let y = 1; y < st.h; y++) {
    const t = ty8[tx + y * tw];
    if (t && t !== 0) {
      // 实心近似：type>0 且非草木（粗略）——直接取首个非零
      surfaceY = y * 16; break;
    }
  }
  const groundY = surfaceY;
  const tower = new M.MinionProj(towerX, groundY - 58, 665, 40, 2, true, 0, true, () => g.player);
  g.entities.add(tower, 'projectiles');
  // 诱饵僵尸（3=Zombie）放塔前 240px
  let zomb = null;
  try { zomb = await window.__swFlow.spawnVanillaEnemy(3, tower.cx + 240, groundY - 60); } catch (e) { log.err.push('npc:' + String(e).slice(0, 100)); }
  step(10);
  log.tower = { projId: tower.projId, w: tower.w, h: tower.h, facing: tower.facing, sFire: tower.sFire, sFireT: tower.sFireT, sCool: tower.sCool, x: tower.x, y: tower.y, dead: !!tower.dead };
  log.zomb = zomb;
  log.frames666 = A.projFrameCount(666);
  log.frames665 = A.projFrameCount(665);
  const spr = A.projSprite(666);
  log.sprite666 = spr ? { w: spr.width, h: spr.height } : null;
  // 步进直到塔出弹（最多 600 拍）
  let fired = false;
  for (let i = 0; i < 600; i++) {
    step(1);
    if ((g.entities?.projectiles ?? []).some((e) => e.projId === 666 && !e.dead)) { fired = true; break; }
  }
  log.towerFired = fired;
  log.tower2 = { sFire: tower.sFire, sFireT: tower.sFireT, facing: tower.facing };
  step(4);   // 塔弹飞 4 拍
  // ---- 场景 A：判别实验——残影开 vs 关
  const ax = tower.cx + 40;
  const ay = groundY - 140;
  const mk = (ox, oy, dx, dy, tag, noGhost) => {
    const a = new A.Arrow(ax + ox, ay + oy, dx, dy, 40, 2, 666, { grav: 0 });
    a.whipTagShot = true; a.__tag = tag;
    if (noGhost) a.ghostRing = null;   // 先置 null：update 懒建只认 undefined
    g.entities.add(a, 'projectiles');
    return a;
  };
  const s1 = mk(0, -40, 15, 0, 'ghost-on', false);
  const s2 = mk(0, 60, 15, 0, 'ghost-off', true);
  const s3 = mk(0, 80, 10.6, 10.6, 'ghost-off-diag', true);
  step(6);   // 独立弹飞 6 拍
  // ---- 冻结拍照
  g.paused = true;
  // ---- 截屏坐标
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const W = cv.width, H = cv.height;
  const r = g.renderer;
  const z = r.glZoom ?? 1;
  const toScr = (wx, wy) => ({ x: (wx - r.glCamX) * z + W / 2, y: (wy - r.glCamY) * z + H / 2 });
  // 相机跟塔
  const pc = toScr(tower.cx, tower.cy - 40);
  log.playerScr = { x: Math.round(pc.x), y: Math.round(pc.y) };
  log.shots = (g.entities?.projectiles ?? []).filter((e) => e.projId === 666 && !e.dead).map((e) => {
    const s = toScr(e.cx, e.cy);
    return { tag: e.__tag ?? 'towerShot', sx: Math.round(s.x), sy: Math.round(s.y), wx: Math.round(e.x), wy: Math.round(e.y), vx: Math.round(e.vx * 10) / 10, vy: Math.round(e.vy * 10) / 10, dead: !!e.dead, age: e.age };
  });
  const ts = toScr(tower.cx, tower.cy);
  log.towerScr = { x: Math.round(ts.x), y: Math.round(ts.y) };
  log.canvas = { W, H, z };
  return log;
});

await new Promise((r) => setTimeout(r, 600));   // 等 rAF 渲一帧（世界已冻结）
await page.screenshot({ path: OUT + '-full.png' });
for (let i = 0; i < (res.shots?.length ?? 0); i++) {
  const s = res.shots[i];
  const x = Math.max(0, s.sx - 110), y = Math.max(0, s.sy - 110);
  await page.screenshot({ path: `${OUT}-shot-${i}-${s.tag}.png`, clip: { x, y, width: 220, height: 220 } });
}
if (res.towerScr) {
  const x = Math.max(0, res.towerScr.x - 90), y = Math.max(0, res.towerScr.y - 120);
  await page.screenshot({ path: OUT + '-tower.png', clip: { x, y, width: 180, height: 240 } });
}
writeFileSync('/tmp/bj375-log.json', JSON.stringify(res, null, 2));
console.log(JSON.stringify(res));
await browser.close();
