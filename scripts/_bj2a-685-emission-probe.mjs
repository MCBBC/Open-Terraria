// 拍板#2A/#3A 实机探针：685 抖箱解救 → TownSlimeTransform 编排粒子【本地发射半边】
// + NPC.Rescued 自创浮字摘除后的反馈面（Unlock 音/无聊天行）。
// 流程：boot 世界 → 洞穴层干燥点 → 放 bound town_slime_old →
//   A: 无钥 talk（consume 门挡 → 零尘零音零上行,toast×1）
//   B: 发金钥匙 327 → talk 解救（d43×30@实体中心±20 + gore 层×8 + unlock 音 +
//      broadcastParticleOrchestra type=26 uniqueInfo=2;零 newText）
//   C: 目视面——再放一只 bound 685,玩家贴身,发钥解救后 80ms/400ms 双截图（/tmp）。
// 本脚本只出数据与截图,判读在报告层。GPU 页禁 trace。
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
await page.evaluate(() => {
  // 欢迎弹窗遮罩（WelcomeAnnounce 挂 onWorldReady,晚于本钩子）——预置 ack 键 + 兜底移除
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ }
  document.getElementById('sw-welcome-announce')?.remove();
});
await new Promise((r) => setTimeout(r, 2000));

// ---- 洞穴层干燥落脚点 ----
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

// ---- 装 bound 685 + 全量记录器（dust/particles/sfx/orch/newText/toast） ----
const setup = await page.evaluate(({ spot }) => {
  const g = window.__swGame;
  const anyNpc = g.entities.npcs.find((n) => n.constructor && n.npcKey);
  if (!anyNpc) return { error: 'no town npc instance' };
  const C = anyNpc.constructor;
  const px = (spot.x + 0.5) * 16;
  const py = spot.y * 16;
  const slime = new C('town_slime_old', px, py);
  slime.bound = true;
  g.entities.add(slime, 'npcs');
  const rec = { dust: [], parts: [], sfx: [], orch: [], chat: [], toast: [] };
  window.__swProbeRec = rec;
  window.__swProbeSlime = slime;
  const sd = g.spawnDust.bind(g), sp = g.spawnParticles.bind(g), sf = g.playSfxFiles.bind(g);
  const bo = g.broadcastParticleOrchestra.bind(g), nt = g.newText.bind(g);
  g.spawnDust = (...a) => { rec.dust.push(a.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : String(v)))); return sd(...a); };
  g.spawnParticles = (...a) => { rec.parts.push(a.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : String(v)))); return sp(...a); };
  g.playSfxFiles = (...a) => { rec.sfx.push(a.map((v) => String(v))); return sf(...a); };
  g.broadcastParticleOrchestra = (...a) => { rec.orch.push(a.map((v) => (typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v))); return bo(...a); };
  g.newText = (...a) => { rec.chat.push(a.map((v) => String(v))); return nt(...a); };
  const ot = g.cb?.onToast?.bind(g.cb);
  if (g.cb) g.cb.onToast = (...a) => { rec.toast.push(a.map((v) => String(v))); return ot?.(...a); };
  return { slimeCx: slime.cx, slimeCy: slime.cy, bound: !!slime.bound };
}, { spot });
console.log('SETUP', JSON.stringify(setup));

// ---- A: 无金钥匙 talk（零发射面）——玩家先贴身（talk 面=距离+悬停双门） ----
const noKey = await page.evaluate(() => {
  const g = window.__swGame;
  const slime = window.__swProbeSlime;
  const rec = window.__swProbeRec;
  g.player.x = slime.x - g.player.w - 20;
  g.player.y = slime.y + slime.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  const t0 = { dust: rec.dust.length, parts: rec.parts.length, sfx: rec.sfx.length, orch: rec.orch.length, chat: rec.chat.length };
  const ok = g.talkToNearbyNpc(slime.cx, slime.cy);
  return {
    talkReturned: ok,
    bound: !!slime.bound,
    dustDelta: rec.dust.length - t0.dust,
    partsDelta: rec.parts.length - t0.parts,
    sfxDelta: rec.sfx.length - t0.sfx,
    orchDelta: rec.orch.length - t0.orch,
    chatDelta: rec.chat.length - t0.chat,
    toastDelta: rec.toast.length,
  };
});
console.log('A_NOKEY', JSON.stringify(noKey));

