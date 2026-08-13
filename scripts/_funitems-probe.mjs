// §4 乐器 + §5 趣味道具端到端探针（508 竖琴 / 4673 鼓槌 / 856 棍上独角兽 /
//  1450 泡泡棒 / 5464 Mitey-Titey / 1345 彩带=纯材料无行为）
//  经 tools/run-diag.mjs 运行；SW_ORIGIN 指向私有静默实例。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { const s = document.querySelector('select'); if (s) s.selectedIndex = 0; });
await page.click('button').catch(() => {});
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// ---------- 场地准备：清出平台 + 主角站位 + 音效录音钩子 ----------
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -24; dx <= 24; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -24; dx <= 24; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.player.vx = 0; g.player.vy = 0;
  window.__sfxCalls = [];
  g.sfx.playWavFile = (file, vol, x, y, pitch) => {
    window.__sfxCalls.push({ file, pitch: pitch ?? null });
    return true;
  };
  // 静置等主角落到平台上
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
});

/** 手持某物品单击一次。worldDx/worldDy = 鼠标世界位相对主角中心的偏移（精确）。 */
async function useOnce(itemKey, worldDx, worldDy, opts = {}) {
  return page.evaluate(([key, dx, dy, o]) => {
    const g = window.__swGame;
    const id = window.__swItems[key];
    if (id === undefined) return { missing: key };
    // 状态清零：防上一件的 swing/useTime 残留污染断言
    g.swing = null;
    g.player.useTime = 0;
    g.input.mouseDown = false; g.input.mouseHeld = false;
    g.player.inv.add(id, 1);
    const slots = g.player.inv.slots;
    const bi = slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
    g.player.inv.selected = 0;
    // 鼠标世界位 → 屏幕位（Camera.screenToWorld 的精确逆）
    const cam = g.camera;
    const wx = g.player.cx + dx, wy = g.player.cy + dy;
    const sx = (wx - cam.x) * cam.zoom + cam.viewW / 2;
    const sy = (wy - cam.y) * cam.zoom + cam.viewH / 2;
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    window.__sfxCalls.length = 0;
    const ticks = o.ticks ?? 1;
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    const held = g.player.inv.slots[0];
    return {
      useTime: g.player.useTime,
      stack: held && held.id === id ? held.stack : -1,
      sfx: window.__sfxCalls.slice(),
      swing: !!g.swing,
      zoom: cam.zoom,
      axis: Math.min(g.renderer.canvas.width, g.renderer.canvas.height),
    };
  }, [itemKey, worldDx, worldDy, opts]);
}

// ========== 1) 508 竖琴：按鼠标距离变调（Player.cs:45905-45936） ==========
//   pitch 映射：n=dist/(axis/2) 钳 1 → n*2−1 → Round(·6)/6
//   dist=0 → −1；dist=axis/4 → 0；dist≥axis/2 → +1
const axis0 = await page.evaluate(() => Math.min(window.__swGame.renderer.canvas.width, window.__swGame.renderer.canvas.height));
const harpCenter = await useOnce('vi_508_Harp', 0, 0);
check('竖琴·零距 = 最低音 pitch −1', harpCenter.sfx.length === 1
  && harpCenter.sfx[0].file === 'Item_26' && harpCenter.sfx[0].pitch === -1,
  JSON.stringify(harpCenter.sfx));
check('竖琴·useTime=12（Item.cs:7407）', harpCenter.useTime === 12, `useTime=${harpCenter.useTime}`);

const harpMid = await useOnce('vi_508_Harp', axis0 / 4, 0);
const harpMidNote = harpMid.sfx.filter((s) => s.file === 'Item_26');
check(`竖琴·axis/4（${Math.round(axis0 / 4)}px）= 中音 pitch 0`, harpMidNote.length === 1
  && harpMidNote[0].pitch === 0, JSON.stringify(harpMid.sfx));

const harpFar = await useOnce('vi_508_Harp', axis0, 0);
check('竖琴·超半屏钳上界 = pitch +1', harpFar.sfx.length === 1
  && harpFar.sfx[0].pitch === 1, JSON.stringify(harpFar.sfx));

