// B5/B6 真机探针:tile 放置读回 + **mod NPC 贴图注入链定谳**(用户实报 NPC 全透明)——
// vimages['vanilla/NPC_<id>.png'] 命中?vnpc 帧解析?drawEnemy 消费面?
// ★page.evaluate import 必须带 .ts(vite dev 无扩展名=第二模块实例判例)。
import { REPO_ROOT, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const SHOT = process.env.SW_SHOT ?? '/tmp/calamity-tile-probe.png';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

// ---- ① 装 calamity.swmod(经 dev server 静态路径取包字节)→ reload → boot ----
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 冷 vite 首访全量 transform:轮询等 __swMods 调试句柄(最长 90s)
for (let i = 0; i < 45; i++) {
  if (await page.evaluate(() => !!window.__swMods).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
// node 侧直读包字节 → base64 过 evaluate(vite dev 静态/@fs 均被 fs.allow 拒;判例)
const pkgB64 = Buffer.from(readFileSync(join(REPO_ROOT, 'mods/dist/calamity.swmod'))).toString('base64');
const install = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { size: bytes.length, ...(await window.__swMods.install(bytes)) };
}, pkgB64).catch((e) => ({ evalFail: String(e).slice(0, 200) }));
console.log('INSTALLED:', JSON.stringify(install).slice(0, 300));
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 30000));   // 大包解压+注册
const boot = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null;
  return {
    loaded: r?.loaded?.map((m) => ({ id: m.manifest.id, counts: m.counts })) ?? null,
    errors: r?.errors ?? null,
  };
}).catch((e) => ({ evalFail: String(e).slice(0, 200) }));
console.log('BOOT:', JSON.stringify(boot));