// ---- B: 发金钥匙 327 → talk 解救（发射面全量） ----
const withKey = await page.evaluate(async () => {
  const g = window.__swGame;
  const slime = window.__swProbeSlime;
  const rec = window.__swProbeRec;
  const items = await import('/src/data/items.ts');
  const k = items.VANILLA_ITEM_KEY_BY_ID[327];
  const slot = g.player.inv.slots.findIndex((s) => !s);
  if (slot === -1 || !k) return { error: 'no free slot or no key mapping', key: k ?? null };
  g.player.inv.slots[slot] = { id: items.ITEM_BY_KEY[k], stack: 1, favorited: false, prefix: 0 };
  await new Promise((r) => setTimeout(r, 100));
  const t0 = { dust: rec.dust.length, parts: rec.parts.length, sfx: rec.sfx.length, orch: rec.orch.length, chat: rec.chat.length };
  const ok = g.talkToNearbyNpc(slime.cx, slime.cy);
  await new Promise((r) => setTimeout(r, 50));
  const dustTypes = rec.dust.slice(t0.dust).map((a) => a[4]);
  const dustCenters = rec.dust.slice(t0.dust).filter((a) => {
    const dx = a[0] - slime.cx, dy = a[1] - slime.cy;
    return Math.hypot(dx, dy) <= 20.01;
  });
  return {
    keyGranted: k,
    talkReturned: ok,
    bound: !!slime.bound,
    flag: !!g.world.flags.unlockedSlimeOldSpawn,
    keyConsumed: !g.player.inv.slots[slot] || g.player.inv.slots[slot].stack === 0,
    dustDelta: rec.dust.length - t0.dust,
    dustAllType43: dustTypes.every((t) => t === 43),
    dustAllNearCenter: dustCenters.length === rec.dust.length - t0.dust,
    partsDelta: rec.parts.length - t0.parts,
    partsPayloads: rec.parts.slice(t0.parts).map((a) => [a[0], a[1], a[2], a[3], a[4]]),
    sfxCalls: rec.sfx.slice(t0.sfx),
    orchCalls: rec.orch.slice(t0.orch),
    chatDelta: rec.chat.length - t0.chat,
  };
});
console.log('B_WITHKEY', JSON.stringify(withKey));

// ---- C: 目视面（第二只 bound 685 置地表出生点、强日光,贴身解救 + 双截图） ----
const visual = await page.evaluate(async ({ spot }) => {
  const g = window.__swGame;
  const { Clock } = await import('/src/world/World.ts');
  const w = g.world;
  w.timeOfDay = (Clock.DAWN + Clock.DUSK) / 2;   // 强日光（地下探针点无光照）
  const st = w.store;
  const C = window.__swProbeSlime.constructor;
  const items = await import('/src/data/items.ts');
  const k = items.VANILLA_ITEM_KEY_BY_ID[327];
  // 地表干燥点（出生点附近,日光直照;单列失败横向外扩）
  const sx = Math.max(40, Math.min(st.w - 40, w.spawnX));
  let sxy = null;
  outer:
  for (let dx = 0; dx <= 40; dx += 2) {
    for (const x of [sx + dx, sx - dx]) {
      if (x < 40 || x >= st.w - 40) continue;
      for (let y = 5; y < Math.floor(w.rockLevel); y++) {
        if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)
          && st.liquid[st.idx(x, y - 1)] === 0 && st.liquid[st.idx(x, y - 2)] === 0) {
          sxy = { x, y };
          break outer;
        }
      }
    }
  }
  if (!sxy) return { error: 'no surface spot' };
  const px = (sxy.x + 0.5) * 16, py = sxy.y * 16;
  const slime2 = new C('town_slime_old', px, py);
  slime2.bound = true;
  g.entities.add(slime2, 'npcs');
  // 玩家贴身（2 格内）让镜头/光照覆盖发射点
  g.player.x = slime2.x - g.player.w - 20;
  g.player.y = slime2.y + slime2.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  const slot = g.player.inv.slots.findIndex((s) => !s);
  if (slot === -1 || !k) return { error: 'no slot/key for visual stage' };
  g.player.inv.slots[slot] = { id: items.ITEM_BY_KEY[k], stack: 1, favorited: false, prefix: 0 };
  await new Promise((r) => setTimeout(r, 1200));   // 镜头稳定
  document.getElementById('sw-welcome-announce')?.remove();   // 兜底（挂点晚于 boot 钩子）
  const diag = {
    region: g.worldRegionIntersects(slime2.x, slime2.y, slime2.w, slime2.h),
    hover: g.npcHoverHit(slime2.vanillaId, slime2.cx, slime2.cy, slime2.x, slime2.y, slime2.w, slime2.h),
    dialogNpc: g.dialogNpc ? g.dialogNpc.npcKey : null,
    playerX: Math.round(g.player.x), playerY: Math.round(g.player.y),
    slimeX: Math.round(slime2.x), slimeY: Math.round(slime2.y),
  };
  const ok = g.talkToNearbyNpc(slime2.cx, slime2.cy);
  window.__swCamTarget = { x: slime2.cx, y: slime2.cy };
  return { diag, talkReturned: ok, bound2: !!slime2.bound, cx: slime2.cx, cy: slime2.cy };
}, { spot });
console.log('C_VISUAL_TALK', JSON.stringify(visual));
// 镜头直钉发射点 + 放大 3×（相机随玩家缓动,直写免等待）+ 紧凑裁剪截图
const focus = await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.x = window.__swCamTarget.x;
  g.camera.y = window.__swCamTarget.y;
  g.camera.zoom = 3; g.camera.zoomTarget = 3;
  return { camX: g.camera.x, camY: g.camera.y, zoom: g.camera.zoom };
});
console.log('FOCUS', JSON.stringify(focus));
await new Promise((r) => setTimeout(r, 60));
await page.screenshot({ path: '/tmp/685-fx-t80ms.png' });
await new Promise((r) => setTimeout(r, 320));
await page.screenshot({ path: '/tmp/685-fx-t400ms.png' });
console.log('SHOTS', '/tmp/685-fx-t80ms.png /tmp/685-fx-t400ms.png');
await browser.close();
process.exit(0);
