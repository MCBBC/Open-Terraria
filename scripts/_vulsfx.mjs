// 秃鹫受击音预热探针（2026-08-19 用户报"第一声与后续受击声不一致"）：
// 根因 = NPC_Hit_28 不在 VANILLA_SPAWN_POOLS 预热面 → 首击 playFiles 缓冲在途
// → Game.playSfxFiles 回退 play('hit')（NPC_Hit_1..5 通用闷响）≠ 秃鹫真声 NPCHit28；
// 修复 = Enemy.fromVanilla 生成点注入 sfx.preloadFiles。
// 断言：①生成前 NPC_Hit_28 未载（负对照） ②fromVanilla(61) 触发预热
//       ③等待后缓冲就位 ④首播 playFiles=true 且 Game 层入口不落合成回退
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 540000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
console.log('[probe] start newWorld');
await page.evaluate(() => window.__swFlow.newWorld('', 1200, 400));
console.log('[probe] newWorld returned, waiting __swGame');
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('[probe] game up');
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  // spy 预热调用（Game 闭包运行时取 this.sfx.preloadFiles，实例补丁可见）
  const preCalls = [];
  const origPre = g.sfx.preloadFiles.bind(g.sfx);
  g.sfx.preloadFiles = (files) => { preCalls.push([...files]); return origPre(files); };
  const beforeLoaded = !!g.sfx.buffers.get('NPC_Hit_28');   // 负对照：秃鹫不在池预热面
  const m = await import('/src/entities/Enemy.ts');
  const v = m.Enemy.fromVanilla(61, 300 * 16, 100 * 16);
  const vulPrewarm = preCalls.at(-1) ?? null;
  await new Promise((r2) => setTimeout(r2, 900));            // fetch+decode 窗口
  const hit28 = !!g.sfx.buffers.get('NPC_Hit_28');
  const kill31 = !!g.sfx.buffers.get('NPC_Killed_31');
  // 首播命中真 wav（修复前此处 false → 走 NPC_Hit_1..5 通用回退）
  const firstPlayOk = g.sfx.playFiles(['NPC_Hit_28'], 1);
  // Game 层入口（playEnemyHitSound 同款路径）不落合成/通用回退
  let fallbackFalls = 0;
  const origPlay = g.sfx.play.bind(g.sfx);
  g.sfx.play = (name, ...rest) => { if (name === 'hit') fallbackFalls++; return origPlay(name, ...rest); };
  g.playSfxFiles(['NPC_Hit_28'], 0.9);
  g.sfx.play = origPlay;
  return { beforeLoaded, vulPrewarm, hit28, kill31, firstPlayOk, fallbackFalls, spawned: !!v };
});
console.log(JSON.stringify(r, null, 1));
console.log(r.beforeLoaded === false && r.vulPrewarm && r.vulPrewarm.includes('NPC_Hit_28')
  && r.hit28 && r.kill31 && r.firstPlayOk && r.fallbackFalls === 0
  ? 'PASS: 生成即预热，首击真声无回退' : 'FAIL');
await browser.close();
