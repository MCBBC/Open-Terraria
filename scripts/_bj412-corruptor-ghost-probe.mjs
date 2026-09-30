// BJ412 腐化者残影角度实机探针：
//  A. 实机生成腐化者(94)飞行 → 连拍截图（残影拖尾角度留档 game/docs/evidence/bj412/）。
//  B. live 敌怪（真实 AI 历史/真实 atlas）直调真 Renderer.prototype.drawEnemy（记录型
//     ctx 假体,与 bj209 census BJ237-B 同习语）→ ghost 槽 rotate ops 钉值 == e.visAngle。
//  C. 离屏像素 A/B：drawPreBodySpecialGhosts rot=visAngle(修复) vs rot=0(病灶形态)
//     像素差 > 阈值 = 旋转面对像素实质可见。
// 用法：SW_ORIGIN=http://localhost:5450 node tools/run-diag.mjs scripts/_bj412-corruptor-ghost-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_OUT ?? 'docs/evidence/bj412';
fs.mkdirSync(OUT, { recursive: true });

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await b.newPage();
const errors = [];
page.on('pageerror', (e) => {
  const s = String(e && e.stack ? e.stack : e);
  if (!s.includes('prefetchInvProjectiles')) errors.push(s.slice(0, 300));
});
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ } });

await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

// 贴图预热 + 生成腐化者（悬停在玩家右上开阔空域,玩家=瞄准锚）
const spawnInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
  g.renderer.atlas.ensureVImage('vanilla/NPC_94.png');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const im = g.renderer.atlas.ensureVImage('vanilla/NPC_94.png');
    if (im && im.complete) break;
  }
  // 玩家上方 6 格找空地锚点
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  let ay = py - 4;
  for (let y = py - 4; y > py - 24; y--) { if (!g.world.store.isSolid(px, y)) { ay = y; break; } }
  const e = Enemy.fromVanilla(94, p.cx - 140, ay * 16);
  e.id = g.entities.nextId++;
  try { e.def.damage = 0; } catch { /* noop */ }
  g.entities.add(e, 'enemies');
  window.__swBJ412 = { id: e.id, vid: e.vanillaId };
  return { spawned: !!e, vid: e.vanillaId, tex: !!g.renderer.atlas.ensureVImage('vanilla/NPC_94.png') };
});

// 连拍（★确定性编排）：页内 interval 钉玩家位/相机 zoom、驱腐化者沿对角线匀速飞行
// （visAngle=AI 瞄准向=对角,拖尾沿飞行路径展开）;拍前实时取屏幕坐标 clip 特写。
const shotMeta = [];
for (let i = 1; i <= 3; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
    p.hp = p.maxHp;
    if (window.__swBJ412iv) clearInterval(window.__swBJ412iv);
    const en = g.enemies().find((x) => x.vanillaId === 94 && !x.dead);
    if (en) {
      // 锚定玩家与飞行走廊（玩家左上天空,向右下缓飞——避小地图/热栏,亮天空背底）
      en.x = p.cx - 240 - en.w / 2; en.y = p.cy - 170 - en.h / 2;
      en.vx = 2.2; en.vy = 1.4; en.hp = en.maxHp;
      try { en.def.damage = 0; } catch { /* noop */ }
      window.__swBJ412iv = setInterval(() => {
        try {
          if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
          if (g.camera) { g.camera.zoomTarget = 2; g.camera.zoom = 2; }
          p.hp = p.maxHp;
          if (!en.dead) { en.x += 2.2; en.y += 1.4; en.vx = 2.2; en.vy = 1.4; try { en.def.damage = 0; } catch { /* noop */ } }
        } catch { /* noop */ }
      }, 16);
    }
  });
  await new Promise((r) => setTimeout(r, 450));   // 飞行 ~28 tick：拖尾展开穿屏
  const meta = await page.evaluate(() => {
    const g = window.__swGame;
    const cam = g.camera;
    const z = cam ? cam.zoom : 1;
    const out = [];
    for (const en of g.enemies()) {
      if (en.vanillaId === 94 && !en.dead) {
        out.push({
          vid: en.vanillaId,
          visAngle: en.visAngle,
          vx: en.vx, vy: en.vy,
          depth: en.historyDepth(),
          screenX: (en.cx - cam.x) * z + g.renderer.canvas.width / 2,
          screenY: (en.cy - cam.y) * z + g.renderer.canvas.height / 2,
        });
      }
    }
    return { cam: { x: cam.x, y: cam.y, zoom: z }, list: out, dpr: window.devicePixelRatio };
  });
  shotMeta.push(meta);
  const m = meta.list[0];
  if (m) {
    const half = 170;
    await page.screenshot({
      path: OUT + `/closeup-${i}.png`,
      clip: {
        x: Math.max(0, Math.min(1280 - half * 2, m.screenX - half)),
        y: Math.max(0, Math.min(800 - half * 2, m.screenY - half)),
        width: half * 2, height: half * 2,
      },
    });
  }
  await new Promise((r) => setTimeout(r, 250));
}
await page.evaluate(() => { if (window.__swBJ412iv) clearInterval(window.__swBJ412iv); });

