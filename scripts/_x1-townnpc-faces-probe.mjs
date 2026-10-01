// ★清偿刀 X1（2026-10-01）实机探针：城镇 NPC 受理面家族收编——鞭打向导六面落地 +
//  GRAVE_MISTAKE 墓碑全链（勘误后真锚：墓碑弹杀城镇 NPC,非鞭杀向导）。
//  证据截图 → game/docs/evidence/bj430/。
//  运行：SW_ORIGIN=http://localhost:5710 node tools/run-diag.mjs scripts/_x1-townnpc-faces-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5710';
const OUT = new URL('../docs/evidence/bj430/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 200)); });

let ok = null;
for (let att = 0; att < 8 && !ok; att++) {
  try {
    await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    ok = 'yes';
  } catch { await new Promise((r) => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }

const ready = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) { await new Promise((r) => setTimeout(r, 500)); }
  return !!(window.__swGame?.player);
});
if (!ready) { console.log('NO GAME'); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
// 关掉欢迎覆层（遮挡证据截图）
for (const btn of await page.$$('button')) {
  const t = await btn.evaluate((b) => b.textContent ?? '');
  if (t.includes('我已知晓')) { await btn.click(); break; }
}
await new Promise((r) => setTimeout(r, 600));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TownNPC } = await import('/src/entities/TownNPC.ts').catch(() => import('/src/entities/TownNPC'));
  const { WhipProj } = await import('/src/entities/WhipProj.ts').catch(() => import('/src/entities/WhipProj'));
  const { BuffType } = await import('/src/stats/Buffs.ts').catch(() => import('/src/stats/Buffs'));

  // ---- 场景一：鞭打向导（face 1/2/3/4/5 实机落地）----
  // 向导：用场上的（vanillaId 22）,否则生成一只
  let guide = (g.entities.npcs ?? []).find((n) => !n.dead && n.vanillaId === 22);
  if (!guide) {
    guide = new TownNPC('guide', g.player.cx + 120, g.player.cy - 20);
    g.entities.add(guide, 'npcs');
    out.spawnedGuide = true;
  }
  // 巫毒门：实例面 equipStats 遮蔽原型 getter（探针侧注入,生产链=真佩戴 267）——
  // 展开原快照保留 jumpOpts 等嵌套引用,只并写 killGuide
  const realEq = { ...g.player.equipStats };
  Object.defineProperty(g.player, 'equipStats', {
    get() { return { ...realEq, killGuide: true }; }, configurable: true,
  });
  // ghostHeal 观测位：包装 applyLifeSteal（face 4——白耗面调用参数捕获）
  window.__x1LifeSteal = [];
  const origSteal = g.applyLifeSteal?.bind(g);
  if (origSteal) g.applyLifeSteal = (...a) => { window.__x1LifeSteal.push([...a]); return origSteal(...a); };
  // party 彩带观测位：浸剂 party buff 上身（face 3）——包装 spawnFriendlyProj 捕获
  g.player.buffs.apply(BuffType.ImbueParty, 15);
  window.__x1Friendly = [];
  const origFriendly = g.spawnFriendlyProj?.bind(g);
  if (origFriendly) g.spawnFriendlyProj = (e) => { window.__x1Friendly.push(e?.constructor?.name); return origFriendly(e); };
  const projCount0 = (g.entities.projectiles ?? []).length;

  // 鞭 913 火鞭（Firecracker,item 4912,proc 族）向右挥出,向导钉在曲线中段控制点
  const guideHp0 = guide.hp;
  const whip = new WhipProj(g.player.cx, g.player.cy, 0, 913, 4912, 60, 4, 30, 4, () => g.player);
  g.entities.add(whip, 'projectiles');
  for (let i = 0; i < 9; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
  const p = whip.pointsAt(20, true)[10];
  guide.x = p.x - guide.w / 2; guide.y = p.y - guide.h / 2;   // 钉位在控制点
  guide.vx = 0; guide.vy = 0; guide.stationary = true;
  for (let i = 0; i < 6; i++) {
    guide.x = p.x - guide.w / 2; guide.y = p.y - guide.h / 2; guide.vx = 0; guide.vy = 0;
    g.fixedUpdate(1 / 60); await sleep(0);
  }
  out.hit = guide.hp < guideHp0;
  out.dmgDealt = guideHp0 - guide.hp;
  out.lastStrikeDealt = guide.lastStrikeDealt;
  out.onFire3T = guide.onFire3T;                                    // face 1① ApplyWhipDebuffs
  out.procWindow = g.player.tagEffectStack.canProcOnNPC(4912, guide.id);   // face 5
  out.lifeStealCalls = JSON.parse(JSON.stringify(window.__x1LifeSteal));   // face 4
  out.confettiSpawn = window.__x1Friendly.filter((n) => n === 'ConfettiBurstProj').length;   // face 3 party
  void projCount0;
  out.iframesAfter = guide.iframes;                                  // W1 写梯=清窗形态
  out.hpAfterWhip = guide.hp;
  await new Promise((r) => setTimeout(r, 350));
  // DoT 实跑:再 tick 90 拍（1.5s）——onFire3 15HP/s → 再掉 ~22（含灼火尘粒子）
  const hpMid = guide.hp;
  for (let i = 0; i < 90; i++) {
    guide.x = guide.x; guide.stationary = true;
    g.fixedUpdate(1 / 60); await sleep(0);
    if (guide.dead) break;
  }
  out.dotLoss = hpMid - guide.hp;
  out.guideAliveAfterDot = !guide.dead;
  guide.onFire3T = 20;   // 燃烧延续供截图（实机 DoT 已由 dotLoss 证）
  out.guideScreen = { x: guide.cx, y: guide.cy };
  return out;
});