// ---- ② 进世界:tile 放置/读回/碰撞 ----
const page2 = await browser.newPage();
const errs2 = [];
page2.on('pageerror', (e) => errs2.push('PAGEERR: ' + String(e).slice(0, 200)));
page2.on('console', (m) => { if (m.type() === 'error') errs2.push('CONSOLE: ' + m.text().slice(0, 200)); });
await page2.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 30000));
const ingame = await page2.evaluate(async () => {
  const g = window.__swGame;
  if (!g || !g.player) return { fail: 'no game' };
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const { VANILLA_RECIPES } = await import('/src/data/vanillaRecipes.ts');
  const st = g.world.store;
  const out = {};
  // ① 1×1 矿石:setTile→读回 internal+solid 碰撞
  const oreKey = TILE_BY_KEY['mod_calamity_aerialite_ore_disenchanted'] ?? TILE_BY_KEY['mod_calamity_astral_ore'];
  const oreDef = TILE_DEFS[oreKey];
  const px0 = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 落点=玩家身旁地表(空气上承实心;实心位 setTile 静默拒=放置守卫非缺陷)
  const findSurf = (col) => {
    for (let y = py - 8; y <= py + 8; y++) {
      if (st.get(col, y) === 0 && st.get(col, y + 1) !== 0) return y;
    }
    return py - 2;
  };
  const px = px0 + 6, oy = findSurf(px);
  st.setTile(px, oy, oreKey);
  const t1v = st.get(px, oy);
  out.ore = {
    key: 'mod_calamity_aerialite_ore_disenchanted', internal: oreKey,
    placed: t1v === oreKey,
    solid: oreDef?.solid, drop: oreDef?.drop, framed: oreDef?.framed ?? false,
  };
  // ② 站点 4×2 分格放置(cosmic_anvil)→ 全格读回
  const stKey = TILE_BY_KEY['mod_calamity_cosmic_anvil'];
  const stDef = TILE_DEFS[stKey];
  if (stKey !== undefined && stDef) {
    const sx = px + 3, sy = findSurf(px + 5) - 1;
    let ok = 0;
    for (let dx = 0; dx < (stDef.vanilla?.fw ?? stDef.w ?? 1); dx++) {
      for (let dy = 0; dy < (stDef.vanilla?.fh ?? stDef.h ?? 1); dy++) {
        st.setTile(sx + dx, sy + dy, stKey, dx * 18, dy * 18);
        if (st.get(sx + dx, sy + dy) === stKey) ok++;
      }
    }
    out.station = { internal: stKey, framed: stDef.framed, w: stDef.w, h: stDef.h,
      cells: (stDef.vanilla?.fw ?? 1) * (stDef.vanilla?.fh ?? 1), placedCells: ok };
    globalThis.__probeStation = { sx, sy };
    globalThis.__probeStation = { sx, sy };
  }
  // ③ 站点配方接线:mod 配方 tile=mod 站点 internal id
  // ★B5b 修正后:mod 站点配方 tile=internal id(注册序)——按 TILE_DEFS key 前缀判定
  const modRec = VANILLA_RECIPES.filter((r) => r.create >= 30000 && typeof r.tile === 'number'
    && r.tile > 0 && TILE_DEFS[r.tile]?.key?.startsWith('mod_'));
  out.stationRecipes = modRec.length;
  out.stationTileMatch = modRec.length > 0;
  // ④ 贴图 sheet 在册(伪 sheet≡stable → 渲染取键 vanilla/Tile_<stable>)
  const stable = oreDef?.vanilla?.sheet;
  out.oreSheetStable = stable;
  // ⑤A ★裸 setTile 不触发重烘(Game 放置链才 markDirty)——探针显式标脏
  try { g.chunks.markDirtyArea(px - 2, oy - 2, px + 14, oy + 4); }
  catch { try { g.world.chunks.markDirtyArea(px - 2, oy - 2, px + 14, oy + 4); } catch { out.dirtyFail = true; } }
  // ⑤ ★渲染像素读回定谳:全部放置坐标取第一个在屏者→canvas 16×16 区色彩多样性
  await new Promise((r) => setTimeout(r, 800));
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const cam = g.camera;
  const stProbe = globalThis.__probeStation ?? {};
  // 采样点=站体中心格(顶角常为精灵透明区)+ore 本格
  const candidates = stProbe.sx !== undefined
    ? [[stProbe.sx + 2, stProbe.sy + 1, 'station'], [px, oy, 'ore']]
    : [[px, oy, 'ore']];
  out.render = { fail: 'no in-bounds candidate' };
  // ⑥ 资产链在册检查:atlas vimages/vmeta(mod tile 贴图与伪 sheet 元数据)
  const atlas = window.__swAtlas;
  if (atlas) {
    const fileKey = `mod/calamity/tiles/${oreDef?.key?.replace('mod_calamity_', '')}.png`;
    out.asset = {
      vimageHit: atlas.vimages?.has?.(fileKey) ?? 'noAtlasVimages',
      metaHit: !!atlas.vanilla?.tiles?.[String(stable)],
      metaSheet: atlas.vanilla?.tiles?.[String(stable)]?.sheet ?? null,
      metaKeys: atlas.vanilla?.tiles?.[String(stable)] ? Object.keys(atlas.vanilla.tiles[String(stable)]) : null,
    };
  } else out.asset = { fail: 'no __swAtlas' };
  // ⑧ mod NPC 贴图链(用户实报 NPC 全透明定谳):aero_slime(800 段)三查
  {
    const npcIds = [...(window.__swMods?.result?.() ?? { loaded: [] }).loaded.flatMap(() => [])];
    const alloc = window.__swMods?.result?.()?.allocation;
    const slimeId = alloc?.npcs?.get('mod_calamity_aero_slime');
    if (slimeId !== undefined && atlas) {
      const sheetKey = `vanilla/NPC_${slimeId}.png`;
      const img = atlas.vimages?.get?.(sheetKey) ?? null;
      const fr = atlas.vnpc ? atlas.vnpc(slimeId, 0) : null;
      out.npcTex = {
        slimeId,
        vimageHit: !!img,
        imgSize: img ? [img.width, img.height] : null,
        vframe: fr ? { sx: fr.sx, sy: fr.sy, sw: fr.sw, sh: fr.sh } : null,
        frames: atlas.vanilla?.npcs?.[String(slimeId)]?.count ?? (window.__swNPCFrames?.[String(slimeId)] ?? 'lazy'),
      };
    } else out.npcTex = { fail: 'no atlas or no slime id' };
    // ⑨ 真召唤 aero_slime → 读实体 spawnAlpha/vanillaId(绘制透明定谳)
    try {
      const g2 = window.__swGame;
      const { Enemy: E3 } = await import('/src/entities/Enemy.ts');
      const summoned = E3.fromVanilla(slimeId, g2.player.cx + 60, g2.player.cy);
      g2.entities.add(summoned, 'enemies');
      await new Promise((r) => setTimeout(r, 300));
      out.npcDraw = {
        vanillaId: summoned.vanillaId,
        spawnAlpha: summoned.spawnAlpha,
        alphaFade: summoned.alphaFade,
        defAlpha: summoned.def?.alpha,
        alive: !summoned.dead,
      };
    } catch (e9) { out.npcDraw = { fail: String(e9).slice(0, 150) }; }
  }
  // ⑦ vframe 直取试画:区分 meta 形状问题(null) vs worker 烘焙问题(画得出但场景天)
  if (atlas && stable !== undefined) {
    try {
      const fr = atlas.vframe(stable, 0, 0);
      if (!fr) out.vframeProbe = { fail: 'vframe null' };
      else {
        const c2 = document.createElement('canvas');
        c2.width = 16; c2.height = 16;
        const cx3 = c2.getContext('2d');
        cx3.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, 0, 0, 16, 16);
        const d = cx3.getImageData(0, 0, 16, 16).data;
        let opaque = 0; const cols = new Set();
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) opaque++; cols.add(`${d[i]},${d[i + 1]},${d[i + 2]}`); }
        out.vframeProbe = { sx: fr.sx, sy: fr.sy, sw: fr.sw, sh: fr.sh, opaquePx: opaque, colors: cols.size };
      }
    } catch (e) { out.vframeProbe = { fail: String(e).slice(0, 120) }; }
  }
  // ★自校准色签名扫描:取 mod 贴图自身色板(不透明主色),全屏计数匹配像素
  if (cv) {
    const ctx = cv.getContext('2d');
    const pal = new Set();
    for (const sid of [stDef?.vanilla?.sheet, oreDef?.vanilla?.sheet]) {
      if (sid === undefined) continue;
      const fr = atlas.vframe(sid, 0, 0);
      if (!fr) continue;
      const c2 = document.createElement('canvas');
      c2.width = fr.sw; c2.height = fr.sh;
      const cx4 = c2.getContext('2d');
      cx4.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, 0, 0, fr.sw, fr.sh);
      const d = cx4.getImageData(0, 0, fr.sw, fr.sh).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 200) pal.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);   // 16 级量化
      }
    }
  }
  // ★分块位图直读(世界坐标锚定,与相机/玩家漂移无关):ore 所在 chunk 的 tile 层
  //  在页内 (sx,sy) 偏移取 16×16——直接对拍烘焙产物(全屏扫描的漂移免疫版)。
  try {
    const cc = g.chunks;
    const cx5 = Math.floor(px / 16), cy5 = Math.floor(oy / 16);
    const k = (cx5 & 0xffff) | ((cy5 & 0xffff) << 16);
    const pair = cc.chunks.get(k);
    if (pair?.tile) {
      const lx = (px - cx5 * 16) * 16, lyy = (oy - cy5 * 16) * 16;
      const d = pair.tile.getContext('2d').getImageData(pair.sx + lx, pair.sy + lyy, 16, 16).data;
      let opaque = 0; const cols5 = new Set();
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) opaque++; cols5.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); }
      out.render = { chunkRead: { opaquePx: opaque, quantColors: cols5.size } };
    } else out.render = { chunkRead: { fail: 'no chunk pair' } };
  } catch (e) { out.render = { chunkRead: { fail: String(e).slice(0, 150) } }; }
  return out;
}).catch((e) => ({ evalFail: String(e).slice(0, 300) }));
console.log('INGAME:', JSON.stringify(ingame));
await new Promise((r) => setTimeout(r, 1200));
// 关欢迎浮层(点击「我已知晓」)→ 玩家随行相机对准放置点 → 截图
await page2.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => x.textContent?.includes('我已知晓'));
  if (b) b.click();
}).catch(() => {});
await new Promise((r) => setTimeout(r, 800));
await page2.screenshot({ path: SHOT }).catch(() => {});
await browser.close();
console.log('ERRS:', JSON.stringify([...errs, ...errs2]));
