// ★FX53 全量普查探针：敌方弹幕 id 逐个隔离运行（stub ctx）,统计尘站实态
//  （飞行期每 tick 尘频/尘型 + 死亡拍 Kill 尘 + 泛色 spawnParticles 标记 + 音）。
//  载体判定：DART_STYLE[id] → Dart；RANGED_TABLE proj / bossAI shoot → Arrow。
//  产物 JSON → /tmp/fx53-census-result.json。私有 vite(5256) 下经 run-diag 运行。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

// 普查域（冻结清单,来源见 docs/npc-proj-dust-census.md §1）：
const DART_STYLE_IDS = [31,38,44,55,75,81,82,83,84,96,115,128,129,174,176,177,180,257,288,290,291,293,299,300,302,303,471,498,501,508,537,572,573,577,596,605,811,814,836,909,1073];
const RANGED_ONLY = [81,82,177,180,300,302,303,436,438,471,501,508,537,572,573,581,592]; // RANGED_TABLE proj 值
const BOSS_ARROW = [100,101,259,270,329,452,454,462,467,468,472,538,575,576,593,622,719,811,814,836,872,873,874,909,920,922,926,1001,1021]; // bossAI shoot()/直构（Arrow 载体）
const IDS = [...new Set([...DART_STYLE_IDS, ...RANGED_ONLY, ...BOSS_ARROW])].sort((a, b) => a - b);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
// 不进游戏：直接在菜单页做 stub 隔离运行（页面只承担模块装载）
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });

const result = await page.evaluate(async (IDS) => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const { Dart, DART_STYLE } = await import('/src/entities/Dart.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { World } = await import('/src/world/World.ts');

  function makeCtx() {
    const dusts = [];            // {type,tick,alpha,scale,noGravity,x,y}
    const particles = [];        // 泛色 trail 标记
    const sfx = [];
    const spawnedEnts = [];
    const w = new World(120, 200, 7, 'open');   // 无地板：飞行期不撞块（id 内建 grav 会坠出界=寿终）
    const ctx = {
      world: w,
      player: { x: -9999, y: -9999, w: 20, h: 42, cx: -9989, cy: -9978, dead: true, vx: 0, vy: 0 },
      enemies: () => [], critters: () => [], projectiles: () => [],
      entities: { nextId: 1, add: (e) => { spawnedEnts.push(e); } },
      playSfx: (n) => sfx.push('sfx:' + n),
      playSfxFile: (n) => sfx.push('file:' + n),
      playSfxFiles: (n) => sfx.push('files:' + (Array.isArray(n) ? n.join('+') : n)),
      playSfxWav: (n) => sfx.push('wav:' + n),
      spawnParticles: (x, y, color, count) => { particles.push({ color, count }); },
      spawnDust: (x, y, bw, bh, type, sx = 0, sy = 0, alpha = 0, _c = null, scale = 1, ng = false) => {
        const d = { type, alpha, scale, noGravity: !!ng, x: 0, y: 0, vx: 0, vy: 0, fadeIn: 0, noGravitySet: false };
        dusts.push({ type, tick: -1, alpha, scale, noGravity: !!ng });
        return d;
      },
      addDamageNumber: () => {}, spawnDrop: () => null, cutTile: () => {}, breakTile: () => {},
      damagePlayer: () => 0, addLightAt: () => {}, broadcastParticleOrchestra: () => {},
      candidatePlayers: () => [],
    };
    return { ctx, dusts, particles, sfx, spawnedEnts };
  }

  const TICKS = 90;
  for (const id of IDS) {
    const isDart = !!DART_STYLE[id];
    const entry = { carrier: isDart ? 'Dart' : 'Arrow', dartStyle: isDart ? DART_STYLE[id] : null };
    try {
      const { ctx, dusts, particles, sfx, spawnedEnts } = makeCtx();
      let proj;
      if (isDart) proj = new Dart(60 * 16, 60 * 16, 6, 0, 30, id);
      else proj = new Arrow(60 * 16, 60 * 16, 6, 0, 30, 0, id, { hostile: true, grav: 0, life: 600, pierce: 1 });
      proj.hostile = true;
      entry.life0 = proj.life;
      let diedAt = -1;
      for (let t = 0; t < TICKS; t++) {
        if (proj.dead && diedAt < 0) diedAt = t;
        if (diedAt >= 0) break;
        const before = dusts.length;
        proj.fixedUpdate(1 / 60, ctx);
        for (let k = before; k < dusts.length; k++) dusts[k].tick = t;
      }
      entry.diedAt = diedAt < 0 ? -1 : diedAt;
      entry.flightTicks = diedAt < 0 ? TICKS : diedAt;
      const flight = {}, death = {};
      for (const d of dusts) {
        const bucket = (diedAt >= 0 && d.tick >= diedAt) ? death : flight;
        bucket[d.type] = (bucket[d.type] || 0) + 1;
      }
      entry.flightDust = flight;
      entry.deathDust = death;
      entry.alphaSamples = [...new Set(dusts.map(d => d.alpha))].slice(0, 6);
      entry.scaleSamples = [...new Set(dusts.map(d => Math.round(d.scale * 100) / 100))].slice(0, 6);
      entry.noGravityAny = dusts.some(d => d.noGravity);
      entry.particlesCalls = particles.length;   // 泛色 trail（近似）标记
      entry.sfx = [...new Set(sfx)].slice(0, 6);
      entry.killSpawned = spawnedEnts.length;    // Kill 再生成（478→480 等）
      entry.dead0 = !!proj.dead;
    } catch (e) {
      entry.error = String(e && e.message || e).slice(0, 160);
    }
    out[id] = entry;
  }
  await wait(0);
  return out;
}, IDS);

console.log(JSON.stringify({ ok: true, ids: IDS.length, errs }, null, 1));
const json = JSON.stringify(result);
fs.writeFileSync('/tmp/fx53-census-result.json', json);
await browser.close();
