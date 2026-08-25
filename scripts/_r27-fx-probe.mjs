// R27 魔法武器 I(前期族)视觉探针(蓝队自证,2026-08-25):
//   (a) Demon Scythe 弹速指数加速到目标带(AI_018 :25781-25798)
//   (b) Water Bolt 帧面连续水痕拖尾(d172 dust 计数 + canvas 像素采样双证)
//   (c) 宝石杖弹体绘制旋转角 ≈ 速度向角(rotation=velocity.ToRotation(),:38691
//       ——钩 CanvasRenderingContext2D.prototype.rotate 记录实际绘制参数)
//   (d) Rainbow Rod 飞行期每拍 d66 disco 尘 + Item_9 十拍循环音(playSfxFiles spy,
//       1458 AI_009 :44390-44406)+ Kill 爆
//   附加:Golden Shower 单击三连发(flag4)/Vilethorn 链段生成 + 出生音 Item_8
// 运行:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs scripts/_r27-fx-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- 平坦竞技场(天空,无敌怪干扰) ----
  const px0 = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) - 40;
  const py = gy;
  for (let dx = -60; dx <= 60; dx++) for (let dy = -30; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -60; dx <= 60; dx++) st.setTile(px0 + dx, py + 3, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  try { g.entities.enemies.length = 0; } catch { /* 只读数组则跳过 */ }
  try { window.__swSetPool?.([]); } catch { /* 池接口缺省则忽略 */ }
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);

  const res = {};
  // ---- 音/尘 spy(Game 实例自有属性覆写,实体侧经 GameHooks 调用即被记录) ----
  window.__r27sfx = [];
  window.__r27dust = [];
  if (!g.__od26playSfxFiles) {
    g.__od26playSfxFiles = g.playSfxFiles;
    g.spawnDustSpyOn = false;
    g.__od26spawnDust = g.spawnDust;
    g.playSfxFiles = function (files, vol, x, y) {
      window.__r27sfx.push(files.join(','));
      return g.__od26playSfxFiles.call(this, files, vol, x, y);
    };
    g.spawnDust = function (x, y, w, h, type, ...rest) {
      if (g.spawnDustSpyOn) window.__r27dust.push(type);
      return g.__od26spawnDust.call(this, x, y, w, h, type, ...rest);
    };
  }
  const spyReset = () => { window.__r27sfx.length = 0; window.__r27dust.length = 0; };

  const equip = (key) => {
    const id = window.__swItems[key];
    for (let i = 0; i < 60; i++) { const sl = g.player.inv.slots[i]; if (sl) g.player.inv.slots[i] = null; }
    g.player.inv.add(id, 1);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    g.player.mana = g.player.maxMana;
    g.player.manaRegenDelay = 0;
    return id;
  };
  const fireClick = () => {
    g.input.mouseX = 640 + 400; g.input.mouseY = 400;   // 水平向右
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
  };
  const release = () => { g.input.mouseDown = false; g.input.mouseHeld = false; };

  // ===== (a) Demon Scythe:0.2 起点 → ×1.06^k 加速 → 冻结 =====
  {
    equip('vi_272_DemonScythe');
    spyReset();
    fireClick();
    let p45 = null;
    for (let i = 0; i < 20 && !p45; i++) { g.fixedUpdate(1 / 60); p45 = g.entities.projectiles.find((q) => q.projId === 45 && !q.dead); }
    if (p45) {
      const v29 = [];
      for (let t = 1; t <= 28; t++) { g.fixedUpdate(1 / 60); v29.push(Math.hypot(p45.vx, p45.vy)); }
      const vAt29 = Math.hypot(p45.vx, p45.vy);
      for (let t = 1; t <= 70; t++) { g.fixedUpdate(1 / 60); }
      const vPeak = Math.hypot(p45.vx, p45.vy);
      const frozen = vPeak;
      for (let t = 1; t <= 20; t++) g.fixedUpdate(1 / 60);
      res.scythe = {
        startSlow: vAt29 < 0.25,
        peak: +vPeak.toFixed(2),
        frozen: Math.abs(Math.hypot(p45.vx, p45.vy) - frozen) < 1e-6 || p45.dead,
        spin: +(p45.spinRot % (Math.PI * 2)).toFixed(2),
        scytheDust: window.__r27dust.filter((t) => t === 27).length,
      };
    } else res.scythe = null;
    release();
  }

  // ===== (b) Water Bolt:d172 拖尾尘计数 + 像素采样连续水痕 =====
  {
    equip('vi_165_WaterBolt');
    spyReset(); g.spawnDustSpyOn = true;
    fireClick();
    let p27 = null;
    for (let i = 0; i < 20 && !p27; i++) { g.fixedUpdate(1 / 60); p27 = g.entities.projectiles.find((q) => q.projId === 27 && !q.dead); }
    if (p27) {
      const frames = 24;
      const path = [{ x: p27.cx, y: p27.cy }];
      for (let t = 0; t < frames; t++) { g.fixedUpdate(1 / 60); path.push({ x: p27.cx, y: p27.cy }); }
      const d172 = window.__r27dust.filter((t) => t === 172).length;
      res.waterbolt = {
        life: p27.life ?? p27.timeLeft,
        alpha255: p27.alpha === 255,
        dust172: d172,
        perFrame: +(d172 / frames).toFixed(2),       // ≥4.8 即五点错位链成立
      };
      // 像素采样(A/B diff):带拖尾帧 vs 清场后帧,只比对【飞行路径带】矩形——
      // 差分像素即拖尾本体(整帧 diff 会被云层漂移淹没)。★A 必须紧贴逻辑帧采样:
      // 页面自身 rAF 循环也在推进模拟,sleep 会把拖尾尘老化掉(实测曾 11948→137)
      const canvas = g.renderer.canvas;
      const ctx = canvas.getContext('2d');
      const pts = path.slice(-24);
      let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
      for (const q of pts) {
        const [px, py2] = g.camera.worldToScreen(q.x, q.y);
        sx0 = Math.min(sx0, px); sy0 = Math.min(sy0, py2);
        sx1 = Math.max(sx1, px); sy1 = Math.max(sy1, py2);
      }
      const rx = Math.max(0, Math.round(sx0 - 30)), ry = Math.max(0, Math.round(sy0 - 30));
      const rw = Math.max(4, Math.min(canvas.width - rx, Math.round(sx1 - sx0) + 60));
      const rh = Math.max(4, Math.min(canvas.height - ry, Math.round(sy1 - sy0) + 60));
      const A = ctx.getImageData(rx, ry, rw, rh).data;
      g.entities.projectiles.length = 0;
      await sleep(900);                               // 等拖尾尘自然消散
      const B = ctx.getImageData(rx, ry, rw, rh).data;
      let diff = 0;
      for (let j = 3; j < A.length; j += 4) {
        if (Math.abs(A[j] - B[j]) > 10 || Math.abs(A[j - 1] - B[j - 1]) > 10
          || Math.abs(A[j - 2] - B[j - 2]) > 10) diff++;
      }
      res.waterbolt.diffRect = `${rw}x${rh}@${rx},${ry}`;
      res.waterbolt.bluePix = diff;
    } else res.waterbolt = null;
    release(); g.spawnDustSpyOn = false;
  }

  // ===== (c) 宝石杖:绘制旋转角 == 速度向角(rotate 参数钩) =====
  {
    equip('vi_739_AmethystStaff');
    spyReset(); g.spawnDustSpyOn = true;
    fireClick();
    let p121 = null;
    for (let i = 0; i < 20 && !p121; i++) { g.fixedUpdate(1 / 60); p121 = g.entities.projectiles.find((q) => q.projId === 121 && !q.dead); }
    if (p121) {
      const expected = Math.atan2(p121.vy, p121.vx);
      // 钩 rotate 记录若干渲染帧的实际绘制角;宝石珠每帧恒画一次 → 统计"速度向角"
      // 出现的帧数(修复前该角不存在,只有 expected+π/2 直立误角)
      const proto = CanvasRenderingContext2D.prototype;
      const orig = proto.rotate;
      let framesWithAngle = 0;
      let totalSamples = 0;
      for (let round = 0; round < 5; round++) {
        const log = [];
        proto.rotate = function (a) { log.push(a); return orig.call(this, a); };
        await sleep(32);                              // ~2 渲染帧
        proto.rotate = orig;
        const norm = (a) => Math.abs(Math.atan2(Math.sin(a - expected), Math.cos(a - expected)));
        if (log.some((a) => norm(a) < 0.05)) framesWithAngle++;
        totalSamples += log.length;
      }
      const d0 = window.__r27dust.filter((t) => t >= 86 && t <= 91).length;
      res.gemBolt = { framesWithAngle, totalSamples, dust86: d0, expected: +expected.toFixed(3) };
    } else res.gemBolt = null;
    release(); g.spawnDustSpyOn = false;
    release();
  }

  // ===== (d) Rainbow Rod:d66 disco 尘每拍一枚 + Item_9 十拍循环 + Kill 爆 =====
  {
    equip('vi_495_RainbowRod');
    spyReset(); g.spawnDustSpyOn = true;
    fireClick();
    let p79 = null;
    for (let i = 0; i < 20 && !p79; i++) { g.fixedUpdate(1 / 60); p79 = g.entities.projectiles.find((q) => q.projId === 79 && !q.dead); }
    if (p79) {
      const frames = 35;
      for (let t = 0; t < frames; t++) g.fixedUpdate(1 / 60);
      const item9 = window.__r27sfx.filter((s) => s.includes('Item_9')).length;
      const d66 = window.__r27dust.filter((t) => t === 66).length;
      res.rainbow = { item9, d66, alive: !p79.dead };     // 十拍循环 → ≥3 次
      // 强制消亡 → Kill 爆(Resize128 AoE 结算面在敌怪缺失时只验尘/音)
      spyReset(); g.spawnDustSpyOn = true;
      p79.timeLeft = 1;
      for (let t = 0; t < 4 && !p79.dead; t++) g.fixedUpdate(1 / 60);
      res.rainbowKill = {
        dead: p79.dead,
        item10: window.__r27sfx.some((s) => s.includes('Item_10')),
        burst66: window.__r27dust.filter((t) => t === 66).length,
        trail267: window.__r27dust.filter((t) => t === 267).length,
      };
    } else res.rainbow = null;
    release(); g.spawnDustSpyOn = false;
  }

  // ===== 附加:Golden Shower 单击三连发 / Vilethorn 链段 =====
  {
    equip('vi_1336_GoldenShower');
    spyReset(); g.spawnDustSpyOn = true;
    fireClick(); release();
    let n280 = 0;
    for (let t = 0; t < 40; t++) {
      g.fixedUpdate(1 / 60);
      n280 = Math.max(n280, g.entities.projectiles.filter((q) => q.projId === 280 && !q.dead).length);
    }
    res.goldenShower = { maxSimultaneous: n280 };       // 三连发 → 至少 2 同屏、累计 3 发
    res.goldenShower.totalFired = g.entities.projectiles.filter((q) => q.projId === 280).length;
  }
  {
    equip('vi_64_Vilethorn');
    spyReset();
    fireClick(); release();
    let chain = 0;
    for (let t = 0; t < 50; t++) {
      g.fixedUpdate(1 / 60);
      chain = Math.max(chain, g.entities.projectiles.filter((q) => [7, 8].includes(q.projId)).length);
    }
    res.vilethorn = {
      chainMax: chain,
      item8: window.__r27sfx.filter((s) => s.includes('Item_8')).length,
    };
  }
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('(a) Demon Scythe 前 29 拍慢速(<0.25)', !!out.scythe?.startSlow, `vAt29≈${out.scythe?.startSlow}`);
check('(a) Demon Scythe 加速到目标带 11±1.5', out.scythe && out.scythe.peak > 9.5 && out.scythe.peak < 13.5, `peak=${out.scythe?.peak}`);
check('(a) Demon Scythe aiCnt≥100 后冻结', !!out.scythe?.frozen);
check('(b) Water Bolt 寿命收敛 1800(采样已耗若干拍)+隐形', out.waterbolt && out.waterbolt.life <= 1800
  && out.waterbolt.life > 1700 && out.waterbolt.alpha255, JSON.stringify(out.waterbolt ?? {}));
