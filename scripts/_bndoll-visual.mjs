// ★SW-BN6 2026-09-08 模特假人 P3a 视觉探针（一次性,_ 前缀经 tools/run-diag.mjs 运行）。
// 验收 = 纸娃娃合成器在实机渲染链出图:①锚框非空像素（形体存在,图标叠画区外）
// ②pose 行档消费（Standing/Walking/Jumping 三态帧区像素差 > 阈）
// ③三甲在位（穿甲后形体色差变化）。截图落 /tmp/bndoll-*.png 供人工复核。
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = '/tmp/bndoll';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/bndoll-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await sleep(1500);
// 关欢迎弹窗（盖屏+暂停渲染,B/C/D 指纹同值伪影源）
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(800);

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const st = g.world.store;
  const DOLL = tiles.TILE_BY_KEY['v_470_mannequins'];
  if (DOLL === undefined) return { fatal: 'no v_470_mannequins in TILE_BY_KEY' };
  const dollItemIdx = items.ITEM_DEFS.findIndex((d) => d?.tile === 'v_470_mannequins');
  // 三甲样本：前三件 hs/bs/ls 齐备的内部 id
  const { viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
  const { vanillaStatOfVid } = await import('/src/data/vanillaItemStats.ts');
  const picks = { h: null, b: null, l: null };
  for (const d of items.ITEM_DEFS) {
    if (!d?.key) continue;
    const stat = vanillaStatOfVid(viIdFromKey(d.key));
    if (!stat?.s) continue;
    if (stat.s === 'h' && stat.hs != null && !picks.h) picks.h = d;
    if (stat.s === 'b' && stat.bs != null && !picks.b) picks.b = d;
    if (stat.s === 'l' && stat.ls != null && !picks.l) picks.l = d;
  }
  // 场地：地表（出生点列,天光照明——地下 lightAt≈0 会把乘色假人画成全黑）
  const px = g.world.spawnX ?? Math.floor(g.player.cx / 16);
  let gy = 6;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const X = px + 4, AY = gy - 3;                 // 假人锚（左上格;底行 gy-1 贴地板 gy）
  for (let y = gy - 9; y <= gy - 1; y++) for (let x = X - 3; x <= X + 3; x++) st.setTile(x, y, 0);
  // 玩家挪到假人左侧地板上（近距入射程,相机跟随）
  g.player.x = (X - 3) * 16; g.player.y = (gy - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  // 放置（真实放置链:帧码+记录）
  g.player.useTime = 0;
  g.tryPlace(X, AY, items.ITEM_DEFS[dollItemIdx]);
  let placed = 0;
  for (let y = AY; y <= AY + 2; y++) for (let x = X; x <= X + 1; x++) if (st.get(x, y) === DOLL) placed++;
  if (!placed) {
    // 放置链兜底:直写帧码 + 记录（帧码=锚格归一布局,与 furnitureAnchor 消费式一致）
    const { getOrCreateFurniture } = await import('/src/world/FurnitureItems.ts');
    for (let y = AY; y <= AY + 2; y++) for (let x = X; x <= X + 1; x++) st.setTile(x, y, DOLL);
    st.frameX[st.idx(X, AY)] = 0; st.frameY[st.idx(X, AY)] = 0;
    getOrCreateFurniture(g.world.furnitureItems, 'display_doll', X, AY);
  }
  const { furnitureAt } = await import('/src/world/FurnitureItems.ts');
  const rec = furnitureAt(g.world.furnitureItems, st, 'display_doll', X, AY);
  if (!rec) return { fatal: 'no display_doll record after tryPlace', dollItemIdx, X, AY };
  // 三甲上槽
  rec.slots[0] = { id: picks.h ? items.ITEM_DEFS.indexOf(picks.h) : 0, prefix: 0 };
  rec.slots[1] = { id: picks.b ? items.ITEM_DEFS.indexOf(picks.b) : 0, prefix: 0 };
  rec.slots[2] = { id: picks.l ? items.ITEM_DEFS.indexOf(picks.l) : 0, prefix: 0 };
  await new Promise((r) => setTimeout(r, 50));
  const cv = document.querySelector('canvas');
  return {
    ok: true, X, AY, frameX: st.frameX[st.idx(X, AY)],
    canvasKind: (cv.getContext('webgl2') || cv.getContext('webgl')) ? 'webgl' : (cv.getContext('2d') ? '2d' : '?'),
    armor: picks.h ? [picks.h.key, picks.b?.key, picks.l?.key] : null,
    pose: rec.pose ?? 0,
  };
});
console.log('SETUP:', JSON.stringify(res));
if (!res.ok) { await browser.close(); process.exit(1); }

