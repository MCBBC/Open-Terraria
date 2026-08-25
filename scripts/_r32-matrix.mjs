// R32 视觉终验矩阵(收官验证,2026-08-25):
//   五族 28 把代表武器统一探针——出膛弹数与类型 / 关键 dust 类型 / playSfxFiles 序列 /
//   必要时 canvas 像素差分,每把截图存 $R32_SHOTS(默认 /tmp/recon/r32-shots/<id>.png)。
//   家族分批跑(watchdog 纪律):R32_FAMILY=magicEarly|magicMid|ranged|meleeThrow|summonWhip
//   (逗号分隔多族);R32_ONLY=<weaponId> 只复跑单把(任务 B 修复回验)。
// 运行:SW_ORIGIN=http://localhost:5222 node tools/run-diag.mjs --timeout=600000 \
//        scripts/_r32-matrix.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.R32_SHOTS ?? '/tmp/recon/r32-shots';
const FAMILIES = (process.env.R32_FAMILY ?? 'magicEarly,magicMid,ranged,meleeThrow,summonWhip').split(',');
const ONLY = process.env.R32_ONLY ?? '';
fs.mkdirSync(SHOTS, { recursive: true });
const JSONL = '/tmp/recon/r32-matrix-results.jsonl';

const WEAPONS = {
  magicEarly: [
    { id: 'amethystStaff', vid: 739, name: 'Amethyst Staff 宝石杖' },
    { id: 'crystalStorm', vid: 518, name: 'Crystal Storm 水晶风暴' },
    { id: 'waterBolt', vid: 165, name: 'Water Bolt 水矢' },
    { id: 'demonScythe', vid: 272, name: 'Demon Scythe 恶魔镰刀' },
    { id: 'vilethorn', vid: 64, name: 'Vilethorn 邪恶荆棘' },
    { id: 'rainbowRod', vid: 495, name: 'Rainbow Rod 彩虹魔杖' },
    { id: 'aquaScepter', vid: 157, name: 'Aqua Scepter 水权杖' },
  ],
  magicMid: [
    { id: 'shadowbeam', vid: 1444, name: 'Shadowbeam Staff 暗影束' },
    { id: 'infernoFork', vid: 1445, name: 'Inferno Fork 地狱火叉' },
    { id: 'toxicFlask', vid: 3105, name: 'Toxic Flask 毒液瓶' },
    { id: 'blizzardStaff', vid: 1931, name: 'Blizzard Staff 暴雪法杖' },
    { id: 'medusaHead', vid: 3269, name: 'Medusa Head 美杜莎之首' },
    { id: 'nebulaBlaze', vid: 3542, name: 'Nebula Blaze 星旋烈焰' },
  ],
  ranged: [
    { id: 'tsunami', vid: 2624, ammoId: 40, name: 'Tsunami 海啸' },
    { id: 'phantasm', vid: 3540, ammoId: 40, name: 'Phantasm 幻象弓' },
    { id: 'tacticalShotgun', vid: 679, ammoId: 97, name: 'Tactical Shotgun 战术霰弹枪' },
    { id: 'onyxBlaster', vid: 3788, ammoId: 97, name: 'Onyx Blaster 黑曜石爆破枪' },
    { id: 'clockworkAR', vid: 434, ammoId: 97, name: 'Clockwork AR 时钟步枪' },
    { id: 'starCannon', vid: 197, ammoId: 75, name: 'Star Cannon 星星炮' },
  ],
  meleeThrow: [
    { id: 'woodenBoomerang', vid: 284, name: 'Wooden Boomerang 木回旋镖' },
    { id: 'blueMoon', vid: 163, name: 'Blue Moon 蓝月链枷' },
    { id: 'darkLance', vid: 274, name: 'Dark Lance 暗黑长枪' },
    { id: 'valor', vid: 3317, name: 'Valor 悠悠球' },
    { id: 'chainGuillotines', vid: 3012, name: 'Chain Guillotines 链刃' },
  ],
  summonWhip: [
    { id: 'impStaff', vid: 2365, name: 'Imp Staff 小鬼杖' },
    { id: 'rainbowCrystal', vid: 3571, name: 'Rainbow Crystal Rod 彩虹水晶杖' },
    { id: 'snapthorn', vid: 4913, name: 'Snapthorn 鞭' },
    { id: 'morningStar', vid: 4679, name: 'Morning Star 晨星鞭' },
  ],
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
// ★UI 重构后菜单流程(同 _batch5-probe):title-menu → splash 完 → sp → 角色 → 世界
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R32');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// ---- 安装 spy + 竞技场(一次) ----
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  // 平坦天空竞技场 + 右墙(撞点/反弹/火柱用)
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 40;
  window.__r32gy = gy;
  for (let dx = -140; dx <= 160; dx++) for (let dy = -60; dy <= 2; dy++) {
    st.setTile(px0 + dx, gy + dy, 0);
    st.liquid[st.idx(px0 + dx, gy + dy)] = 0;
  }
  for (let dx = -140; dx <= 160; dx++) st.setTile(px0 + dx, gy + 3, 2);
  for (let dy = -30; dy <= 2; dy++) { st.setTile(px0 + 34, gy + dy, 2); st.setTile(px0 + 35, gy + dy, 2); }
  g.player.x = px0 * 16; g.player.y = (gy - 3) * 16;
  window.__r32px0 = px0;

  if (!g.__r32spyOn) {
    g.__r32spyOn = true;
    window.__r32tick = 0;
    window.__r32adds = []; window.__r32dust = []; window.__r32sfx = [];
    g.__od32playSfxFiles = g.playSfxFiles;
    g.playSfxFiles = function (files, vol, x, y) {
      window.__r32sfx.push({ files: files.join(','), t: window.__r32tick });
      return g.__od32playSfxFiles.call(this, files, vol, x, y);
    };
    g.__od32spawnDust = g.spawnDust;
    g.spawnDust = function (x, y, w, h, type, ...rest) {
      window.__r32dust.push(type);
      return g.__od32spawnDust.call(this, x, y, w, h, type, ...rest);
    };
    g.__od32add = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && typeof e.projId === 'number') {
        window.__r32adds.push({ pid: e.projId, t: window.__r32tick, ctor: e.constructor?.name ?? '?',
          x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy, dead: !!e.dead, ref: e });
      }
      return g.__od32add(e, b);
    };
  }
});

