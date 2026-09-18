// BJ124 实机探针：触碰不再解救 + talk 解救 + 685 金钥匙特例 + 解救零音零尘。
// 流程：boot 世界 → 洞穴层干燥点 → 构造 bound goblin_tinkerer + bound town_slime_old
// → A:玩家 AABB 重叠 2.5s（旧触碰臂 15t 内即解救,现应保持 bound）→ B:talk 直调解救
// goblin（dialogNpc+savedGoblin,零 playSfxFiles/零 spawnParticles）→ C:685 无钥 talk
// （toast+不解救,零音）→ D:发金钥匙 327 → talk 解救（playSfxFiles ['unlock'],不开对话）。
// 本脚本只出数据,判读在报告层。GPU 页禁 trace。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

// ---- 找洞穴层干燥落脚点 ----
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const ry = Math.floor(w.rockLevel);
  for (let y = ry + 40; y < Math.min(st.h - 220, ry + 300); y += 2) {
    for (let x = 300; x < st.w - 300; x += 3) {
      if (!st.isSolid(x, y)) continue;
      if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
      if (st.liquid[st.idx(x, y - 1)] > 0 || st.liquid[st.idx(x, y - 2)] > 0) continue;
      return { x, y };
    }
  }
  return null;
});
if (!spot) { console.log('NO_SPOT'); process.exit(1); }
console.log('SPOT', JSON.stringify(spot));

// ---- 装 NPC + 音尘记录器 ----
const setup = await page.evaluate(({ spot }) => {
  const g = window.__swGame;
  const anyNpc = g.entities.npcs.find((n) => n.constructor && n.npcKey);
  if (!anyNpc) return { error: 'no town npc instance' };
  const C = anyNpc.constructor;
  const px = (spot.x + 0.5) * 16;
  const py = spot.y * 16;
  for (const d of [{ key: 'goblin_tinkerer', dx: 0 }, { key: 'town_slime_old', dx: 80 }]) {
    const n = new C(d.key, px + d.dx, py);
    n.bound = true;
    g.entities.add(n, 'npcs');
  }
  // 音尘记录器（解救面取证：spawnParticles/playSfxFiles/onToast 计数与载荷）
  const rec = { dust: [], sfx: [], toast: [] };
  window.__swProbeRec = rec;
  const sd = g.spawnParticles.bind(g), sf = g.playSfxFiles.bind(g);
  g.spawnParticles = (...a) => { rec.dust.push(a.map((v) => String(v))); return sd(...a); };
  g.playSfxFiles = (...a) => { rec.sfx.push(a.map((v) => String(v))); return sf(...a); };
  const ot = g.cb?.onToast?.bind(g.cb);
  if (g.cb) g.cb.onToast = (...a) => { rec.toast.push(a.map((v) => String(v))); return ot?.(...a); };
  return { flags0: { savedGoblin: !!g.world.flags.savedGoblin, unlockedSlimeOldSpawn: !!g.world.flags.unlockedSlimeOldSpawn } };
}, { spot });
console.log('SETUP', JSON.stringify(setup));

// ---- A: 触碰不解救（玩家 AABB 与 goblin 全重叠 2.5s）----
const touch = await page.evaluate(async ({ spot }) => {
  const g = window.__swGame;
  const gob = g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer' && n.bound);
  if (!gob) return { error: 'no bound goblin' };
  g.player.x = gob.x + gob.w / 2 - g.player.w / 2;   // 全重叠（旧 boundTouchCheck 必触发位）
  g.player.y = gob.y + gob.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  const t0 = { dust: window.__swProbeRec.dust.length, sfx: window.__swProbeRec.sfx.length };
  await new Promise((r) => setTimeout(r, 2500));      // ≥ 旧 15t 触发节拍 ×10
  return {
    goblinBound: !!gob.bound, goblinDead: !!gob.dead,
    savedGoblin: !!g.world.flags.savedGoblin,
    dustDelta: window.__swProbeRec.dust.length - t0.dust,
    sfxDelta: window.__swProbeRec.sfx.length - t0.sfx,
  };
}, { spot });
console.log('A_TOUCH', JSON.stringify(touch));