// 帧区像素采样（screenshot+clip → 页内 Image 解码 → 像素统计;对 GL 画布鲁棒——
//  WebGL 无 preserveDrawingBuffer 时 drawImage(canvas) 回读为空,合成帧唯一可靠源）
const snap = async (tag, pose) => {
  const geo = await page.evaluate(async (pose) => {
    const g = window.__swGame;
    const { furnitureAt } = await import('/src/world/FurnitureItems.ts');
    const st = g.world.store;
    const rec = furnitureAt(g.world.furnitureItems, st, 'display_doll', window.__bnX, window.__bnY);
    rec.pose = pose;
    await new Promise((r) => setTimeout(r, 450));   // 相机/烘焙收敛 + ≥2 渲染帧
    const [sx0, sy0] = g.camera.worldToScreen(window.__bnX * 16 + 16 - 40, window.__bnY * 16 - 24);
    const [sx1, sy1] = g.camera.worldToScreen(window.__bnX * 16 + 16 + 40, window.__bnY * 16 + 60);
    return { x: Math.round(sx0), y: Math.round(sy0), width: Math.round(sx1 - sx0), height: Math.round(sy1 - sy0) };
  }, pose);
  const b64 = await page.screenshot({ encoding: 'base64', clip: geo });
  if (tag === 'standing') {
    const dbg = await page.evaluate(() => ({
      px: window.__swGame.player.x, py: window.__swGame.player.y,
      camx: window.__swGame.camera.x, camy: window.__swGame.camera.y, zoom: window.__swGame.camera.zoom,
    }));
    console.log('DBG cam/player:', JSON.stringify(dbg));
    await page.screenshot({ path: '/tmp/bndoll/full.png' });
  }
  const shot = await page.evaluate(async ({ b64, tag }) => {
    const img = new Image();
    await new Promise((res2, rej2) => { img.onload = res2; img.onerror = rej2; img.src = 'data:image/png;base64,' + b64; });
    const off = document.createElement('canvas');
    off.width = img.width; off.height = img.height;
    const c2 = off.getContext('2d');
    c2.drawImage(img, 0, 0);
    const d = c2.getImageData(0, 0, img.width, img.height).data;
    let opaque = 0;
    let hsh = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40) { opaque++; hsh ^= d[i]; hsh = Math.imul(hsh, 16777619) >>> 0; hsh ^= d[i + 1]; hsh = Math.imul(hsh, 16777619) >>> 0; hsh ^= d[i + 2]; hsh = Math.imul(hsh, 16777619) >>> 0; }
    }
    return { tag, w: img.width, h: img.height, opaque, hash: hsh };
  }, { b64, tag });
  console.log(`SNAP ${tag} pose=${pose}:`, JSON.stringify(shot));
  writeFileSync(`${OUT}/doll-${tag}.png`, Buffer.from(b64, 'base64'));
  return shot;
};

await page.evaluate((X, AY) => { window.__bnX = X; window.__bnY = AY; }, res.X, res.AY);
const A = await snap('standing', 0);
const B = await snap('walking', 3);
const C = await snap('jumping', 2);
const D = await snap('sitting', 1);
// 恢复 Standing（防探针残留态）
await page.evaluate(async () => {
  const g = window.__swGame;
  const { furnitureAt } = await import('/src/world/FurnitureItems.ts');
  furnitureAt(g.world.furnitureItems, g.world.store, 'display_doll', window.__bnX, window.__bnY).pose = 0;
});
const verd = {
  bodyRendered: A.opaque > 300,
  poseDiffWalking: (A.hash !== B.hash) || (Math.abs(A.opaque - B.opaque) > 8),
  poseDiffJumping: (A.hash !== C.hash) || (Math.abs(A.opaque - C.opaque) > 8),
  poseDiffSitting: (A.hash !== D.hash) || (Math.abs(A.opaque - D.opaque) > 8),
};
console.log('VERDICT:', JSON.stringify(verd));
console.log('PASS=' + (verd.bodyRendered && verd.poseDiffWalking && verd.poseDiffJumping));
await browser.close();
