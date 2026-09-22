// ★BJ256 树妖祝福定谳探针 v2——症状：用户实报树妖似乎不放 Dryad's Blessing。
// 断言链（原版锚 Terarria1457 NPC.cs:55782-55792/:56061-56088/:55463-55470/:55531-55536,
//          Projectile.cs AI_111 :41871-41977）：
//   A. 树妖在敌怪 1200px LOS 内 → 掷骰入 ai[0]=14 施法态（atkState===14）
//   B. atkTick 24 出光环 → wardT>=30 起玩家入 300→600px 半径得 buff 165
//      （player.buffs.active 含 DryadsWard=106）
//   C. 敌怪得 186（dryadBaneT>0）
//   D. 视觉面：TownShot 586 出膛位置/寿命/存活（vanilla=树妖旁原地 570t 十叶转环）
//   E. 对照：无敌怪接近 → 不入施法态（flag31 门）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1200);

// 模块导入 + 落位：树妖/僵尸都贴地,僵尸 200px,玩家 40px
const setup = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const st = g.world.store;
  const TILE = 16;
  const groundY = (px) => {   // 从 px 往下找第一个实心格,返回该格顶的世界 py
    const tx = Math.floor(px / TILE);
    for (let ty = 0; ty < st.h; ty++) {
      if (st.isSolid(tx, ty)) return ty * TILE;
    }
    return null;
  };
  const px0 = g.player.x + 40;
  const gy = groundY(px0);
  if (gy == null) return { fail: 'no ground' };
  const dryad = new TownNPC('dryad', px0, gy - 56);
  g.entities.add(dryad, 'npcs');
  dryad.x = px0; dryad.y = gy - 56; dryad.vx = 0; dryad.vy = 0;
  const z = Enemy.fromVanilla(3, px0 + 100, gy - 48);   // 僵尸(PrettySafe=200 内)
  g.entities.add(z, 'enemies');
  z.x = px0 + 100; z.y = gy - 48;
  return { ok: true, px0, gy, dryadX: dryad.x, dryadY: dryad.y, zX: z.x, zY: z.y, zVid: z.vanillaId };
});
console.log('[setup]', JSON.stringify(setup));
if (!setup.ok) { console.log('[probe] FAIL setup'); await b.close(); process.exit(1); }

// 采样 14s:每 0.5s 玩家跟随树妖 +40px,记录全链状态
const samples = [];
for (let i = 0; i < 28; i++) {
  await sleep(500);
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    const all = g.entities?.all?.() ?? [];
    const arr = (Array.isArray(all) ? all : [...all]);
    const dryad = arr.find((e) => e && e.vanillaId === 20);
    if (!dryad) return { noDryad: true };
    // 僵尸钉回 100px(离开 PrettySafe 200 窗则无施法掷)
    const z = arr.find((e) => e && e.vanillaId === 3 && !e.dead);
    if (z) { z.x = dryad.x + 100; z.y = dryad.y; }
    // 玩家跟随:树妖左侧 40px 贴地
    g.player.x = dryad.x - 40; g.player.y = dryad.y; g.player.vx = 0;
    const shots = arr.filter((e) => e && e.projId === 586)
      .map((e) => ({ x: Math.round(e.x - dryad.x), y: Math.round(e.y - dryad.y), life: e.life, dead: e.dead }));
    const buffs = g.player?.buffs;
    const hasWard = buffs ? (buffs.active?.has?.(106) ?? false) : false;
    let bane = null;
    for (const e of arr) { if (e && e.dryadBaneT > 0) { bane = { vid: e.vanillaId, t: e.dryadBaneT, dps: e.dryadBaneDps }; break; } }
    const zoms = arr.filter((e) => e && e.hurt && !e.townNPC && e.vanillaId === 3)
      .map((e) => ({ d: Math.round(Math.hypot(e.cx - dryad.cx, e.cy - dryad.cy)), hp: e.hp }));
    return {
      atkState: dryad.atkState, atkTick: dryad.atkTick, wardT: dryad.wardT,
      dryadWardT: dryad.dryadWardT, dist: Math.round(Math.hypot(g.player.cx - dryad.cx, g.player.cy - dryad.cy)),
      onGround: dryad.onGround, dangerNear: dryad.dangerNear, atkCd: dryad.atkCd, fleeing: dryad.fleeing,
      zoms, hasWard, bane, shots,
    };
  });
  samples.push(s);
  if (i % 4 === 0) console.log(`[t+${(i * 0.5).toFixed(1)}s]`, JSON.stringify(s));
}
console.log('[summary] atkState14 帧:', samples.filter((s) => s.atkState === 14).length, '/28');
console.log('[summary] 玩家得祝福帧:', samples.filter((s) => s.hasWard).length, '/28');
console.log('[summary] 敌怪得 bane 帧:', samples.filter((s) => s.bane).length, '/28');
console.log('[summary] 586 弹样本:', JSON.stringify(samples.flatMap((s) => s.shots || []).slice(0, 10)));
// 施法中截图(视觉环取证)
const castSample = samples.find((s) => s.atkState === 14 && s.wardT > 60);
if (castSample) {
  // WelcomeAnnounce 横幅遮挡(已知探针坑,BJ144)——先点掉
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button, [data-act], .sw-btn')]
      .find((b) => /我已知晓|已知晓|ACK|ack/i.test(b.textContent || b.getAttribute('data-act') || ''));
    if (btn) btn.click();
  });
  await sleep(300);
  const crop = await p.evaluate(() => {
    const g = window.__swGame;
    const all = g.entities?.all?.() ?? [];
    const arr = (Array.isArray(all) ? all : [...all]);
    const dryad = arr.find((e) => e && e.vanillaId === 20);
    if (!dryad) return null;
    const [sx, sy] = g.camera.worldToScreen(dryad.cx, dryad.cy);
    return { x: Math.max(0, Math.round(sx - 320)), y: Math.max(0, Math.round(sy - 320)), width: 640, height: 640 };
  });
  if (crop) {
    await p.screenshot({ path: '/tmp/bj256-dryad-ward-ring.png', clip: crop });
    console.log('[probe] 截图 → /tmp/bj256-dryad-ward-ring.png');
  }
} else {
  console.log('[probe] 无施法帧可截');
}
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await b.close();
process.exit(0);