// ========== 2) 4673 鼓槌：站上鼓组 tile 486 才发声（Player.cs:46003-46023） ==========
const offDrum = await useOnce('vi_4673_DrumStick', 300, 0);
check('鼓槌·离鼓组 = 挥动但无声', offDrum.swing && offDrum.sfx.length === 0,
  `swing=${offDrum.swing} sfx=${JSON.stringify(offDrum.sfx)}`);

/** 在主角中心格摆鼓组并验证 */
async function placeDrum() {
  return page.evaluate(() => {
    const g = window.__swGame;
    const drum = window.__swTiles['v_486_drum_set'];
    const tx = Math.floor(g.player.cx / 16), ty = Math.floor(g.player.cy / 16);
    g.world.store.setTile(tx, ty, drum, 0, 0);
    return { drum, tx, ty, here: g.world.store.get(tx, ty) };
  });
}
const onDrum = await placeDrum();
check('鼓组 tile 已摆放（tile 486 注册且落格）', onDrum.drum !== undefined && onDrum.here === onDrum.drum,
  JSON.stringify(onDrum));

// 300px 世界距（zoom<1 时归一 >0.6）→ Item_57 档
const drumHit = await useOnce('vi_4673_DrumStick', 300, 0);
check('鼓槌·站鼓组远距 = 高档音色', drumHit.sfx.length === 1
  && /^Item_(53|54|55|56|57|58|59|60|61|62)$/.test(drumHit.sfx[0].file),
  JSON.stringify(drumHit.sfx));
check('鼓槌·useTime=12（Item.cs:38495）', drumHit.useTime === 12, `useTime=${drumHit.useTime}`);

// 近距（10px → 归一 <0.1）→ 兜底档 Item_60
const drumStill = await placeDrum();
const drumNear = await useOnce('vi_4673_DrumStick', 10, 0);
check('鼓槌·近距 = 兜底档 Item_60（:46155-46156）', drumNear.sfx.length === 1
  && drumNear.sfx[0].file === 'Item_60',
  `sfx=${JSON.stringify(drumNear.sfx)} drumStill=${drumStill.here === drumStill.drum}`);

// ========== 3) 856 棍上独角兽：useStyle16 = 纯声响玩具（Item.cs:11387-11399） ==========
//  useStyle16（PlaySound,ItemUseStyleID.cs:37）在 ApplyUseStyle 无专属分支
// （Player.cs:49928-50374 仅 1/7/9/6/2/11/3/4/5/13）——姿势回落默认持位，
// 行为本体 = UseSound Item196。仓库通用使用路径会给一件 swing（姿势按
// useStyle16 路由），与原版"itemAnimation 起但无姿势变化"等价。
const unicorn = await useOnce('vi_856_UnicornonaStick', 0, 0);
check('独角兽·播放 UseSound Item_196', unicorn.sfx.length === 1
  && unicorn.sfx[0].file === 'Item_196', JSON.stringify(unicorn.sfx));
check('独角兽·useTime=10（Item.cs:11396）', unicorn.useTime === 10, `useTime=${unicorn.useTime}`);

// ========== 4) 1450 泡泡棒：挥动期喷气泡 gore（Player.cs:44431-44461） ==========
const wand = await useOnce('vi_1450_BubbleWand', 0, 0);
check('泡泡棒·挥动启动（useStyle1）', wand.swing === true, `swing=${wand.swing}`);
check('泡泡棒·useTime=25（Item.cs:17956）', wand.useTime === 25, `useTime=${wand.useTime}`);

// 气泡 gore：继续跑 30 tick 收集掷骰产物
await page.evaluate(() => {
  const g = window.__swGame;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
});
const bubbles = await page.evaluate(() => {
  const list = window.__swGore();
  const bub = list.filter((p) => p.goreId >= 411 && p.goreId <= 430);
  return { total: list.length, bubbleCount: bub.length, ids: bub.map((p) => p.goreId) };
});
check('泡泡棒·气泡 gore 入池（411-430 族，NewGore 尾段四族扩散）', bubbles.bubbleCount > 0,
  JSON.stringify(bubbles));