check('(c2) 宝石珠飞行彩尘 d86+ 已生成', out.gemBolt?.dust86 >= 1, `dust86=${out.gemBolt?.dust86}`);
check('(b) Water Bolt 五点错位拖尾 ≥4.5 枚/帧', out.waterbolt && out.waterbolt.perFrame >= 4.5, `perFrame=${out.waterbolt?.perFrame}`);
check('(b) Water Bolt 帧面拖尾差分像素 ≥200', out.waterbolt && out.waterbolt.bluePix >= 200, `diffPix=${out.waterbolt?.bluePix}`);
check('(c) 宝石珠绘制角==速度向角(≥4 渲染轮命中 atan2 角)', out.gemBolt?.framesWithAngle >= 4, JSON.stringify(out.gemBolt ?? {}));
check('(d) Rainbow Rod 飞行期每拍 1×d66 disco 尘', out.rainbow && out.rainbow.d66 >= out.rainbow.item9 * 10 - 2 && out.rainbow.d66 >= 33, JSON.stringify(out.rainbow ?? {}));
check('(d) Rainbow Rod Item_9 十拍循环 ≥3 次/35 帧', out.rainbow && out.rainbow.item9 >= 3, `item9=${out.rainbow?.item9}`);
check('(d) Rainbow Rod Kill:Item10+d66 迸散+d267 尾迹', out.rainbowKill?.dead && out.rainbowKill?.item10
  && out.rainbowKill.burst66 >= 14 && out.rainbowKill.trail267 > 0, JSON.stringify(out.rainbowKill ?? {}));
check('+ Golden Shower 单击三连发(同屏≥2)', out.goldenShower?.maxSimultaneous >= 2, JSON.stringify(out.goldenShower ?? {}));
check('+ Vilethorn 链段 ≥5 段 + Item_8 出生音', out.vilethorn?.chainMax >= 5 && out.vilethorn?.item8 >= 1, JSON.stringify(out.vilethorn ?? {}));
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
