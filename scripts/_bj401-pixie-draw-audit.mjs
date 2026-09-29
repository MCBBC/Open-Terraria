// BJ401 妖精坐骑（mount 61 Form of the Fae）装备渲染审计探针（IIII236 框架版）：
//  ① 穿戴全套可见装备（盔 90/91/92 + 钴蓝盾 156 + 天使翼 822 + 星星斗篷 532 +
//     腰 53 + 鞋 54 + 泰坦手套 536）+ 纸娃娃 appearance + 静持火把
//  ② 上 mount 61 → camSnapTo 空旷台 → 拍 A
//  ③ 全卸装备+手持 → 拍 B → Node 侧差分 = 装备残留像素物证
// 用法：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_bj401-pixie-draw-audit.mjs
import puppeteer from 'puppeteer-core';
import { gotoApp, waitForBridge, WELCOME_ACK_KEY } from '../tools/probe/lib/boot.mjs';
import { camSnapTo } from '../tools/probe/lib/camera.mjs';
import { screenshot } from '../tools/probe/lib/shot.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT_A = process.env.BJ401_A || '/tmp/bj401-a.png';
const OUT_B = process.env.BJ401_B || '/tmp/bj401-b.png';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1360, height: 860 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await gotoApp(page, ORIGIN);
await waitForBridge(page);
// 预种欢迎公告 ack（探针坑判例：未 ack 覆层挡截图）
await page.evaluate((k) => { try { localStorage.setItem(k, '1'); } catch { } }, WELCOME_ACK_KEY);
// __swFlow.importWld 桥直达（免角色/世界 UI 链——红队 E2E 微型世界 2.7KB）
const wldB64 = readFileSync('/tmp/redteam-e2e.wld').toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(bytes);
}, wldB64);
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const res = { steps: [] };
  const ok = (name, cond, extra) => {
    res.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
    return cond;
  };
  const idOf = (vid) => {
    const key = Object.keys(items).find((k) => k.startsWith(`vi_${vid}_`));
    return key ? items[key] : -1;
  };
  // ★补 appearance（导入档无 appearance → 纸娃娃路径不触达;用户实报场景有纸娃娃）
  p.appearance = {
    name: 'BJ401', hair: 1, skinVariant: 0,
    hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 175, g: 165, b: 140 },
    undershirtColor: { r: 160, g: 180, b: 215 }, pantsColor: { r: 255, g: 230, b: 175 },
    shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 1,
  };
  const equip = [
    [0, idOf(90)], [1, idOf(91)], [2, idOf(92)],   // 盔/甲/腿
    [3, idOf(156)], [4, idOf(822)], [5, idOf(532)], // 盾/翼/披风
    [6, idOf(53)], [7, idOf(54)], [8, idOf(536)],   // 腰/鞋/手套
  ];
  for (const [slot, id] of equip) inv.armor[slot] = id > 0 ? { id, stack: 1 } : null;
  inv.selected = 0;
  inv.slots[0] = { id: idOf(8), stack: 1 };   // 火把静持（holdStyle 1）
  for (let i = 0; i < 3; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(16); }
  const ad = p.equipStats.accDraw;
  ok('accDraw 聚合 shield=1/back=2/shoe=6', ad.shield === 1 && ad.back === 2 && ad.shoe === 6, JSON.stringify({ s: ad.shield, b: ad.back, sh: ad.shoe }));
  ok('翼槽聚合 wing>0', !!p.equipStats.wing);

  // 上 mount 61
  p.mount.setMount(61, p);
  for (let i = 0; i < 10; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(16); }
  ok('骑乘中 type=61', p.ridingMount && p.mount.type === 61, `type=${p.mount.type}`);
  ok('buff 384 钉上', !!p.buffs.active?.has?.(384));
  // 空旷台（传送目标：世界内安全区（离玩家尽量远,甩开镇民）;唯一光源=旁置火把）
  const W = g.world.w, H = g.world.h;
  const fx = Math.min(W - 14, Math.max(14, Math.floor(p.cx / 16) + 60));
  const fy = Math.min(H - 14, Math.max(14, Math.floor((p.y + p.h) / 16)));
  res.worldSize = { W, H };
  for (let dx = -8; dx <= 8; dx++) {
    st.setTile(fx + dx, fy, 1, 0, 0);
    for (let dy = 1; dy <= 6; dy++) st.setTile(fx + dx, fy - dy, 0);
  }
  st.setTile(fx - 5, fy - 1, 4, 0, 0);   // 火把（离玩家 5 格,不入裁剪窗）
  p.x = fx * 16 - 4; p.y = fy * 16 - p.h; p.vx = 0; p.vy = 0;
  res.pad = { fx, fy };
  res.playerBox = { x: p.x, y: p.y, w: p.w, h: p.h };
  res.mountTexture = p.mount.textures?.front ?? null;
  return res;
});
console.log(JSON.stringify(out, null, 1));
// 相机直写到位 → 冻结活循环（g.frame 实例遮蔽 no-op,IIII238 同款零 src 触碰）
//   → 逐状态【手动泵+手动 render()+CDP 截图】三态对比（合成器真值）
//   A=装备+appearance  B=卸装备(留 appearance)  C=装备+appearance=null  D=回A sanity
await camSnapTo(page, out.playerBox.x + 4, out.playerBox.y + 7, { player: false });
await page.evaluate(() => {
  const g = window.__swGame;
  globalThis.__bj401Frame = g.frame;
  g.frame = () => {};   // 实例遮蔽:活循环每帧调 this.frame → 空转(逻辑+渲染全停)
});
const pumpRender = async (n) => {
  await page.evaluate((ticks) => {
    const g = window.__swGame;
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    g.render();
  }, n);
  await new Promise(r => setTimeout(r, 120));   // 合成器 present 余量
};
const statePos = await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  const [sx, sy] = g.camera.worldToScreen(p.cx, p.y + p.h / 2);
  return { sx: Math.round(sx), sy: Math.round(sy), x: Math.round(p.x), y: Math.round(p.y), camX: Math.round(g.camera.x), camY: Math.round(g.camera.y) };
});
console.log('STATEPOS', JSON.stringify(statePos));
const clip = { x: statePos.sx - 100, y: statePos.sy - 120, width: 200, height: 240 };
await pumpRender(20);
await page.screenshot({ path: '/tmp/bj401-A.png', clip });
// B：卸装备（留 appearance）
await page.evaluate(() => {
  const g = window.__swGame, inv = g.player.inv;
  for (let i = 0; i < 20; i++) inv.armor[i] = null;
  inv.slots[inv.selected] = null;
});
await pumpRender(10);
await page.screenshot({ path: '/tmp/bj401-B.png', clip });
// C：装备恢复 + appearance=null
await page.evaluate(() => {
  const g = window.__swGame, p = g.player, inv = p.inv, items = window.__swItems;
  const idOf = (vid) => { const k = Object.keys(items).find((k) => k.startsWith(`vi_${vid}_`)); return k ? items[k] : -1; };
  const equip = [[0,90],[1,91],[2,92],[3,156],[4,822],[5,532],[6,53],[7,54],[8,536]];
  for (const [slot, vid] of equip) inv.armor[slot] = { id: idOf(vid), stack: 1 };
  p.appearance = null;
});
await pumpRender(10);
await page.screenshot({ path: '/tmp/bj401-C.png', clip });
// D：appearance 恢复（=A sanity,应与 A 同相）
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.appearance = {
    name: 'BJ401', hair: 1, skinVariant: 0,
    hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 175, g: 165, b: 140 },
    undershirtColor: { r: 160, g: 180, b: 215 }, pantsColor: { r: 255, g: 230, b: 175 },
    shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 1,
  };
});
await pumpRender(10);
await page.screenshot({ path: '/tmp/bj401-D.png', clip });
console.log('SHOTS A/B/C/D saved');
console.log('pageErrors', JSON.stringify(errs.slice(0, 5)));
await browser.close();
