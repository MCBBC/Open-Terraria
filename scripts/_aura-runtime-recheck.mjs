// 闪电光环法杖三返运行时复核探针（2026-10-12 用户三报「看不到攻击弹幕/特效,又是隔空伤害」）。
// BJ606-R/BJ606-R2/BJ630 落刀后源码面全在案,但用户实际看不到 → 运行时验证优先于源码对拍。
// 双相：A=新世界+真物品路径（3831 闪电光环法杖→690）+ 真敌夹具;B=用户 .wld 导入同 Census。
// 每相判据：
//   ① spawn 面:dust 池 226 活体数+样本（尘真的在 spawn 吗）
//   ② draw 面:drawImage 8×8 尘计数(2D face)+ pushGlowOps auraOps 计数（BJ630 迁层 op 面真的在出吗）
//   ③ 行为面:aura 区域 clip 截图 ×2 帧字节比对（相同=区域零动画=用户症状复现）
//   ④ 伤害面:敌 hp 递减（隔空伤害确认在跳）
// 运行: SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_aura-runtime-recheck.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(1).wld'));
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (/error|Aura|aura/i.test(t)) errs.push('console:' + t.slice(0, 160)); });

// ============ 公共：装探针计数器（drawImage 8×8 尘 + pushGlowOps aura op） ============
async function installCounters() {
  await page.evaluate(() => {
    window.__probe = { dust8: 0, auraOps: 0, auraTex: [], drawImageTotal: 0 };
    const proto = CanvasRenderingContext2D.prototype;
    if (!window.__origDrawImage) {
      window.__origDrawImage = proto.drawImage;
      proto.drawImage = function (...a) {
        window.__probe.drawImageTotal++;
        if (a.length >= 7 && a[3] === 8 && a[4] === 8 && a[5] === -4 && a[6] === -4) window.__probe.dust8++;
        return window.__origDrawImage.apply(this, a);
      };
    }
    const g = window.__swGame;
    const r = g?.renderer;
    if (r && !window.__origPushGlowOps && r.pushGlowOps) {
      window.__origPushGlowOps = r.pushGlowOps.bind(r);
      r.pushGlowOps = (ops, m) => {
        window.__probe.auraOps += ops.length;
        for (const op of ops) window.__probe.auraTex.push(String(op.tex));
        return window.__origPushGlowOps(ops, m);
      };
    }
    // GL 面普查：各 canvas context 类型
    window.__probe.canvases = [...document.querySelectorAll('canvas')].map((c) => ({
      w: c.width, h: c.height, cls: c.className || c.id || '',
      gl: !!c.getContext('webgl2') || !!c.getContext('webgl'),
    }));
  });
}

// ============ 公共：平地查找 + 真物品路径放塔 + 真敌夹具 ============
async function placeTowerAndEnemy(cxw, cyw) {
  return page.evaluate(async ({ cxw, cyw }) => {
    const g = window.__swGame;
    // ① 真物品路径：3831 闪电光环法杖（T3,shoot 690）→ 3830 → 3829 逐级回退
    const flow = window.__swFlow;
    let vid = 0, iid = -1;
    for (const v of [3831, 3830, 3829]) {
      const id = flow.itemByVid(v);
      if (id != null && id >= 0) { vid = v; iid = id; break; }
    }
    if (iid < 0) return { why: 'no-staff-item' };
    g.player.inv.slots[0] = { id: iid, stack: 1 };
    g.player.inv.selected = 0;
    // ② 瞄准地面点 + 按下（Game 侧 useSwing 真 useItem 链）
    const scr = g.camera.worldToScreen(cxw, cyw - 8);
    g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
    g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    return { vid, iid };
  }, { cxw, cyw });
}

async function releaseMouse() {
  await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
}

async function findTower() {
  return page.evaluate(() => {
    const g = window.__swGame;
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    if (!t) return null;
    return { projId: t.projId, x: t.x, y: t.y, cx: t.cx, cy: t.cy, w: t.w, h: t.h,
      auraSide: t.auraSide, sInit: t.sInit, alphaFade: t.alphaFade,
      carriedByBackpack: !!t.carriedByBackpack, sentry: !!t.sentry };
  });
}

