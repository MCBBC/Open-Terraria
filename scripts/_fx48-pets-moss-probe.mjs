// SW-FX48 实机探针：1.4.5 boss 宠 21 件消费面 + 苔藓掉落链实机复验。
//   (0) 装备 4797 Royal Delight（miscEquips[0]）→ updatePets 自然召唤 881 跟随体
//       + 史莱姆王子 284 buff 补挂 60s（Player.cs:17414-17425 面）
//   (1) 光宠 4811 Jewel of Light → lightPetFollower 895 + 仙灵公主 298
//   (2) TogglePet 隐藏臂：follower 死亡 + buff 清（:17447-17451）→ 解除重挂
//   (3) LongMoss 刮苔藓实机：tile 184 col 9 → 真实 spawnDrop 出 5127 世界掉落物
//       （Player.cs:42143-42189;Math.random 暂钉 0 保证 1/9 掷中确定性）
// 运行:node tools/probe.mjs run scripts/_fx48-pets-moss-probe.mjs --vite=auto --size=small
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
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
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('FX48');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click();
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

  const items = await import('/src/data/items.ts');
  const buffs = await import('/src/stats/Buffs.ts');
  const { petInfoOfVid } = await import('/src/data/vanillaPets.ts');
  const iidOf = (vid) => items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[vid]];

  // ---- 玩家脚下整平（防交互分支误触）----
  const st = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(6, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st.isSolid(Math.floor(p.cx / TILE), Math.floor((p.y + p.h / 2) / TILE))) break;
    sy -= 1;
  }
  for (let dx = -12; dx <= 12; dx++) {
    for (let dy = -8; dy <= 2; dy++) {
      const i = st.idx(px + dx, sy + dy);
      if (dy < 0) { st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0; }
    }
    st.setTileSilent(px + dx, sy, 2);
  }
  p.vx = 0; p.vy = 0;
  g.input.uiBlocking = false;
  for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);

  // ---- (0) boss 宠召唤链 ----
  if (g.petFollower && !g.petFollower.dead) g.petFollower.dead = true;
  if (g.lightPetFollower && !g.lightPetFollower.dead) g.lightPetFollower.dead = true;
  const pet = petInfoOfVid(4797);
  ck('(0) pets 表 4797 → buff284/proj881', !!pet && pet.buff === 284 && pet.proj === 881 && !pet.light,
    JSON.stringify(pet));
  p.inv.miscEquips[0] = { id: iidOf(4797), stack: 1 };
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  R.dbg.petProj = g.petFollower ? g.petFollower.projId : null;
  ck('(0) updatePets 自然召唤 881 跟随体', !!g.petFollower && !g.petFollower.dead && g.petFollower.projId === 881,
    `proj=${R.dbg.petProj}`);
  const kt = p.buffs.active.get(buffs.BuffType.KingSlimePet);
  ck('(0) 史莱姆王子 284 补挂(3600t=60s,实机已折损 tick)', p.buffs.has(buffs.BuffType.KingSlimePet)
    && kt !== undefined && kt > 55 && kt <= 60, `t=${kt}`);
  await new Promise((r) => setTimeout(r, 1250));
  const ui = window.__swUI;
  ck('(0) buff 图标在 UI 槽通道（petBuffBlocks 0）', !!ui?.petBuffBlocks?.get(0),
    `has=${!!ui?.petBuffBlocks?.get(0)}`);

  // ---- (1) 光宠槽 1 ----
  p.inv.miscEquips[1] = { id: iidOf(4811), stack: 1 };
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  ck('(1) 光宠 895 上 lightPetFollower', !!g.lightPetFollower && !g.lightPetFollower.dead && g.lightPetFollower.projId === 895,
    `proj=${g.lightPetFollower ? g.lightPetFollower.projId : null}`);
  ck('(1) 仙灵公主 298 补挂', p.buffs.has(buffs.BuffType.FairyQueenPet),
    `lightPetFlag=${petInfoOfVid(4811).light}`);
  // 宠物图标通道挂在 refreshBuffs（1Hz onBuffsChanged :10192 + 施加事件 :36724）——
  // 等一个 1Hz 周期再验（onBuffsFrame 逐帧通道未接线=登记债,见批报告）
  await new Promise((r) => setTimeout(r, 1250));
  ck('(1) 光宠图标槽 1 通道（1Hz refreshBuffs 内）', !!ui?.petBuffBlocks?.get(1), `has=${!!ui?.petBuffBlocks?.get(1)}`);

  // ---- (2) TogglePet 隐藏/恢复 ----
  g.togglePetSlot(0);
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  ck('(2) 隐藏臂：跟随体灭 + buff 清', (!g.petFollower || g.petFollower.dead)
    && !p.buffs.has(buffs.BuffType.KingSlimePet), '');
  g.togglePetSlot(0);
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  ck('(2) 解除隐藏次帧重挂 284', !!g.petFollower && !g.petFollower.dead
    && p.buffs.has(buffs.BuffType.KingSlimePet), '');

  // ---- (3) LongMoss 刮苔藓实机（col 9 → 5127）----
  p.inv.miscEquips[0] = null; p.inv.miscEquips[1] = null;
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  const mossSheet = (await import('/src/data/tiles.ts')).TILE_BY_KEY['v_184_moss_plants'];
  const tx = px + 3, ty = sy - 1;                       // 头顶旁空格
  st.setTileSilent(tx, ty, mossSheet, 9 * 22, 0);      // frameX/22 = col 9
  const before = g.entities.drops.length;
  const rndBak = Math.random;
  Math.random = () => 0;                                // 1/9 掷中钉死
  try {
    g.player.useTime = 0;
    g.tryUsePaintTool(tx, ty, items.ITEM_DEFS[iidOf(1100)]);
  } finally { Math.random = rndBak; }
  const drops = g.entities.drops.slice(before).filter((d) => d && !d.dead);
  const { vanillaIdOfItem } = await import('/src/stats/Shimmer.ts');
  const mossDrop = drops.find((d) => vanillaIdOfItem(d.itemId) === 5127);
  R.dbg.dropKeys = drops.map((d) => items.ITEM_DEFS[d.itemId]?.key);
  ck('(3) 刮苔藓 col9 → 5127 Neon Moss 世界掉落物', !!mossDrop, JSON.stringify(R.dbg.dropKeys));
  ck('(3) 掉落物可拾取（ ItemDrop 实体入 drops 桶）', drops.length > 0 && !!mossDrop, '');

  // ---- (4) 21 件全表在仓烟测（buff 反查零落空,实机域）----
  let missing = 0;
  for (let vid = 4797; vid <= 4817; vid++) {
    const pi = petInfoOfVid(vid);
    const bt = pi ? buffs.buffTypeByVanilla(pi.buff) : undefined;
    if (!pi || bt === undefined || !items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[vid]]) missing++;
  }
  ck('(4) boss 宠 21 件实机域零缺（pets 行+buff 反查+物品注册）', missing === 0, `missing=${missing}`);

  return R;
});

for (const c of (out?.checks ?? [])) check(c.n, c.ok, c.d ?? '');
for (const e of errors.slice(0, 5)) check('页面零异常', false, e);
console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail === 0 ? 0 : 2);
