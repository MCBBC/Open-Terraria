// BJ346 探针：星云柱滤镜（FilterTower）+ 护盾免疫门 双域实测。
// 场景：地表放 507 星云塔（+517 日耀塔远侧）+ lunarEvent 盾值注入 →
//  A 域：盾门（dontTakeDamage/hurt 拒绝/扣盾计数/分塔隔离/盾 0 解封）
//  B 域：滤镜 pass 参数捕获（GLScreenFilters hook）+ 截图像素统计
// 用法：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj346-pillar-filter-shield.mjs [--shot-only]
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const SHOT_ONLY = process.argv.includes('--shot-only');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
await page.goto(ORIGIN + '/?play=small&bj346' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
console.log('booted, errors so far:', errors.length);

// ---- hook 滤镜链捕获 passes（GL 双路径都包）----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__fxPasses = [];
  const snap = (passes) => {
    try {
      window.__fxPasses.push(JSON.parse(JSON.stringify(passes.filter((p) => p.kind === 'FilterTower'))));
    } catch { /* noop */ }
  };
  const fx = r.screenFx;
  if (fx) {
    if (fx.drawChainPipe) {
      const o = fx.drawChainPipe.bind(fx);
      fx.drawChainPipe = function (pipe, src, passes, tint) { snap(passes); return o(pipe, src, passes, tint); };
    }
    if (fx.drawChain) {
      const o2 = fx.drawChain.bind(fx);
      fx.drawChain = function (src, passes, tint) { snap(passes); return o2(src, passes, tint); };
    }
  }
  window.__sfxPath = () => r.sfxPathUsed;
});

// ---- 场景搭建 ----
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 玩家落地面（世界中部）
  const wx = Math.floor(st.w / 2);
  let placed = false;
  for (let x = wx - 30; x < wx + 30 && !placed; x++) {
    for (let y = 60; y < st.h - 60; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        g.player.x = x * 16 + 8 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        g.player.vx = 0; g.player.vy = 0;
        placed = true;
        break;
      }
    }
  }
  if (!placed) return { placed: false };
  // 事件态注入（塔未生成前先摆事件旗——spawnTowerNpc 链外手动造塔）
  const le = g.world.lunarEvent;
  le.active = true;
  le.towerActive.nebula = true;
  le.towerActive.solar = true;
  le.shield.nebula = 100;
  le.shield.solar = 100;
  // 星云塔：玩家右侧 500px 空中（塔会自己贴地）
  g.debugSpawnNpc(507, 1, false);
  let tower = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 507);
  if (tower) {
    tower.x = g.player.cx + 500 - tower.w / 2;
    tower.y = g.player.cy - 500 - tower.h / 2;
  }
  // 日耀塔：右侧 2200px（<4000 同 Zone，用于分塔隔离测试的参照）
  g.debugSpawnNpc(517, 1, false);
  let solar = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 517);
  if (solar) {
    solar.x = g.player.cx + 2200 - solar.w / 2;
    solar.y = g.player.cy - 500 - solar.h / 2;
  }
  return {
    placed: true,
    tower: tower ? { x: tower.x, y: tower.y, w: tower.w, h: tower.h } : null,
    solar: solar ? { x: solar.x, y: solar.y } : null,
    shield: { ...g.world.lunarEvent.shield },
  };
});
console.log('setup:', JSON.stringify(setup));
if (!setup.placed) { console.error('落位失败'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const out = { errors };

if (!SHOT_ONLY) {
  // ---- A 域：护盾门 ----
  const shieldTests = [];
  const evalTest = (label, fn) => page.evaluate(fn).then((v) => shieldTests.push({ label, ...v }));

  await evalTest('T1 盾上=免伤旗', () => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    return { dontTakeDamage: !!t && t.dontTakeDamage, hp: t ? t.hp : -1, shield: g.world.lunarEvent.shield.nebula };
  });
  await evalTest('T2 盾上 hurt 拒绝', () => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    if (!t) return { err: 'no tower' };
    const hp0 = t.hp;
    const r = t.hurt(100, 0, 0, g);
    return { hurtReturned: !!r, hp0, hp1: t.hp };
  });
  // T3: 杀星云小怪 420（塔旁 60px）→ 629 弹 → 盾 -1
  await evalTest('T3a 杀星云小怪前快照', () => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    g.debugSpawnNpc(420, 1, false);
    const m = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 420);
    if (m && t) { m.x = t.cx + 60 - m.w / 2; m.y = t.cy - m.h / 2; }
    window.__bj346minion = !!m;
    return { minionSpawned: !!m, shieldBefore: g.world.lunarEvent.shield.nebula };
  });
  await evalTest('T3b 击杀小怪', () => {
    const g = window.__swGame;
    const m = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 420);
    const r = m ? m.hurt(99999, 0, 0, g) : null;
    return { killed: !!r, minionDead: !m || m.dead };
  });
  await new Promise((r) => setTimeout(r, 2500));   // 等弹飞到塔（60px≈12t）
  await evalTest('T3c 盾扣减=99', () => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    const bolts = [...g.entities.projectiles].filter((p) => p.constructor?.name === 'TowerBolt');
    return {
      shield: g.world.lunarEvent.shield.nebula,
      ai3: t ? t.ai3 : -1,
      boltsAlive: bolts.length,
      sfxPath: window.__sfxPath(),
    };
  });
  // T4: 杀日耀小怪 412（日耀塔旁）→ 只扣 solar
  await evalTest('T4a 日耀小怪', () => {
    const g = window.__swGame;
    const s = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 517);
    g.debugSpawnNpc(412, 1, false);
    const m = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 412);
    if (m && s) { m.x = s.cx + 60 - m.w / 2; m.y = s.cy - m.h / 2; }
    const r = m ? m.hurt(99999, 0, 0, g) : null;
    return { killed: !!r, shieldNebula: g.world.lunarEvent.shield.nebula, shieldSolar: g.world.lunarEvent.shield.solar };
  });
  await new Promise((r) => setTimeout(r, 2500));
  await evalTest('T4b 分塔隔离', () => {
    const g = window.__swGame;
    return { shieldNebula: g.world.lunarEvent.shield.nebula, shieldSolar: g.world.lunarEvent.shield.solar };
  });
  // T5: 盾 0 → 解封
  await evalTest('T5a 盾清零', () => {
    const g = window.__swGame;
    g.world.lunarEvent.shield.nebula = 0;
    return { shield: g.world.lunarEvent.shield.nebula };
  });
  await new Promise((r) => setTimeout(r, 600));   // 等 AI tick 刷 dontTakeDamage
  await evalTest('T5b 盾破 hurt 生效', () => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    if (!t) return { err: 'no tower' };
    const hp0 = t.hp;
    const dtd = t.dontTakeDamage;
    const r = t.hurt(100, 0, 0, g);
    return { dontTakeDamage: dtd, hurtReturned: !!r, hp0, hp1: t.hp };
  });
  out.shieldTests = shieldTests;
  console.log('shieldTests:', JSON.stringify(shieldTests, null, 1));

  // 盾回满（滤镜 B 域要盾上态 + 重进 Zone 刷 FilterTower 强度）
  await page.evaluate(() => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    g.world.lunarEvent.shield.nebula = 100;
    if (t) { t.dontTakeDamage = true; }
  });
}

