// 一次性（IIIII232）：制作组名单（CreditsRoll）端到端探针。
//   ① 触发条件：月总首杀（bossBlock ev=10 分支）→ CreditsRollEvent.TryStarting
//   ② remainingTime = composer endTime（SkyManager AmountOfTimeNeededForFullPlay 等价）
//   ③ 每帧 UpdateTime 递减（Main.cs:65949）
//   ④ 选曲 89（MusicID.JourneysEnd，链首）
//   ⑤ 演出 overlay 上屏（CreditsRollSky 消费侧：opacity 斜坡 + 文字卷轴非空像素）
// SW_ORIGIN=http://localhost:5288 node tools/run-diag.mjs scripts/_iii232-credits-roll.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { creditsRoll } = await import('/src/world/CreditsRoll.ts');
  const { getCreditsRollFill } = await import('/src/world/creditsRollComposer.ts');
  const r = { wasDownedBefore: !!g.world.flags['downed_398'] };

  creditsRoll.reset();
  const fill = getCreditsRollFill(true);
  r.composer = { segments: fill.segments.length, endTime: fill.endTime };
  r.cvBefore = !!document.querySelector('.sw-credits');

  // 平地 + 召唤月总
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  for (let dx = -120; dx <= 120; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -120; dx <= 120; dx++) st.setTile(px0 + dx, gy + 1, 2);
  g.player.hp = g.player.maxHp;
  g.summonBoss('moon_lord');
  if (!g.boss) return { ...r, boss: false };
  r.bossId = g.boss.vanillaId;
  // 击杀（fromPlayer → 交互位；月总 398 死亡走 bossBlock 击败链）。
  // 核心 398 双手/头死前无敌（AI_077）——先清部件 394/396/397 再打核心
  const killParts = () => {
    for (const e of [...g.entities.enemies, ...g.entities.critters]) {
      if (e.dead || ![394, 396, 397].includes(e.vanillaId)) continue;
      for (let i = 0; i < 6 && !e.dead; i++) e.hurt(9999999, 1, 0, g, 0, false, 0, true);
    }
  };
  for (let i = 0; i < 12 && g.boss && !g.boss.dead; i++) {
    killParts();
    g.boss.hurt(9999999, 1, 0, g, 0, false, 0, true);
    for (let k = 0; k < 20; k++) g.fixedUpdate(1 / 60);
  }
  // 月总死亡演出（ai0=2 死亡动画段）走完才收 dead——步进 12s
  for (let i = 0; i < 60 * 12 && g.boss && !g.boss.dead; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    g.fixedUpdate(1 / 60);
  }
  r.coreHp = g.boss ? g.boss.hp : 0;
  r.coreAi0 = g.boss ? g.boss.ai0 : null;
  r.bossDead = !g.boss || g.boss.dead;
  r.downedFlag = !!g.world.flags['downed_398'];

  // ① 触发 + ② 时长
  r.event = {
    ongoing: creditsRoll.isEventOngoing,
    remaining: creditsRoll.remainingTime,
    equalsComposerEnd: creditsRoll.remainingTime === fill.endTime,
  };
  // ⑤ 演出上屏：步进 ~4s（opacity 斜坡 1/120 每帧 → ~2s 满格）后取 canvas 像素
  for (let i = 0; i < 60 * 4; i++) g.fixedUpdate(1 / 60);
  await new Promise((res) => setTimeout(res, 200));
  // ④ 选曲（事件曲即时切——滞回豁免；读位在 4s 窗后=跨过多个 15t 选曲门）
  r.music = { lastMusic: g.lastMusic ?? null };
  const cv = document.querySelector('.sw-credits');
  let nonBlank = -1;
  if (cv) {
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const cx = c2.getContext('2d');
    cx.drawImage(cv, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    nonBlank = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonBlank++;
  }
  r.overlay = {
    present: !!cv,
    nonBlankPixels: nonBlank,
    remainingAfter4s: creditsRoll.remainingTime,
    decreasing: creditsRoll.remainingTime < fill.endTime,
    ongoing: creditsRoll.isEventOngoing,
  };
  return r;
});
console.log(JSON.stringify(out, null, 1));
const ok = (name, v, d) => console.log(`${v ? 'PASS' : 'FAIL'} ${name}${d ? ' :: ' + JSON.stringify(d) : ''}`);
ok('月总召唤+击杀走 bossBlock 击败链', out.bossId === 398 && out.bossDead === true && out.downedFlag === true, { id: out.bossId, dead: out.bossDead, flag: out.downedFlag });
ok('① 触发 IsEventOngoing', out.event?.ongoing === true, out.event);
ok('② remainingTime = composer endTime', out.event?.equalsComposerEnd === true, out.event);
ok('④ 选曲 89 JourneysEnd', out.music?.lastMusic === 89, out.music);
ok('⑤ 演出 overlay 上屏且非空像素', (out.overlay?.nonBlankPixels ?? 0) > 100, out.overlay);
ok('③ remainingTime 随世界 tick 递减', out.overlay?.decreasing === true, { a: out.event?.remaining, b: out.overlay?.remainingAfter4s });
await browser.close();