// ---- B: talk 直调解救 goblin（悬停命中盒中心）----
const talk = await page.evaluate(() => {
  const g = window.__swGame;
  const gob = g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer' && n.bound);
  if (!gob) return { error: 'no bound goblin' };
  const t0 = {
    dust: window.__swProbeRec.dust.length, sfx: window.__swProbeRec.sfx.length,
  };
  const ok = g.talkToNearbyNpc(gob.cx, gob.cy);
  return {
    talkReturned: ok,
    goblinBound: !!gob.bound,
    dialogNpcKey: g.dialogNpc ? g.dialogNpc.npcKey : null,
    savedGoblin: !!g.world.flags.savedGoblin,
    dustDelta: window.__swProbeRec.dust.length - t0.dust,
    sfxDelta: window.__swProbeRec.sfx.length - t0.sfx,
  };
});
console.log('B_TALK_RESCUE', JSON.stringify(talk));

// ---- C: 685 无金钥匙 talk（toast+不解救+零音）----
const noKey = await page.evaluate(() => {
  const g = window.__swGame;
  const slime = g.entities.npcs.find((n) => n.npcKey === 'town_slime_old' && n.bound);
  if (!slime) return { error: 'no bound slime' };
  const t0 = { sfx: window.__swProbeRec.sfx.length, toast: window.__swProbeRec.toast.length };
  const ok = g.talkToNearbyNpc(slime.cx, slime.cy);
  return {
    talkReturned: ok,
    slimeBound: !!slime.bound,
    unlockedSlimeOldSpawn: !!g.world.flags.unlockedSlimeOldSpawn,
    sfxDelta: window.__swProbeRec.sfx.length - t0.sfx,
    toastDelta: window.__swProbeRec.toast.length - t0.toast,
  };
});
console.log('C_685_NOKEY', JSON.stringify(noKey));

// ---- D: 发金钥匙 327 → talk 解救（unlock 音+零尘+不开对话）----
const withKey = await page.evaluate(async () => {
  const g = window.__swGame;
  const slime = g.entities.npcs.find((n) => n.npcKey === 'town_slime_old' && n.bound);
  if (!slime) return { error: 'no bound slime' };
  const items = await import('/src/data/items.ts');
  const k = items.VANILLA_ITEM_KEY_BY_ID[327];
  const slot = g.player.inv.slots.findIndex((s) => !s);
  if (slot === -1 || !k) return { error: 'no free slot or no key mapping', key: k ?? null };
  g.player.inv.slots[slot] = { id: items.ITEM_BY_KEY[k], stack: 1, favorited: false, prefix: 0 };
  const t0 = { dust: window.__swProbeRec.dust.length, sfx: window.__swProbeRec.sfx.length };
  const dlgBefore = g.dialogNpc ? g.dialogNpc.npcKey : null;
  await new Promise((r) => setTimeout(r, 100));
  const ok = g.talkToNearbyNpc(slime.cx, slime.cy);
  return {
    keyGranted: k,
    talkReturned: ok,
    slimeBound: !!slime.bound,
    unlockedSlimeOldSpawn: !!g.world.flags.unlockedSlimeOldSpawn,
    dialogChanged: (g.dialogNpc ? g.dialogNpc.npcKey : null) !== dlgBefore,
    keyConsumed: !g.player.inv.slots[slot] || g.player.inv.slots[slot].stack === 0,
    dustDelta: window.__swProbeRec.dust.length - t0.dust,
    sfxCalls: window.__swProbeRec.sfx.slice(t0.sfx),
  };
});
console.log('D_685_WITHKEY', JSON.stringify(withKey));

console.log('VERDICT',
  touch.goblinBound === true && talk.goblinBound === false && talk.savedGoblin === true
    && talk.dustDelta === 0 && talk.sfxDelta === 0
    && noKey.slimeBound === true && noKey.sfxDelta === 0 && noKey.toastDelta === 1
    && withKey.slimeBound === false && withKey.unlockedSlimeOldSpawn === true
    && withKey.dialogChanged === false && withKey.keyConsumed === true
    && withKey.dustDelta === 0
    && withKey.sfxCalls.length === 1 && String(withKey.sfxCalls[0]?.[0]) === 'unlock'
    ? 'PASS' : 'FAIL');
await browser.close();