// ============ 公共：Census（spawn/draw/伤害三面） ============
async function census(tag) {
  return page.evaluate((tag) => {
    const g = window.__swGame;
    const p = window.__probe;
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    const d226 = [];
    for (const d of (g.vanillaDust?.pool ?? [])) {
      if (d.active && d.type === 226) d226.push([Math.round(d.x), Math.round(d.y), d.scale]);
    }
    const z = (g.enemies?.() ?? []).find((e) => !e.dead && e.maxHp > 5 && !(e.def?.friendly));
    const ltx = t ? Math.floor(t.cx / 16) : -1, lty = t ? Math.floor(t.cy / 16) : -1;
    return {
      tag,
      tower: t ? { projId: t.projId, x: Math.round(t.x), y: Math.round(t.y), w: t.w, h: t.h,
        auraSide: t.auraSide, sInit: t.sInit, alphaFade: t.alphaFade } : null,
      d226: d226.length, d226Sample: d226.slice(0, 5),
      dust8Draws: p.dust8, auraOps: p.auraOps, auraTexN: p.auraTex.length,
      auraTexSample: [...new Set(p.auraTex)].slice(0, 6),
      drawImageTotal: p.drawImageTotal,
      enemyHp: z ? Math.round(z.hp) : 'gone',
      lightAtField: (t && g.lighting?.lightAt) ? g.lighting.lightAt(ltx, lty - 3) : null,
    };
  }, tag);
}

// ============ 公共：aura 区域 clip 截图 ×2 帧字节比对（行为面：区域是否在动） ============
async function motionCheck(tag) {
  const t = await findTower();
  if (!t) return { tag, why: 'no-tower' };
  const box = await page.evaluate(({ t }) => {
    const g = window.__swGame;
    const side = Math.max(t.w, 120);
    const p1 = g.camera.worldToScreen(t.cx - side / 2 - 20, t.cy - side / 2 - 20);
    const p2 = g.camera.worldToScreen(t.cx + side / 2 + 20, t.cy + side / 2 + 20);
    const x = Array.isArray(p1) ? p1[0] : p1.x, y = Array.isArray(p1) ? p1[1] : p1.y;
    const x2 = Array.isArray(p2) ? p2[0] : p2.x, y2 = Array.isArray(p2) ? p2[1] : p2.y;
    return { x: Math.max(0, x), y: Math.max(0, y),
      width: Math.min(1200, x2 - x), height: Math.min(800, y2 - y) };
  }, { t });
  if (box.width <= 0 || box.height <= 0) return { tag, why: 'bad-clip', box };
  const s1 = await page.screenshot({ clip: box });
  await new Promise((r) => setTimeout(r, 350));
  const s2 = await page.screenshot({ clip: box });
  await new Promise((r) => setTimeout(r, 350));
  const s3 = await page.screenshot({ clip: box });
  const same12 = Buffer.compare(s1, s2) === 0;
  const same23 = Buffer.compare(s2, s3) === 0;
  return { tag, box, moving: !(same12 && same23), same12, same23,
    bytes: [s1.length, s2.length, s3.length] };
}

// ============ A 相：新世界 + 真物品路径 ============
console.log('===== PHASE A: fresh world + real item path =====');
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
console.log('createGame:', !!gen?.ok, gen?.why ?? '');

const spotA = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gx = px, groundY = -1;
  for (let dx = 0; dx < 60 && groundY < 0; dx++) {
    for (const x of [px + dx, px - dx]) {
      for (let y = Math.floor(g.player.cy / 16); y < Math.floor(g.player.cy / 16) + 80; y++) {
        if (st.inBounds(x, y) && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
          gx = x; groundY = y; break;
        }
      }
      if (groundY >= 0) break;
    }
  }
  if (groundY < 0) return { why: 'no-ground' };
  const cxw = gx * 16 + 8, cyw = groundY * 16;
  g.player.x = cxw - 80; g.player.y = cyw - 60;
  g.camera.x = cxw - 400; g.camera.y = cyw - 260;
  return { gx, groundY, cxw, cyw };
});
console.log('spotA:', JSON.stringify(spotA));
if (!spotA?.why) {
  await installCounters();
  const hold = await placeTowerAndEnemy(spotA.cxw, spotA.cyw);
  console.log('hold:', JSON.stringify(hold));
  await pump(page, 6, { step: 2 });
  await releaseMouse();
  await page.evaluate(({ cxw, cyw }) => {
    const g = window.__swGame;
    const z = g.spawnEnemy('zombie', cxw + 30, cyw - 50);
    return !!z;
  }, spotA);
  const towerA0 = await findTower();
  console.log('towerA(after place):', JSON.stringify(towerA0));
  for (let i = 0; i < 8; i++) {
    await pump(page, 30, { step: 30 });
    console.log('censusA:', JSON.stringify(await census(`A${i}`)));
  }
  console.log('motionA:', JSON.stringify(await motionCheck('A')));
  const tA = await findTower();
  if (tA) {
    const side = Math.max(tA.w, 140);
    const p1 = await page.evaluate(({ t, side }) => {
      const g = window.__swGame;
      const p = g.camera.worldToScreen(t.cx - side / 2, t.cy - side / 2);
      return { x: Array.isArray(p) ? p[0] : p.x, y: Array.isArray(p) ? p[1] : p.y };
    }, { t: tA, side });
    await page.screenshot({ path: '/tmp/aura-A-region.png' });
    await page.screenshot({ path: '/tmp/aura-A-full.png' });
  }
}