// 上浮推进（gore tick 接通）：60 tick 后存活气泡 y 净减小或已爆裂离池
const float = await page.evaluate(() => {
  const before = window.__swGore().filter((p) => p.goreId >= 411 && p.goreId <= 430)
    .map((p) => [p, p.y]);
  const g = window.__swGame;
  for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
  const after = window.__swGore().filter((p) => p.goreId >= 411 && p.goreId <= 430);
  return {
    n0: before.length, n1: after.length,
    movedUp: before.filter(([p, y0]) => !p.dead && p.y < y0 - 2).length,
    died: before.filter(([p]) => p.dead).length,
  };
});
check('泡泡棒·气泡上浮推进/爆裂（gore tick 已接通）', float.movedUp > 0 || float.died > 0,
  JSON.stringify(float));

// ========== 5) 5464 Mitey-Titey：放置 echo 钟乳石 tile 693 且不消耗（Item.cs:43085-43093） ==========
const place = await page.evaluate(() => {
  const g = window.__swGame;
  g.swing = null; g.player.useTime = 0;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const id = window.__swItems['vi_5464_MiteyTitey'];
  g.player.inv.add(id, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === id);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  const tile693 = window.__swTiles['v_693_mitey_titey'];
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const cam = g.camera;
  const tryPlace = (tx, ty) => {
    st.setTile(tx, ty, 0, 0, 0);
    st.setTile(tx, ty + 1, 2, 0, 0);      // 下方实心支撑（hasSupport 门）
    const sx = (tx * 16 + 8 - cam.x) * cam.zoom + cam.viewW / 2;
    const sy = (ty * 16 + 8 - cam.y) * cam.zoom + cam.viewH / 2;
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.player.useTime = 0;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    return st.get(tx, ty);
  };
  const placed0 = tryPlace(px + 2, py + 1);
  const held = g.player.inv.slots[0];
  const stack0 = held && held.id === id ? held.stack : -1;
  const placed1 = tryPlace(px + 3, py + 1);
  const held2 = g.player.inv.slots[0];
  return {
    tile693, placed0, placed1,
    stack0, stack1: held2 && held2.id === id ? held2.stack : -1,
  };
});
check('Mitey-Titey·tile 693 已注册', place.tile693 !== undefined, JSON.stringify(place.tile693));
check('Mitey-Titey·第一次放置成功（格内 = v_693）', place.placed0 === place.tile693,
  `placed=${place.placed0} expect=${place.tile693}`);
check('Mitey-Titey·不消耗（stack 恒 1,Item.cs:43089 consumable=false）',
  place.stack0 === 1 && place.stack1 === 1, `stack0=${place.stack0} stack1=${place.stack1}`);
check('Mitey-Titey·第二次放置成功（无限放置）', place.placed1 === place.tile693,
  `placed1=${place.placed1}`);

// ========== 6) 1345 彩带：纯合成材料，使用无行为（Item.cs:16620-16629） ==========
//  useStyle1 挥动照常（原版 itemAnimation 也起），但无 UseSound/shoot/createTile
//  → 无任何效果；consumable 无作用对象 → 不消耗。
const confetti = await useOnce('vi_1345_Confetti', 0, 0);
check('彩带·无使用效果（无音效——Player.cs 全源零引用 = 纯合成材料）',
  confetti.sfx.length === 0, JSON.stringify({ sfx: confetti.sfx }));
check('彩带·不消耗', confetti.stack === 1, `stack=${confetti.stack}`);

// ========== 7) 收尾：主角存活 + 页面无错 ==========
const alive = await page.evaluate(() => {
  const g = window.__swGame;
  return { playerDead: g.player.dead, hp: g.player.hp };
});
check('全程主角存活（趣味使用族无副作用伤害）', alive.playerDead === false, JSON.stringify(alive));
check('全程无 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
await browser.close();
process.exit(fail ? 1 : 0);
