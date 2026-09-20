// BJ211 num57 圆周光晕环实机探针：
//  A. 离屏像素冒烟——真实 atlas + drawNpcAuraRings 直调，断言环拷贝真的落笔且带
//     色 tint（gold/turquoise/pink）或加算白（661）；618 双相 + 门短路。
//  B. 实机生成 426/541/661 于玩家两侧开阔地 → 截图 3 张（环相位随时钟变化）。
// 用法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj211-aura-ring-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/bj211-probe';
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
// 欢迎横幅预种 ack（z-60 会拦截图）
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ } });

await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

// ---------- A. 离屏像素冒烟 ----------
const smoke = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const mod = await import('/src/render/npcExtraParts.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const atlas = g.renderer.atlas;
  // 贴图预热（懒加载：ensureVImage 触发 → 等 complete）
  for (const vid of [426, 523, 541, 568, 618, 620, 661, 427]) {
    atlas.ensureVImage('vanilla/NPC_' + vid + '.png');
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const all = [426, 523, 541, 568, 618, 620, 661, 427]
      .every((vid) => { const im = atlas.ensureVImage('vanilla/NPC_' + vid + '.png'); return im && im.complete; });
    if (all) break;
  }

  const drawRing = (vid, opts, pre = () => {}) => {
    const e = Enemy.fromVanilla(vid, 0, 0);
    pre(e);
    const fr = atlas.vnpc(vid, 0);
    if (!fr) return { err: 'no frame' };
    const cv = document.createElement('canvas');
    cv.width = fr.sw * 4 + 40; cv.height = fr.sh * 4 + 40;
    const c2 = cv.getContext('2d');
    c2.save();
    c2.translate(cv.width / 2, cv.height / 2);
    c2.scale(4, 4);                       // ×4 放大便于读像素
    mod.drawNpcAuraRings(c2, e, atlas,
      { sx: fr.sx, sy: fr.sy, sw: fr.sw, sh: fr.sh },
      { scale: 1, addY: 0, opacity: 1, ...opts });
    c2.restore();
    const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    let opaque = 0, gold = 0, teal = 0, pink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 16) {
        opaque++;
        const [r, gg, bl] = [d[i], d[i + 1], d[i + 2]];
        if (r > 190 && gg > 170 && bl < 190) gold++;
        if (gg > 170 && bl > 150 && r < 200) teal++;
        if (r > 190 && bl > 130 && gg < 190) pink++;
      }
    }
    return { opaque, gold, teal, pink, frame: `${fr.sw}x${fr.sh}` };
  };

  // 541 沙元素金环：tSec=0.716 → num58≈0.351 → fade≈0.649（显著）
  out.s541 = drawRing(541, { tSec: 0.716 });
  // 620 鲨鱼兵金环（同 541 档）
  out.s620 = drawRing(620, { tSec: 0.716 });
  // 426 蜂后青绿环
  out.s426 = drawRing(426, { tSec: 0.3 });
  // 568 常态粉环（lai3=60 过出生门；A=191 双步 blend）
  out.s568 = drawRing(568, { tSec: 0, lai3: 60 });
  // 568 出生门短路（lai3=59 → 常态环不画,出生雾归 drawWitherBirth）
  out.s568gate = drawRing(568, { tSec: 0, lai3: 59 });
  // 523 远古末日粉环（ai1=0 → num58=0.5）
  out.s523 = drawRing(523, { tSec: 0 }, (e) => { e.ai1 = 0; });
  // 661 帝皇蝶不染色环（tSec=0 → num58=1 → fade=0 → 无笔画）
  out.s661fade0 = drawRing(661, { tSec: 0 });
  // 661 num58 谷底（t=1.2）→ fade≈1 全强
  out.s661 = drawRing(661, { tSec: 1.2 });
  // 618 ai0==3 相（r25·0.5）
  out.s618 = drawRing(618, { tSec: 0 }, (e) => { e.ai0 = 3; e.ai1 = 90; });
  // 427 无环结构哨兵
  out.s427none = drawRing(427, { tSec: 0.716 });
  out.ids = [...mod.NPC_AURA_RING_IDS].sort((a, b) => a - b);
  return out;
});

// ---------- B. 实机生成 + 截图 ----------
const spawnedInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  // 正午亮场（环拷贝是光照链色,夜里看不清）
  if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
  // 贴图预热（未生成敌怪前完成,缩短暴露窗）
  for (const vid of [426, 541, 661]) g.renderer.atlas.ensureVImage('vanilla/NPC_' + vid + '.png');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if ([426, 541, 661].every((vid) => !!g.renderer.atlas.ensureVImage('vanilla/NPC_' + vid + '.png'))) break;
  }
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  const out = { spawned: {}, positions: [] };
  let floorY = py;
  for (let y = py; y < py + 40; y++) if (g.world.store.isSolid(px, y)) { floorY = y; break; }
  for (const [vid, dx] of [[426, -110], [541, 0], [661, 110]]) {
    const gx = p.cx + dx, gy = (floorY - 2) * 16 - 30;
    const e = Enemy.fromVanilla(vid, gx, gy);
    if (e) {
      e.id = g.entities.nextId++;
      e.vx = 0; e.vy = 0;
      // 探针去武装：接触/弹幕伤害归零（防玩家被秒进复活屏）
      try { e.def.damage = 0; } catch { /* noop */ }
      g.entities.add(e, 'enemies');
      out.spawned[vid] = true;
      out.positions.push({ vid, gx, gy });
    }
  }
  for (const vid of [426, 541, 661]) {
    out['tex' + vid] = !!g.renderer.atlas.ensureVImage('vanilla/NPC_' + vid + '.png');
  }
  return out;
});

// 三连拍：拍前把三只怪重新钉回玩家两侧开阔位 + 玩家回满血（防意外死亡）
const shotMeta = [];
for (let i = 1; i <= 3; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    if (g.world && g.world.clock) g.world.clock.timeOfDay = 0.25;
    p.hp = p.maxHp;
    const offs = { 426: -110, 541: 0, 661: 110 };
    for (const en of g.enemies()) {
      const dx = offs[en.vanillaId];
      if (dx !== undefined && !en.dead) {
        en.x = p.cx + dx - en.w / 2; en.y = p.cy - en.h / 2;
        en.vx = 0; en.vy = 0;
        en.hp = en.maxHp;
        try { en.def.damage = 0; } catch { /* noop */ }
      }
    }
  });
  await new Promise((r) => setTimeout(r, 250));
  // 拍帧时敌怪屏幕坐标（cam.x/cam.y=相机左上世界 px，zoom=渲染缩放）
  const meta = await page.evaluate(() => {
    const g = window.__swGame;
    const cam = g.camera;
    const z = cam ? cam.zoom : 1;
    const list = [];
    for (const en of g.enemies()) {
      if ([426, 541, 661].includes(en.vanillaId) && !en.dead) {
        list.push({
          vid: en.vanillaId,
          sx: (en.cx - cam.x) * z,
          sy: (en.cy - cam.y) * z,
        });
      }
    }
    return { cam: { x: cam.x, y: cam.y, zoom: z }, list, dpr: window.devicePixelRatio };
  });
  shotMeta.push(meta);
  await page.screenshot({ path: OUT + `/live-${i}.png` });
  await new Promise((r) => setTimeout(r, 650));
}
fs.writeFileSync(OUT + '/shot-meta.json', JSON.stringify(shotMeta, null, 2));

fs.writeFileSync(OUT + '/result.json', JSON.stringify({ smoke, shots, errors }, null, 2));
console.log(JSON.stringify({ smoke, shots, errors }, null, 2));
await b.close();