// ---- B 域：滤镜 ----
// 等 Filter.Opacity 斜坡（1/s，进场已过 1.5s+测试期）→ 稳态 1
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { window.__fxPasses.length = 0; });
const shot1 = await page.screenshot({ type: 'png' });
writeFileSync('/tmp/bj346-filter-before.png', shot1);
await new Promise((r) => setTimeout(r, 400));
const fxData = await page.evaluate(() => ({
  passes: window.__fxPasses.slice(-4),
  sfxPath: window.__sfxPath(),
  shield: window.__swGame.world.lunarEvent.shield.nebula,
  towerD2Player: (() => {
    const g = window.__swGame;
    const t = [...g.entities.enemies].find((e) => !e.dead && e.vanillaId === 507);
    return t ? Math.round(Math.hypot(t.cx - g.player.cx, t.cy - g.player.cy)) : -1;
  })(),
}));
out.fx = fxData;
console.log('fx:', JSON.stringify(fxData, null, 1));

// 像素统计：整帧均值 + 强洋红像素占比（r>170 ∧ b>150 ∧ g<120 ∧ r>g+60）
const png = PNG.sync.read(shot1);
let n = 0, mr = 0, mg = 0, mb = 0, magenta = 0;
for (let y = 0; y < png.height; y += 2) {
  for (let x = 0; x < png.width; x += 2) {
    const i = (y * png.width + x) * 4;
    const r = png.data[i], gg = png.data[i + 1], b = png.data[i + 2];
    mr += r; mg += gg; mb += b; n++;
    if (r > 170 && b > 150 && gg < 120 && r - gg > 60) magenta++;
  }
}
out.pixels = {
  mean: [Math.round(mr / n), Math.round(mg / n), Math.round(mb / n)],
  magentaFrac: +(magenta / n).toFixed(4),
};
console.log('pixels:', JSON.stringify(out.pixels));

// 收尾
writeFileSync('/tmp/bj346-report.json', JSON.stringify(out, null, 1));
await browser.close();
console.log('errors:', errors.length ? errors : 'none');
console.log('DONE. shot=/tmp/bj346-filter-before.png');