// B. live 敌怪直调真 drawEnemy（记录型 ctx）→ ghost 槽 rotate 钉值
const ghostProbe = await page.evaluate(async () => {
  const g = window.__swGame;
  const RendererMod = await import('/src/render/Renderer.ts');
  const Renderer = RendererMod.Renderer;
  const en = g.enemies().find((x) => x.vanillaId === 94 && !x.dead);
  if (!en) return { err: 'no live corruptor' };
  const calls = [];
  const ctx = new Proxy({} , {
    get: (_t, k) => (k === 'canvas' ? undefined
      : k === 'getTransform'
        ? (...a) => { calls.push({ m: 'getTransform', a }); return { __parentT: true }; }
        : (...a) => { calls.push({ m: String(k), a }); }),
  });
  const fake = {
    ctx,
    assets: { enemySprites: new Map() },
    atlas: {
      vnpc: (vid) => g.renderer.atlas.vnpc(vid, 0),
      ensureVImage: (k) => g.renderer.atlas.ensureVImage(k),
      vmisc: () => null,
    },
    drawNpcGlow: () => {},
    drawTwinsChain: () => {},
  };
  Renderer.prototype.drawEnemy.call(fake, en, { store: { idx: () => 0, liquid: [0] } }, []);
  // ghost 槽 = [setTransform, 配对 restore)；槽内 rotate ops（rot=0 不出 op）
  const st = calls.findIndex((c) => c.m === 'setTransform');
  const rots = [];
  if (st >= 0) {
    let depth = 0;
    for (let i = st + 1; i < calls.length; i++) {
      if (calls[i].m === 'save') depth++;
      else if (calls[i].m === 'restore') { if (depth === 0) break; depth--; }
      else if (calls[i].m === 'rotate') rots.push(calls[i].a[0]);
    }
  }
  return { visAngle: en.visAngle, ghostRots: rots, slotFound: st >= 0, depth: en.historyDepth() };
});

// C. 离屏像素 A/B：rot=visAngle(修复) vs rot=0(病灶) 像素差
const pixelAB = await page.evaluate(async () => {
  const g = window.__swGame;
  const mod = await import('/src/render/npcExtraParts.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const atlas = g.renderer.atlas;
  const e = Enemy.fromVanilla(94, 0, 0);
  e.spawnAlpha = 0;
  e.visAngle = 0.7;
  for (let k = 0; k < 8; k++) { e.x += 2.2; e.y += 1.3; e.recordTrailHistory(); }
  const fr = atlas.vnpc(94, 0);
  if (!fr) return { err: 'no frame' };
  const render = (rot) => {
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 220;
    const c2 = cv.getContext('2d');
    mod.drawNpcTrailGhosts(c2, e, atlas,
      { sx: fr.sx, sy: fr.sy, sw: fr.sw, sh: fr.sh },
      { scale: 1, addY: 0, opacity: 1, rot, mirror: false, frameIdx: 0, frames: 4 });
    return c2.getImageData(0, 0, cv.width, cv.height).data;
  };
  const a = render(e.visAngle), bb = render(0);
  let diff = 0, opaqueA = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] > 16) opaqueA++;
    if (Math.abs(a[i] - bb[i]) > 24 || Math.abs(a[i + 1] - bb[i + 1]) > 24
      || Math.abs(a[i + 2] - bb[i + 2]) > 24 || Math.abs(a[i + 3] - bb[i + 3]) > 24) diff++;
  }
  return { diffPx: diff, opaqueA, visAngle: e.visAngle };
});

fs.writeFileSync(OUT + '/result.json', JSON.stringify({ spawnInfo, shotMeta, ghostProbe, pixelAB, errors }, null, 2));
console.log(JSON.stringify({ spawnInfo, shotMeta, ghostProbe, pixelAB, errors }, null, 2));
await b.close();