// ---- 页面侧单武器执行器 ----
await page.evaluate(() => {
  window.__r32run = async (spec) => {
    const g = window.__swGame;
    const st = g.world.store;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = {};
    const px0 = window.__r32px0, gy = window.__r32gy;

    // 清场:弹体/敌怪/尘记录
    g.entities.projectiles.length = 0;
    try { g.entities.enemies.length = 0; } catch { /* readonly */ }
    window.__r32adds.length = 0; window.__r32dust.length = 0; window.__r32sfx.length = 0;

    const findKey = (vid) => Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${vid}_`).test(k)) ?? null;
    res.key = findKey(spec.vid);
    if (!res.key) { res.unregistered = true; return res; }

    // 装备(远程补弹药)
    let aid = -1;
    if (spec.ammoId != null) {
      const { ITEM_DEFS } = await import('/src/data/items.ts');
      for (let i = 0; i < ITEM_DEFS.length && aid < 0; i++) {
        const d = ITEM_DEFS[i];
        const vid = d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
        if ((d?.ammoId ?? -1) === spec.ammoId || (d?.ammoId == null && vid === spec.ammoId)) aid = i;
      }
    }
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: window.__swItems[res.key], stack: 1 };
    if (aid >= 0) g.player.inv.slots[54] = { id: aid, stack: 999 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.player.mana = g.player.maxMana ?? 200;
    g.player.manaRegenDelay = 0;
    try { g.cb.onInventoryChanged(); } catch { /* optional */ }
    for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);

    const aim = (dxPx, dyPx) => { g.input.mouseX = 640 + dxPx; g.input.mouseY = 400 + dyPx; };
    const clickOnce = () => {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      window.__r32tick++; g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    };
    const pump = (n) => { for (let i = 0; i < n; i++) { window.__r32tick++; g.fixedUpdate(1 / 60); } };
    const adds = () => window.__r32adds;
    const dusts = () => window.__r32dust;
    const sfxFiles = () => window.__r32sfx.map((s) => s.files);
    res.ammoBefore = aid >= 0 ? g.player.inv.slots[54]?.stack : null;

    switch (spec.id) {
      case 'amethystStaff': {
        aim(+420, 0);
        clickOnce();
        let p121 = null;
        for (let i = 0; i < 12 && !p121; i++) { pump(1); p121 = g.entities.projectiles.find((q) => q.projId === 121 && !q.dead); }
        if (p121) {
          const expected = Math.atan2(p121.vy, p121.vx);
          const proto = CanvasRenderingContext2D.prototype;
          const orig = proto.rotate;
          let framesWithAngle = 0;
          for (let round = 0; round < 5; round++) {
            const log = [];
            proto.rotate = function (a) { log.push(a); return orig.call(this, a); };
            await sleep(32);
            proto.rotate = orig;
            const norm = (a) => Math.abs(Math.atan2(Math.sin(a - expected), Math.cos(a - expected)));
            if (log.some((a) => norm(a) < 0.05)) framesWithAngle++;
          }
          res.framesWithAngle = framesWithAngle;
          res.dustGem = dusts().filter((t) => t >= 86 && t <= 91).length;
          res.fired = adds().filter((e) => e.pid === 121).length;
        }
        break;
      }
      case 'crystalStorm': {
        aim(+420, 0);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        pump(30);
        g.input.mouseDown = false; g.input.mouseHeld = false;
        const bolts = adds().filter((e) => e.pid === 94);
        res.fired = bolts.length;
        res.speeds = bolts.map((e) => +Math.hypot(e.vx, e.vy).toFixed(2));
        break;
      }
      case 'waterBolt': {
        aim(+380, -40);
        clickOnce();
        let p27 = null;
        for (let i = 0; i < 14 && !p27; i++) { pump(1); p27 = g.entities.projectiles.find((q) => q.projId === 27 && !q.dead); }
        if (p27) {
          const frames = 24;
          const path = [{ x: p27.cx, y: p27.cy }];
          for (let t = 0; t < frames; t++) { pump(1); path.push({ x: p27.cx, y: p27.cy }); }
          const d172 = dusts().filter((t) => t === 172).length;
          res.perFrame = +(d172 / frames).toFixed(2);
          res.life = p27.life ?? p27.timeLeft;
          res.alpha255 = p27.alpha === 255;
          // 像素差分(A=拖尾在飞,B=清场后)
          const canvas = g.renderer.canvas;
          const ctx = canvas.getContext('2d');
          let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
          for (const q of path.slice(-24)) {
            const [sx, sy] = g.camera.worldToScreen(q.x, q.y);
            sx0 = Math.min(sx0, sx); sy0 = Math.min(sy0, sy); sx1 = Math.max(sx1, sx); sy1 = Math.max(sy1, sy);
          }
          const rx = Math.max(0, Math.round(sx0 - 30)), ry = Math.max(0, Math.round(sy0 - 30));
          const rw = Math.max(4, Math.min(canvas.width - rx, Math.round(sx1 - sx0) + 60));
          const rh = Math.max(4, Math.min(canvas.height - ry, Math.round(sy1 - sy0) + 60));
          const A = ctx.getImageData(rx, ry, rw, rh).data;
          g.entities.projectiles.length = 0;
          await sleep(900);
          const B = ctx.getImageData(rx, ry, rw, rh).data;
          let diff = 0;
          for (let j = 3; j < A.length; j += 4) {
            if (Math.abs(A[j] - B[j]) > 10 || Math.abs(A[j - 1] - B[j - 1]) > 10 || Math.abs(A[j - 2] - B[j - 2]) > 10) diff++;
          }
          res.diffPix = diff;
        } else res.noProj = true;
        break;
      }
      case 'demonScythe': {
        aim(+420, 0);
        clickOnce();
        let p45 = null;
        for (let i = 0; i < 16 && !p45; i++) { pump(1); p45 = g.entities.projectiles.find((q) => q.projId === 45 && !q.dead); }
        if (p45) {
          for (let t = 1; t <= 28; t++) pump(1);
          res.vAt29 = +Math.hypot(p45.vx, p45.vy).toFixed(3);
          for (let t = 1; t <= 70; t++) pump(1);
          res.peak = +Math.hypot(p45.vx, p45.vy).toFixed(2);
          const frozen = res.peak;
          for (let t = 1; t <= 20; t++) pump(1);
          res.frozen = Math.abs(Math.hypot(p45.vx, p45.vy) - frozen) < 1e-6 || p45.dead;
          res.scytheDust = dusts().filter((t) => t === 27).length;
        } else res.noProj = true;
        break;
      }
      case 'vilethorn': {
        aim(+420, 0);
        clickOnce();
        let chain = 0;
        for (let t = 0; t < 50; t++) {
          pump(1);
          chain = Math.max(chain, g.entities.projectiles.filter((q) => [7, 8].includes(q.projId)).length);
        }
        res.chainMax = chain;
        res.item8 = sfxFiles().filter((s) => s.includes('Item_8')).length;
        break;
      }
      case 'rainbowRod': {
        aim(+420, -30);
        clickOnce();
        let p79 = null;
        for (let i = 0; i < 16 && !p79; i++) { pump(1); p79 = g.entities.projectiles.find((q) => q.projId === 79 && !q.dead); }
        if (p79) {
          for (let t = 0; t < 35; t++) pump(1);
          res.item9Loop = sfxFiles().filter((s) => s.includes('Item_9')).length;
          res.d66Fly = dusts().filter((t) => t === 66).length;
          window.__r32sfx.length = 0; window.__r32dust.length = 0;
          p79.timeLeft = 1;
          for (let t = 0; t < 4 && !p79.dead; t++) pump(1);
          res.killDead = !!p79.dead;
          res.item10 = sfxFiles().some((s) => s.includes('Item_10'));
          res.burst66 = dusts().filter((t) => t === 66).length;
          res.trail267 = dusts().filter((t) => t === 267).length;
        } else res.noProj = true;
        break;
      }
      case 'aquaScepter': {
        aim(+420, -60);
        clickOnce();
        let total = 0;
        for (let t = 0; t < 24; t++) {
          pump(1);
          total = Math.max(total, adds().filter((e) => e.pid === 22).length);
        }
        res.maxSimultaneous = total;
        res.totalFired = adds().filter((e) => e.pid === 22).length;
        break;
      }
      case 'shadowbeam': {
        aim(+520, 0);   // 打向右墙(px0+34)
        clickOnce();
        let flips = 0, lastSign = 0;
        let p294 = null;
        for (let t = 0; t < 90; t++) {
          pump(1);
          p294 = p294 ?? g.entities.projectiles.find((q) => q.projId === 294);
          if (p294 && !p294.dead) {
            const s = Math.sign(p294.vx);
            if (lastSign !== 0 && s !== 0 && s !== lastSign) flips++;
            if (s !== 0) lastSign = s;
          }
        }
        res.fired = adds().filter((e) => e.pid === 294).length;
        res.flips = flips;
        res.dust173 = dusts().filter((t) => t === 173).length;
        const ent = g.entities.projectiles.find((q) => q.projId === 294);
        res.alpha255 = ent ? ent.alpha === 255 : null;
        break;
      }
      case 'infernoFork': {
        aim(+520, 0);
        clickOnce();
        for (let t = 0; t < 80; t++) pump(1);
        res.fired295 = adds().filter((e) => e.pid === 295).length;
        const pillars = adds().filter((e) => e.pid === 296);
        res.pillarCount = pillars.length;
        res.pillarWH = pillars[0] ? `${pillars[0].w}x${pillars[0].h}` : null;
        res.item74 = sfxFiles().some((s) => s.includes('Item_74'));
        break;
      }
      case 'toxicFlask': {
        aim(+360, -20);
        clickOnce();
        for (let t = 0; t < 70; t++) pump(1);
        const clouds = adds().filter((e) => [511, 512, 513].includes(e.pid));
        res.cloudCount = clouds.length;
        res.cloudPids = [...new Set(clouds.map((c) => c.pid))].sort().join(',');
        res.item107 = sfxFiles().some((s) => s.includes('Item_107'));
        res.thrown = adds().filter((e) => e.pid === 510).length;
        break;
      }
      case 'blizzardStaff': {
        aim(+420, -20);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        pump(24);
        g.input.mouseDown = false; g.input.mouseHeld = false;
        const snow = adds().filter((e) => e.pid === 337);
        res.fired337 = snow.length;
        res.aboveAim = snow.filter((e) => e.vy > 0).length;   // 天降:向下落
        res.spawnHeights = snow.slice(0, 4).map((e) => Math.round(e.y));
        res.playerY = Math.round(g.player.y);
        break;
      }
      case 'medusaHead': {
        aim(+300, -10);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        pump(240);
        g.input.mouseDown = false; g.input.museHeld = false;
        g.input.mouseHeld = false;
        g.input.mouseDown = false; g.input.mouseHeld = false;
        res.volleys = adds().filter((e) => e.pid === 535).length;
        res.manaSpent = (g.player.maxMana ?? 200) - g.player.mana;
        res.dustGaze = [...new Set(dusts())].slice(0, 10).join('/');
      }
      case 'nebulaBlaze': {
        aim(+420, -20);
        clickOnce();
        for (let t = 0; t < 30; t++) pump(1);
        res.fired634 = adds().filter((e) => e.pid === 634).length;
        res.item20 = sfxFiles().filter((s) => s.includes('Item_20')).length;
        res.dustTypes = [...new Set(dusts())].slice(0, 12).join('/');
        break;
      }
      case 'tsunami': {
        aim(+480, 0);
        const volleySizes = [];
        for (let v = 0; v < 3; v++) {
          window.__r32adds.length = 0;
          g.player.useTime = 0;
          clickOnce();
          pump(26);
          const n = adds().filter((e) => e.pid === 1).length;
          volleySizes.push(n);
          pump(30);
        }
        res.volleySizes = volleySizes.join(',');
        res.allIn35 = volleySizes.every((n) => n >= 3 && n <= 5);
        break;
      }
      case 'phantasm': {
        aim(+500, 0);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        window.__r32tick++; g.fixedUpdate(1 / 60);
        g.input.mouseDown = false;
        const carrier = g.entities.projectiles.find((q) => q.projId === 630 && !q.dead);
        res.carrier = !!carrier;
        const volleyTicks = [];
        let lastN = adds().filter((e) => e.pid !== 630).length;
        for (let t = 0; t < 130; t++) {
          window.__r32tick++; g.fixedUpdate(1 / 60);
          const n = adds().filter((e) => e.pid !== 630).length;
          if (n > lastN) volleyTicks.push(t);
          lastN = n;
        }
        g.input.mouseHeld = false;
        const gaps = [];
        for (let i = 1; i < volleyTicks.length; i++) gaps.push(volleyTicks[i] - volleyTicks[i - 1]);
        res.gaps = gaps.join(',');
        const groups = {};
        for (const e of adds()) {
          if (e.pid === 630 || e.pid === 631) continue;
          groups[e.t] = (groups[e.t] ?? 0) + 1;
        }
        res.batchSizes = Object.values(groups).join(',');
        break;
      }
      case 'tacticalShotgun': {
        aim(+500, 0);
        clickOnce();
        const pellets = adds().filter((e) => e.pid === 14);
        res.count = pellets.length;
        const angs = pellets.map((e) => Math.atan2(e.vy, e.vx));
        res.spreadRad = angs.length ? +(Math.max(...angs) - Math.min(...angs)).toFixed(3) : -1;
        break;
      }
      case 'onyxBlaster': {
        aim(+500, 0);
        clickOnce();
        for (let t = 0; t < 90; t++) pump(1);
        res.shards = adds().filter((e) => e.pid === 14).length;
        res.bolt = adds().filter((e) => e.pid === 661).length;
        res.item14 = sfxFiles().some((s) => s.includes('Item_14'));
        res.dust62 = dusts().filter((t) => t === 62).length;
        break;
      }
      case 'clockworkAR': {
        aim(+500, 0);
        g.player.useTime = 0;
        const t0 = window.__r32tick;
        clickOnce();
        res.cdImmediate = g.player.useTime;
        for (let i = 0; i < 16; i++) pump(1);
        res.shotTicks = adds().filter((e) => e.pid === 14).map((e) => e.t - t0).join(',');
        res.tapShots = res.shotTicks.split(',').filter(Boolean).length;
        break;
      }
      case 'starCannon': {
        aim(+500, 0);
        clickOnce();
        for (let t = 0; t < 20; t++) pump(1);
        res.fired955 = adds().filter((e) => e.pid === 955).length;
        res.item9Use = sfxFiles().some((s) => s.includes('Item_9'));
        res.ammoAfter = g.player.inv.slots[54]?.stack ?? null;
        break;
      }
      case 'woodenBoomerang': {
        aim(+320, -10);
        clickOnce();
        let minDist = 1e9;
        const bom = adds().find((e) => e.ctor === 'Boomerang');
        for (let t = 0; t < 150 && !(bom?.ref.dead); t++) {
          pump(1);
          if (bom) minDist = Math.min(minDist, Math.hypot(bom.ref.cx - g.player.cx, bom.ref.cy - g.player.cy));
        }
        res.spawned = !!bom;
        res.minDistNear = bom ? Math.round(minDist) : null;
        res.returnedOrDead = bom ? (bom.ref.dead || minDist < 48) : false;
        break;
      }
      case 'blueMoon': {
        aim(+260, -20);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        for (let i = 0; i < 8; i++) pump(1);
        g.input.mouseDown = false; g.input.mouseHeld = false;
        let thrown = 0;
        for (let t = 0; t < 60; t++) {
          pump(1);
          const b = g.entities.projectiles.find((q) => q.constructor?.name === 'FlailProj');
          if (b) thrown = Math.max(thrown, b.aiState ?? 0);
        }
        res.spawned = adds().filter((e) => e.pid === 26).length + g.entities.projectiles.filter((q) => q.projId === 26).length;
        res.maxAiState = thrown;
        break;
      }
      case 'darkLance': {
        aim(+420, 0);
        clickOnce();
        for (let t = 0; t < 40; t++) pump(1);
        res.spear46 = adds().filter((e) => e.pid === 46).length;
        res.d14 = dusts().filter((t) => t === 14).length;
        res.d27 = dusts().filter((t) => t === 27).length;
        break;
      }
      case 'valor': {
        aim(+280, -30);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        let aliveTicks = 0;
        for (let t = 0; t < 60; t++) {
          pump(1);
          if (g.entities.projectiles.some((q) => q.constructor?.name === 'YoyoProj' && !q.dead)) aliveTicks++;
        }
        g.input.mouseHeld = false; g.input.mouseDown = false;
        res.yoyoSpawned = adds().some((e) => e.pid === 564);
        res.aliveTicks = aliveTicks;
        break;
      }
      case 'chainGuillotines': {
        aim(+420, 0);
        clickOnce();
        let maxDist = 0;
        for (let t = 0; t < 120; t++) {
          pump(1);
          const gu = g.entities.projectiles.find((q) => q.projId === 481);
          if (gu) maxDist = Math.max(maxDist, Math.hypot(gu.cx - g.player.cx, gu.cy - g.player.cy));
        }
        const gu = g.entities.projectiles.find((q) => q.projId === 481);
        res.spawned481 = adds().filter((e) => e.pid === 481).length;
        res.maxDist = Math.round(maxDist);
        res.stillAlive = !!gu && !gu.dead;
        break;
      }
      case 'impStaff': {
        aim(+240, -20);
        clickOnce();
        for (let t = 0; t < 60; t++) pump(1);
        res.summoned375 = adds().filter((e) => e.pid === 375).length;
        const minion = g.entities.projectiles.find((q) => q.projId === 375);
        res.aliveAfter60 = !!minion && !minion.dead;
        res.followDist = minion ? Math.round(Math.hypot(minion.cx - g.player.cx, minion.cy - g.player.cy)) : null;
        res.item77 = sfxFiles().some((s) => s.includes('Item_77'));
        break;
      }
      case 'rainbowCrystal': {
        const { pickSentryLandingSpot } = await import('/src/entities/MinionProj.ts').catch(() => import('/src/entities/MinionProj'));
        const aimWX = (px0 - 30) * 16, aimWY = (gy - 20) * 16;
        g.camera.x = aimWX; g.camera.y = aimWY;
        g.input.mouseX = 640; g.input.mouseY = 400;
        clickOnce();
        const spot = pickSentryLandingSpot(st, aimWX, aimWY, 3571, st.h);
        const s643 = adds().find((e) => e.pid === 643);
        res.spawned643 = !!s643;
        res.posMatch = !!s643 && Math.abs(s643.x - spot.x) < 0.01 && Math.abs(s643.y - spot.y) < 0.01;
        let drift = 0;
        if (s643) {
          const y0 = s643.ref.y;
          // 悬浮 + 观察 volley 尘爆发节奏(90t)
          const dustByTick = [];
          for (let t = 0; t < 90; t++) {
            const before = window.__r32dust.length;
            window.__r32tick++; g.fixedUpdate(1 / 60);
            drift = Math.max(drift, Math.abs(s643.ref.y - y0));
            dustByTick.push(window.__r32dust.length - before);
          }
          // volley = 单拍尘爆发 ≥6;统计间隔
          const bursts = [];
          dustByTick.forEach((n, t) => { if (n >= 6) bursts.push(t); });
          const gaps2 = [];
          for (let i = 1; i < bursts.length; i++) gaps2.push(bursts[i] - bursts[i - 1]);
          gaps2.sort((a, b) => a - b);
          res.volleyBursts = bursts.length;
          res.volleyGapMedian = gaps2.length ? gaps2[Math.floor(gaps2.length / 2)] : null;
        }
        res.drift = drift;
        break;
      }
      case 'snapthorn':
      case 'morningStar': {
        aim(+340, -10);
        g.input.mouseDown = true; g.input.mouseHeld = true;
        pump(26);
        g.input.mouseDown = false; g.input.mouseHeld = false;
        const wantPid = spec.id === 'morningStar' ? 848 : 847;
        res.whipPid = wantPid;
        res.whipSpawned = adds().filter((e) => e.pid === wantPid).length
          + g.entities.projectiles.filter((q) => q.projId === wantPid).length;
        res.dustTypes = [...new Set(dusts())].slice(0, 14).join('/');
        res.trailDustTotal = dusts().length;
        if (spec.id === 'morningStar') res.d172 = dusts().filter((t) => t === 172).length;
        break;
      }
      default:
        res.unknownWeapon = true;
    }

    // 截图(精确时点:canvas 当前帧)
    try { res.png = g.renderer.canvas.toDataURL('image/png'); } catch { res.png = null; }
    return res;
  };
});

let pass = 0, fail = 0;
const results = [];
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`);
  return ok;
};

for (const fam of FAMILIES) {
  const list = WEAPONS[fam];
  if (!list) { console.log(`unknown family ${fam}`); continue; }
  console.log(`\n########## FAMILY ${fam} ##########`);
  for (const w of list) {
    if (ONLY && w.id !== ONLY) continue;
    const wp = { pass: 0, fail: 0, fails: [] };
    const ck = (name, ok, extra = '') => {
      const line = `[${w.id}] ${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`;
      console.log(line);
      if (ok) wp.pass++; else { wp.fail++; wp.fails.push(`${name}${extra ? ' (' + extra + ')' : ''}`); }
    };
    let out = null;
    try {
      out = await page.evaluate((spec) => window.__r32run(spec), w);
    } catch (e) {
      ck('evaluate 执行', false, e.message.slice(0, 160));
      results.push({ family: fam, ...w, ...wp }); continue;
    }
    if (out.png) {
      try { fs.writeFileSync(`${SHOTS}/${w.id}.png`, Buffer.from(out.png.split(',')[1], 'base64')); } catch { /* noop */ }
    }
    const J = JSON.stringify;
    switch (w.id) {
      case 'amethystStaff':
        ck('出膛 121 弹 ≥1', out.fired >= 1, `fired=${out.fired}`);
        ck('绘制角==速度向角(≥4 渲染轮)', out.framesWithAngle >= 4, `frames=${out.framesWithAngle}`);
        ck('飞行彩尘 d86+ 出现', out.dustGem >= 1, `dust86=${out.dustGem}`);
        break;
      case 'crystalStorm':
        ck('按住一窗多发 94 弹 ≥3', out.fired >= 3, `fired=${out.fired}`);
        ck('出速散布带(极差>0 且 ≤3.2)', out.speeds && out.speeds.length >= 2
          && Math.max(...out.speeds) - Math.min(...out.speeds) > 0
          && Math.max(...out.speeds) - Math.min(...out.speeds) <= 3.2, `speeds=${J(out.speeds)}`);
        break;
      case 'waterBolt':
        ck('27 弹出膛+寿命收敛 1800 带+隐形 alpha255', !out.noProj && out.life <= 1800 && out.life > 1700 && out.alpha255,
          `life=${out.life} alpha255=${out.alpha255}`);
        ck('五点错位 d172 拖尾 ≥4.5 枚/帧', out.perFrame >= 4.5, `perFrame=${out.perFrame}`);
        ck('帧面拖尾像素差分 ≥200', out.diffPix >= 200, `diffPix=${out.diffPix}`);
        break;
      case 'demonScythe':
        ck('前 29 拍慢速(<0.25)', out.vAt29 < 0.25, `vAt29=${out.vAt29}`);
        ck('加速到目标带 11±1.5', out.peak > 9.5 && out.peak < 13.5, `peak=${out.peak}`);
        ck('aiCnt≥100 后冻结', !!out.frozen);
        break;
      case 'vilethorn':
        ck('荆棘链段 ≥5', out.chainMax >= 5, `chainMax=${out.chainMax}`);
        ck('出生音 Item_8 ≥1', out.item8 >= 1, `item8=${out.item8}`);
        break;
      case 'rainbowRod':
        ck('每拍 1×d66 disco 尘(35 帧 ≥33)', out.d66Fly >= 33, `d66=${out.d66Fly}`);
        ck('Item_9 十拍循环音 ≥3 次', out.item9Loop >= 3, `item9=${out.item9Loop}`);
        ck('Kill:死+Item_10+d66 迸散+d267 尾迹', out.killDead && out.item10 && out.burst66 >= 14 && out.trail267 > 0,
          `dead=${out.killDead} item10=${out.item10} b66=${out.burst66} t267=${out.trail267}`);
        break;
      case 'aquaScepter':
        ck('单击两发 22(同屏≥2 或累计=2)', out.maxSimultaneous >= 2 || out.totalFired === 2,
          `maxSim=${out.maxSimultaneous} total=${out.totalFired}`);
        break;
      case 'shadowbeam':
        ck('隐形弹体(alpha=255)', out.alpha255 === true, `alpha=${out.alpha255}`);
        ck('编排束尘 d173 大量出现(≥60)', out.dust173 >= 60, `d173=${out.dust173}`);
        ck('无限墙反弹(flips≥1)', out.flips >= 1, `flips=${out.flips}`);
        break;
      case 'infernoFork':
        ck('295 出膛', out.fired295 >= 1, `fired=${out.fired295}`);
        ck('Kill 火柱 296 盒 150×150', out.pillarCount >= 1 && out.pillarWH === '150x150',
          `pillar=${out.pillarCount} wh=${out.pillarWH}`);
        ck('发射双音 Item_74', out.item74, `item74=${out.item74}`);
        break;
      case 'toxicFlask':
        ck('510 投掷出膛', out.thrown >= 1, `thrown=${out.thrown}`);
        ck('毒云片 18..32(511-513)', out.cloudCount >= 18 && out.cloudCount <= 32,
          `clouds=${out.cloudCount} pids=${out.cloudPids}`);
        ck('爆音 Item_107', out.item107);
        break;
      case 'blizzardStaff':
        ck('天降雪 337 一窗 ≥2', out.fired337 >= 2, `fired=${out.fired337}`);
        ck('全部自上而下(vy>0)', out.fired337 > 0 && out.aboveAim === out.fired337, `vyPos=${out.aboveAim}`);
        break;
      case 'medusaHead':
        ck('channel 多 volley(240t 内 ≥3 发 535)', out.volleys >= 3, `volleys=${out.volleys}`);
        break;
      case 'nebulaBlaze':
        ck('634 出膛 ≥1', out.fired634 >= 1, `fired=${out.fired634}`);
        ck('出手音 Item_20', out.item20 >= 1, `item20=${out.item20}`);
        break;
      case 'tsunami':
        ck('海啸扇 3-5 箭 ×3 波全带内', out.allIn35, `volleys=[${out.volleySizes}]`);
        break;
      case 'phantasm':
        ck('630 载体生成', out.carrier);
        ck('volley 间隔递减至 18(gap0=24)', (() => {
          const gs = (out.gaps || '').split(',').filter(Boolean).map(Number);
          return gs.length > 2 && gs[0] === 24 && gs.every((v, i) => i === 0 || v <= gs[i - 1]) && gs.includes(18);
        })(), `gaps=[${out.gaps}]`);
        ck('每轮 volley 4 箭', (out.batchSizes || '').split(',').filter(Boolean).every((n) => Number(n) === 4),
          `batches=[${out.batchSizes}]`);
        break;
      case 'tacticalShotgun':
        ck('单击 6 弹丸', out.count === 6, `count=${out.count}`);
        ck('散角带宽(>0.08 rad)', out.spreadRad > 0.08, `spread=${out.spreadRad}`);
        break;
      case 'onyxBlaster':
        ck('弹片 ≥3+黑爆 661×1', out.shards >= 3 && out.bolt === 1, `shards=${out.shards} bolt=${out.bolt}`);
        ck('二段爆 Item_14+d62 暗环', out.item14 && out.dust62 >= 16, `item14=${out.item14} d62=${out.dust62}`);
        break;
      case 'clockworkAR':
        ck('tap 三连发错峰', out.tapShots === 3, `shots=${out.tapShots} ticks=[${out.shotTicks}]`);
        ck('冷却=动画12+rd14=26', out.cdImmediate === 26, `cd=${out.cdImmediate}`);
        break;
      case 'starCannon':
        ck('955 坠星出膛=1', out.fired955 === 1, `fired=${out.fired955}`);
        ck('开炮音 Item_9+耗坠落星弹药', out.item9Use && out.ammoBefore !== null
          && out.ammoAfter !== null && out.ammoAfter < out.ammoBefore, `item9=${out.item9Use} ammo ${out.ammoBefore}->${out.ammoAfter}`);
        break;
      case 'woodenBoomerang':
        ck('52 回旋镖出膛', out.spawned);
        ck('返回近手(<48px)或消亡', out.returnedOrDead, `minDist=${out.minDistNear}px`);
        break;
      case 'blueMoon':
        ck('链枷 26 出膛', out.spawned >= 1, `spawned=${out.spawned}`);
        ck('松手后掷出态(aiState≥1)', out.maxAiState >= 1, `maxState=${out.maxAiState}`);
        break;
      case 'darkLance':
        ck('矛 46 出膛', out.spear46 >= 1, `spear=${out.spear46}`);
        ck('d14/d27 双粒拖尾齐现', out.d14 >= 2 && out.d27 >= 2, `d14=${out.d14} d27=${out.d27}`);
        break;
      case 'valor':
        ck('悠悠球 564 出膛', out.yoyoSpawned);
        ck('持握期存活 ≥55/60 拍', out.aliveTicks >= 55, `alive=${out.aliveTicks}/60`);
        break;
      case 'chainGuillotines':
        ck('481 出膛', out.spawned481 >= 1, `n=${out.spawned481}`);
        ck('锚定族行程 >450px', out.maxDist > 450, `maxDist=${out.maxDist}px`);
        break;
      case 'impStaff':
        ck('小鬼 375 召唤成功', out.summoned375 >= 1, `n=${out.summoned375}`);
        ck('60t 后存活且随主(距离<400px)', out.aliveAfter60 && out.followDist < 400, `alive=${out.aliveAfter60} dist=${out.followDist}`);
        ck('召唤音 Item_77', out.item77);
        break;
      case 'rainbowCrystal':
        ck('哨兵 643 落地扫描放置(posMatch)', out.spawned643 && out.posMatch, `spawned=${out.spawned643} posMatch=${out.posMatch}`);
        ck('恒悬浮(drift=0)', out.drift === 0, `drift=${out.drift}`);
        ck('volley 尘爆发节拍(median gap≈26±10,≥2 次)',
          out.volleyBursts >= 2 && out.volleyGapMedian != null && out.volleyGapMedian >= 16 && out.volleyGapMedian <= 36,
          `bursts=${out.volleyBursts} median=${out.volleyGapMedian}`);
        break;
      case 'snapthorn':
        ck('鞭体 847 出膛', out.whipSpawned >= 1, `n=${out.whipSpawned}`);
        ck('拖尾尘出现(总量 ≥5)', out.trailDustTotal >= 5, `total=${out.trailDustTotal} types=${out.dustTypes}`);
        break;
      case 'morningStar':
        ck('鞭体 848 出膛', out.whipSpawned >= 1, `n=${out.whipSpawned}`);
        ck('晨星 d172 拖尾尘(≥3)', out.d172 >= 3, `d172=${out.d172}`);
        break;
      default: ck('unknown', false, w.id);
    }
    if (wp.fail === 0) pass++; else fail++;
    results.push({ family: fam, ...w, ...wp });
    fs.appendFileSync(JSONL, JSON.stringify({ ts: Date.now(), family: fam, id: w.id, pass: wp.pass, fail: wp.fail, fails: wp.fails }) + '\n');
  }
}

console.log(`\n==== R32 MATRIX: ${pass} weapons PASS / ${fail} weapons FAIL ====`);
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
