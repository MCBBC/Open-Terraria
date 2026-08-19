// 遗留补齐验证探针:①鸟粪弹 1080 全链(掷出→落体→Stinky) ②蚯蚓自旋/坡面
// ③鸮待机转头状态机 ④宝箱怪状态机。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const mod = await import('/src/render/Renderer.ts');
  const out = {};

  // ---- ① 鸟粪弹:鸟悬玩家正上 → 掷出 → 落到玩家 → Stinky ----
  {
    // 清理可能的既有小动物,生成鸟并钉在玩家上方(有视线)
    p.luckState.brokenMirrorBadLuckTime = 3600;   // luck=−0.25:鸟粪只在负幸运时掷(1/5×25%/tick)
    p.luckState.ladyBugLuckTimeLeft = -43200;     // 再叠瓢虫霉运,保证 luck<0
    const bird = g.spawnNpcByVanilla(74, p.x + 20, p.y - 120);
    if (!bird) { out.poop = { err: 'spawn bird fail' }; }
    else {
      bird.ai0 = 1; bird.lai3 = 0;   // 飞行态,鸟粪未掷
      bird.vx = 0; bird.vy = 0; bird.facing = 1;
      // 钉位:每 tick AI 会移动——把玩家挪到鸟正下方而非钉鸟
      p.x = bird.x + bird.w / 2 - p.w / 2;
      p.y = bird.y + bird.h + 40;
      let spawned = false;
      for (let i = 0; i < 300 && !spawned; i++) {
        // 鸟会开始飞离——持续把玩家对到鸟正下方(20ms 高频轮询防漏检瞬死弹)
        p.x = bird.x + bird.w / 2 - p.w / 2;
        p.y = bird.y + bird.h + 40;
        await new Promise((r) => setTimeout(r, 20));
        spawned = g.entities.projectiles.some((e) => e.constructor.name === 'PoopProj');
      }
      const poop = g.entities.projectiles.find((e) => e.constructor.name === 'PoopProj');
      out.poop = {
        spawned,
        cls: spawned ? 'PoopProj' : 'none',
      };
      if (spawned) {
        // 玩家停住(粪出生点即玩家中心 X 正上方)——自然落体命中 → Stinky
        let stinky = false;
        for (let i = 0; i < 400 && !stinky; i++) {
          await new Promise((r) => setTimeout(r, 20));
          try { stinky = p.buffs.has(76); } catch { stinky = false; }
        }
        out.poop.stinky = stinky;
        out.poop.dead = poop.dead;
      }
      bird.dead = true;
    }
  }

  // ---- ② 蚯蚓自旋:腾空累积 / 贴地归零 / 坡面 ±0.785 ----
  {
    const worm = g.spawnNpcByVanilla(357, p.x + 60, p.y - 60);
    if (!worm) out.worm = { err: 'spawn fail' };
    else {
      worm.vx = 0; worm.vy = -6;            // 抛起 → 腾空自旋累积
      await new Promise((r) => setTimeout(r, 300));
      const spinAir = worm.spin;
      await new Promise((r) => setTimeout(r, 900));   // 落地
      const spinGround = worm.spin;
      out.worm = { spinAir: +spinAir.toFixed(2), spinGround: +spinGround.toFixed(2),
        airOk: Math.abs(spinAir) > 0.05, groundOk: spinGround === 0 };
      worm.dead = true;
    }
  }

  // ---- ③ 鸮待机状态机:钉静止 → 连续采样帧序列应走 band(0,1,2,1...) ----
  {
    g.world.clock.timeOfDay = 0;        // 午夜(isDay 是 timeOfDay 派生 getter,直接赋值无效)
    g.world.weather.cloudAlpha = 0;     // + 晴空:夜间晴空鸮才栖息(白天/阴天恒起飞,:25456)
    const st2 = g.world.store;
    let gy = Math.floor(p.y / 16);
    const ox2 = Math.floor((p.x - 80) / 16);
    for (let y = Math.max(4, gy - 6); y < Math.min(st2.h - 4, gy + 30); y++) {
      if (st2.isSolid(ox2, y)) { gy = y; break; }
    }
    const owl = g.spawnNpcByVanilla(611, p.x - 80, gy * 16 - 1);
    if (!owl) out.owl = { err: 'spawn fail' };
    else {
      owl.owlAirborneInit = true;   // 跳过出生即飞(测试直接站定)
      owl.ai0 = 0; owl.vx = 0; owl.vy = 0;
      owl.y = gy * 16 - owl.h; owl.x = p.x - 80;
      await new Promise((r) => setTimeout(r, 300));
      const seq = [];
      for (let i = 0; i < 40; i++) {
        seq.push(mod.vanillaFrameIdx(owl, 13));
        await new Promise((r) => setTimeout(r, 100));
      }
      out.owl = { seq: seq.filter((_, i) => i % 2 === 0), ai0: owl.ai0 };   // 每 200ms 取一样本(20t)
      owl.dead = true;
    }
  }

  // ---- ④ 宝箱怪状态机:伪装恒帧0;警戒 ai1 分段;回落段递减 ----
  {
    const m = g.spawnNpcByVanilla(473, p.x - 140, p.y - 20);
    if (!m) out.mimic = { err: 'spawn fail' };
    else {
      m.ai0 = 0; m.vx = 0; m.vy = 0;
      const f0a = mod.vanillaFrameIdx(m, 14), f0b = mod.vanillaFrameIdx(m, 14);
      m.ai0 = 1; m.ai1 = 0; const f1 = mod.vanillaFrameIdx(m, 14);
      m.ai1 = 15; const f2 = mod.vanillaFrameIdx(m, 14);
      m.ai1 = 40; const f3 = mod.vanillaFrameIdx(m, 14);
      out.mimic = { f0a, f0b, f1, f2, f3 };
      m.dead = true;
    }
  }
  return out;
});

// ① 鸟粪
if (res.poop?.err) check('鸟粪:生成鸟', false, res.poop.err);
else {
  check('鸟粪掷出(PoopProj 入投射物桶)', res.poop.spawned, JSON.stringify(res.poop));
  if (res.poop.spawned) {
    check('鸟粪命中玩家 → Stinky buff', !!res.poop.stinky, `stinky=${res.poop.stinky} dead=${res.poop.dead}`);
  }
}
// ② 蚯蚓
if (res.worm?.err) check('蚯蚓:生成', false, res.worm.err);
else {
  check('蚯蚓腾空自旋累积(|spin|>0.05)', res.worm.airOk, `spin=${res.worm.spinAir}`);
  check('蚯蚓贴地自旋归零', res.worm.groundOk, `spin=${res.worm.spinGround}`);
}
// ③ 鸮待机
if (res.owl?.err) check('鸮:生成', false, res.owl.err);
else {
  const s = res.owl.seq;
  const inBand = s.every((f) => f >= 0 && f <= 7);
  const hasMotion = new Set(s).size > 2;   // 序列应跨多帧(band 推进)
  check('鸮待机帧 ∈ 0-7 且持续推进', inBand && hasMotion, JSON.stringify(s));
}
// ④ 宝箱怪
if (res.mimic?.err) check('宝箱怪:生成', false, res.mimic.err);
else {
  check('宝箱怪伪装态恒帧0', res.mimic.f0a === 0 && res.mimic.f0b === 0, JSON.stringify(res.mimic));
  check('宝箱怪警戒分段(ai1=0→1 / 15→3 / 40→6)', res.mimic.f1 === 1 && res.mimic.f2 === 3 && res.mimic.f3 === 6, JSON.stringify(res.mimic));
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