// ============ B 相：用户 .wld 导入 ============
console.log('===== PHASE B: user .wld import =====');
let wldB64 = '';
try {
  wldB64 = readFileSync(WLD).toString('base64');
  console.log('wld:', (wldB64.length * 3 / 4 / 1024).toFixed(0) + 'KB');
} catch (e) { console.log('wld read fail:', String(e).slice(0, 80)); }

if (wldB64) {
  await page.goto(ORIGIN + '/?play=small&cloudcache=0', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('!!window.__swGame?.player', { timeout: 60000 });
  const loadRes = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const t0 = Date.now();
    const { parseWldToSave } = await import('/src/wld/WldImport.ts?t=' + Date.now());
    const res = parseWldToSave(u8);
    const { loadSaveData } = await import('/src/save/SaveFile.ts?t=' + Date.now());
    const { world, player } = loadSaveData(res.save);
    const g = window.__swGame;
    g.world = world;
    Object.assign(g.player, player);
    world.explored?.fill?.(1); world.exploredVersion++;
    g.player.x = player.x ?? g.player.x; g.player.y = player.y ?? g.player.y;
    g.camera.x = g.player.cx - 400; g.camera.y = g.player.cy - 260;
    return { ok: true, ms: Date.now() - t0, warnings: res.warnings.slice(0, 4),
      w: world.w ?? world.store?.w, h: world.h ?? world.store?.h,
      px: Math.round(g.player.cx), py: Math.round(g.player.cy) };
  }, wldB64);
  console.log('loadB:', JSON.stringify(loadRes));
  await new Promise((r) => setTimeout(r, 2500));

  const spotB = await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
    let gx = px, groundY = -1;
    for (let dx = 0; dx < 120 && groundY < 0; dx++) {
      for (const x of [px + dx, px - dx]) {
        for (let y = py; y < py + 100; y++) {
          if (st.inBounds(x, y) && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)
            && !st.isSolid(x, y - 4) && !st.isSolid(x + 3, y - 1) && !st.isSolid(x - 3, y - 1)) {
            gx = x; groundY = y; break;
          }
        }
        if (groundY >= 0) break;
      }
    }
    if (groundY < 0) return { why: 'no-ground', px, py };
    const cxw = gx * 16 + 8, cyw = groundY * 16;
    g.player.x = cxw - 90; g.player.y = cyw - 60;
    g.camera.x = cxw - 400; g.camera.y = cyw - 260;
    return { gx, groundY, cxw, cyw };
  });
  console.log('spotB:', JSON.stringify(spotB));
  if (!spotB?.why) {
    await installCounters();
    const holdB = await placeTowerAndEnemy(spotB.cxw, spotB.cyw);
    console.log('holdB:', JSON.stringify(holdB));
    await pump(page, 6, { step: 2 });
    await releaseMouse();
    await page.evaluate(({ cxw, cyw }) => {
      const g = window.__swGame;
      return !!g.spawnEnemy('zombie', cxw + 30, cyw - 50);
    }, spotB);
    console.log('towerB(after place):', JSON.stringify(await findTower()));
    for (let i = 0; i < 8; i++) {
      await pump(page, 30, { step: 30 });
      console.log('censusB:', JSON.stringify(await census(`B${i}`)));
    }
    console.log('motionB:', JSON.stringify(await motionCheck('B')));
    await page.screenshot({ path: '/tmp/aura-B-region.png' });
    await page.screenshot({ path: '/tmp/aura-B-full.png' });
  }
}

console.log('pageErrors:', JSON.stringify(errs.slice(0, 10)));
await browser.close();