// 场景一截图：燃烧中的向导
try { await page.screenshot({ path: `${OUT}x1-whip-guide-burn.png` }); } catch {}

const res2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const guide = (g.entities.npcs ?? []).find((n) => n.vanillaId === 22);

  // ---- 场景二：GRAVE_MISTAKE 墓碑全链（face 6 真锚）----
  // FTW 旗置位（探针侧）→ 击杀玩家 → 掉 FTW 墓碑（damage 70）→ 落点钉向导 →
  // 墓碑杀镇民 → notifyProgressionEvent(36) → 成就完成
  g.world.seedFlags.getGoodWorld = true;
  out.ftwFlag = g.world.seedFlags.getGoodWorld === true;
  // 击杀玩家（死亡点 = 玩家当前位置）
  g.damagePlayer(99999, g.player.cx, g.player.cy - 10);
  await sleep(200);
  for (let i = 0; i < 10; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
  out.playerDead = g.player.dead;
  // 找到 FTW 墓碑（dmg=70）
  const tomb = (g.entities.props ?? []).find((t) => t?.constructor?.name === 'Tombstone' && !t.dead);
  out.tombFound = !!tomb;
  out.tombDmg = tomb?.dmg ?? null;
  // 向导逐拍钉到墓碑本体（保证坠落路径重叠）——hp 50 < 实扣 55 → 致死
  guide.hp = 50; guide.dead = false;
  let tombHit = false;
  for (let i = 0; i < 300; i++) {
    if (tomb && !tomb.dead) {
      guide.x = tomb.x + tomb.w / 2 - guide.w / 2;
      guide.y = tomb.y + tomb.h / 2 - guide.h / 2;
      guide.vx = 0; guide.vy = 0;
    }
    g.fixedUpdate(1 / 60); await sleep(0);
    if (guide.dead) { tombHit = true; break; }
  }
  out.graveGuideDead = guide.dead || tombHit;
  out.graveAchDone = g.achievements.completed.get('GRAVE_MISTAKE') === true;
  out.graveGuideHp = guide.hp;
  await new Promise((r) => setTimeout(r, 1200));
  return out;
});

console.log('X1 probe result (scene1 whip faces):', JSON.stringify(res, null, 1));
console.log('X1 probe result (scene2 grave chain):', JSON.stringify(res2, null, 1));
console.log('page errors:', logs.length ? logs.slice(0, 5) : 'none');
// 成就弹窗截图（若在屏）
try {
  await page.screenshot({ path: `${OUT}x1-grave-mistake-popup.png` });
} catch {}
await browser.close();
