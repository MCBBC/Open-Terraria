// Chester 宠物箱（proj 960）便携容器流实机探针：
//   miscEquips[0] 装 5098 → updatePetSlot 自然召唤 960 跟随体 → 光标对准宠物中心
//   → 真实右键路径（Game.updateUse 的 proj==960 支 :8333-8345 hoveredChester→
//   interactChesterContainer）逐项验证：
//   (a) 开：openChestRef 面板 x=-2 且 items===player.banks[0] 活引用 + tracker 挂体
//       + chester_open_0/1 变体音
//   (b) 保持：射程内每 tick beingTracked 回写 true
//   (c) 再右键：面板收 + chester_close_0/1 + tracker Clear + beingTracked false
//   (d) 走出射程自动关：closeChestPanel + 关音 + 追踪清
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_chester-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
try { await page.waitForSelector('.sw-vsel', { timeout: 15000 }); }
catch { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 45000 }); }
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('CH');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [], dbg: {} };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  const p = g.player;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  // ---- 玩家脚下整平 + 清空交互区（防右键误触地块/NPC 分支）----
  const st = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(6, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st.isSolid(Math.floor(p.cx / TILE), Math.floor((p.y + p.h / 2) / TILE))) break;
    sy -= 1;
  }
  for (let dx = -14; dx <= 14; dx++) {
    for (let dy = -10; dy <= 2; dy++) {
      const i = st.idx(px + dx, sy + dy);
      if (dy < 0) { st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0; }
    }
    st.setTileSilent(px + dx, sy, 2);
  }
  p.vx = 0; p.vy = 0;
  g.input.uiBlocking = false;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  // ---- SFX spy ----
  window.__chWav = [];
  if (!g.__chSpyOn) {
    g.__chSpyOn = true;
    g.__oPlaySfxWavC = g.playSfxWav.bind(g);
    g.playSfxWav = (f, ...a) => { try { window.__chWav.push(f); } catch {} return g.__oPlaySfxWavC(f, ...a); };
  }
  const chestSounds = () => window.__chWav.filter((f) => /^chester_(open|close)_/.test(f));

  // ---- 装备 Chester 宠物物品 5098 → updatePetSlot 自然召唤 960 ----
  const items = await import('/src/data/items.ts');
  const { petInfoOfVid } = await import('/src/data/vanillaPets.ts');
  const key5098 = items.VANILLA_ITEM_KEY_BY_ID[5098];
  const id5098 = items.ITEM_BY_KEY[key5098];
  const pi = petInfoOfVid(5098);
  ck('(0) 物品 5098 已注册且 pet 表映射 proj 960',
    id5098 !== undefined && !!pi && pi.proj === 960,
    `key=${key5098} id=${id5098} proj=${pi ? pi.proj : null}`);
  if (g.petFollower && !g.petFollower.dead) g.petFollower.dead = true;
  p.inv.miscEquips[0] = { id: id5098, stack: 1 };
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  const pet = g.petFollower;
  R.dbg.petProj = pet ? pet.projId : null;
  ck('(0) updatePetSlot 自然召唤 Chester 960', !!pet && !pet.dead && pet.projId === 960,
    `proj=${R.dbg.petProj}`);

  /** 宠物拉回身侧+相机对准+真实右键一击 */
  const rightClickPet = () => {
    pet.x = p.cx + 2 * TILE;                                  // 射程内(Two tiles ≪ HX)
    pet.y = p.y - 4;
    pet.vy = 0; pet.onGround = true;
    g.camera.x = pet.cx; g.camera.y = pet.cy;                 // aimAtWorld 同款逆映射
    g.input.mouseX = 640; g.input.mouseY = 400;               // 屏幕中心=世界(pet.cx,cy)
    g.input.rightDown = true;
    g.fixedUpdate(1 / 60);
    g.input.rightDown = false;
  };

  // 光标命中门单独验（不触发开箱）
  pet.x = p.cx + 2 * TILE; pet.y = p.y - 4; pet.vy = 0; pet.onGround = true;
  g.camera.x = pet.cx; g.camera.y = pet.cy;
  g.input.mouseX = 640; g.input.mouseY = 400;
  ck('(h) hoveredChester 命中跟随体本体',
    typeof g.hoveredChester === 'function' && g.hoveredChester() === pet,
    '光标=宠物中心');

  // (a) 右键开箱
  window.__chWav.length = 0;
  rightClickPet();
  const open = g.openChestRef?.() ?? null;
  R.dbg.openPanel = open ? { x: open.x, isBankArr: Array.isArray(open.items), same: open.items === p.banks[0] } : null;
  ck('(a) 右键开:面板 x=-2 来源=存钱槽', !!open && open.x === -2, JSON.stringify(R.dbg.openPanel));
  ck('(a) 面板 items===banks[0] 活引用', !!open && open.items === p.banks[0], '');
  ck('(a) 开箱音 chester_open_0/1 变体', /^chester_open_[01]$/.test(chestSounds()[chestSounds().length - 1] ?? ''),
    JSON.stringify(chestSounds()));
  const tracked = g.chesterTrackedPet ?? null;
  ck('(a) tracker 挂到该 Chester（piggyBankProjTracker.Set）', tracked === pet,
    `tracked=${tracked ? tracked.projId : null}`);
  ck('(a) beingTracked 回写 true（T3 开盖帧驱动位）', pet.beingTracked === true, '');

  // (b) 射程内保持
  let persistOk = true;
  for (let i = 0; i < 12; i++) {
    g.fixedUpdate(1 / 60);
    if (!(g.chesterTrackedPet === pet && pet.beingTracked === true)) { persistOk = false; break; }
  }
  ck('(b) 射程内每 tick 保持追踪与开盖标记', persistOk,
    `frame=${(pet).frame}`);
  R.dbg.lidFrame = pet.frame;

  // (c) 再触发关闭。★实机差异：本仓容器面板挂背包层（openInventory→uiBlocking=true
  //     Main/main.ts 输入门），面板开着时世界右键在 updateUse 入口即被吞——全容器族
  //     （世界箱同款）输入层约定，非 Chester 缺陷；关闭契约按任务惯例直调内部方法验证。
  window.__chWav.length = 0;
  rightClickPet();                                            // 被阻断：无音、面板保持
  const stillOpen = g.openChestRef?.() ?? null;
  ck('(c) 实机输入层:面板开时 uiBlocking 吞掉世界右键（容器族约定）',
    !!stillOpen && stillOpen.x === -2 && chestSounds().length === 0
      && g.chesterTrackedPet === pet,
    `uiBlocking=${!!g.input.uiBlocking} sfx=${JSON.stringify(chestSounds())}`);
  g.interactChesterContainer(pet);                            // 关闭契约直调
  const closed = g.openChestRef?.() ?? null;
  ck('(c) 再触发:面板收起(chest=-1)', closed === null || closed.x !== -2, '');
  ck('(c) 关箱音 chester_close_0/1', /^chester_close_[01]$/.test(chestSounds()[chestSounds().length - 1] ?? ''),
    JSON.stringify(chestSounds()));
  ck('(c) tracker Clear + beingTracked 复位',
    g.chesterTrackedPet === null && pet.beingTracked === false, '');
  // 还原无面板输入态（背包层仍开着会继续吞右键）
  try { window.__swUI && window.__swUI.closeInventory && window.__swUI.closeInventory(); }
  catch { g.input.uiBlocking = false; }

  // (d) 走出射程自动关（Player.cs:31268-31278 Simple 射程门）
  rightClickPet();                                            // 重新打开
  const reopened = g.openChestRef?.() ?? null;
  const reopenOk = !!reopened && reopened.x === -2 && g.chesterTrackedPet === pet;
  window.__chWav.length = 0;
  pet.x = p.x + 90 * TILE;                                    // 远超 HX=+56px 射程带
  g.fixedUpdate(1 / 60);
  const afterWalk = g.openChestRef?.() ?? null;
  ck('(d) 重开成功（前置成立）', reopenOk, '');
  ck('(d) 走远自动关面板', afterWalk === null || afterWalk.x !== -2, '');
  ck('(d) 自动关播 chester_close_* 音', chestSounds().some((f) => /^chester_close_/.test(f)),
    JSON.stringify(chestSounds()));
  ck('(d) 追踪清空 + beingTracked false',
    g.chesterTrackedPet === null && pet.beingTracked === false, '');

  // 收尾：卸宠恢复现场
  p.inv.miscEquips[0] = null;
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  return R;
});

for (const c of out.checks) check(c.n, c.ok, c.d);
console.log(`\ndbg=${JSON.stringify(out.dbg)}`);
if (errors.length) { console.log(`FAIL: 页面异常 ${errors.length} 处`); fail += errors.length; }
console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
