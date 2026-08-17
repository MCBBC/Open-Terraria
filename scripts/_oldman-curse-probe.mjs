// 老人诅咒链 e2e（用户报"老人变成 Boss 后没有消失"根因验证）：
//  ① 夜晚诅咒 → 老人当帧消失 + 骷髅王 35 召出（原版：SpawnSkeletron 置老人
//     ai[3]=1 → 下一 AI tick life=-1 自灭，NPC.cs:53743-53756/:81243）
//  ② 击败骷髅王 → downed_35 置位 → 老人绝不在场/不重生（原版老人 AI 每帧
//     downedBoss3 → 自灭 :53754-53760；此前本仓杀王同帧在门口复活老人）
//  ③ 骷髅王黎明逃逸（未击败）→ 老人重新出现（原版语义）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('老人链');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = { steps: [] };
  const ok = (name, cond) => { out.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}`); return cond; };
  const oldMen = () => g.entities.npcs.filter((n) => n.npcKey === 'old_man' && !n.dead);
  try {
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    // ---- 前置：传送到地牢门口，确保老人在场 + 入夜 ----
    g.player.x = g.world.dungeonX * 16; g.player.y = (g.world.dungeonY - 6) * 16;
    if (oldMen().length === 0) {
      const om = new TownNPC('old_man', g.player.x + 40, g.player.y);
      om.home = { x: Math.floor((g.player.x + 40) / 16), y: Math.floor((g.player.y + 2) / 16) };
      g.entities.add(om, 'npcs');
    }
    g.world.clock.timeOfDay = 0;    // 深夜（诅咒需夜间）
    for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
    ok('前置：门口老人在场', oldMen().length === 1);
    const om0 = oldMen()[0];
    ok('前置：骷髅王未击败', !g.world.flags.downedSkeletron && !g.world.flags['downed_35']);
    // ---- ① 诅咒 ----
    g.openNpcDialog?.call(g, om0) ?? (() => { g.dialogNpc = om0; })();
    g.npcDialogButton('curse');
    for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
    ok('① 诅咒后老人当帧消失', oldMen().length === 0);
    const sk = g.entities.enemies.find((e) => e.vanillaId === 35 && !e.dead);
    ok('① 骷髅王 35 召出', !!sk);
    // ---- ② 击败骷髅王（真实击杀链：hurt → dead → onEnemyKilled → boss 记账）----
    if (sk) {
      sk.iframes = 0;
      const dmgOk = sk.hurt(9999999, 0, 0, g);
      for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
      ok('② 真伤击杀成立', dmgOk && sk.dead);
      ok('② 击败记账 downed_35', !!g.world.flags['downed_35']);
      // 杀王同帧/其后老人不得复活（旧 bug：boss 结束块单键门 → 立即重建老人）
      for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
      ok('② 杀王后老人不复活', oldMen().length === 0);
    }
    // ---- ③ 读档门（同助手）：写旧键 downedSkeletron 的存档同样关门 ----
    g.world.flags.downedSkeletron = true; g.world.flags['downed_35'] = false;
    g.maybeRespawnOldMan?.call(g);
    ok('③ 旧键 downedSkeletron 同样关门', oldMen().length === 0);
    g.world.flags.downedSkeletron = false;
    // ---- ④ 对照：未击败 + 王离场 → 老人重新出现（原版语义仍保留）----
    g.world.flags['downed_35'] = false; g.boss = null;
    const g2 = oldMen().length;
    g.maybeRespawnOldMan?.call(g);
    ok('④ 未击败时重生语义保留', g2 === 0 && oldMen().length >= 1);
  } catch (err) { out.steps.push('ERR ' + String(err && err.stack || err)); }
  return out;
});

for (const s of res.steps) console.log(s.replace(/^(\w+) (.*)$/, (_, t, n) => `${t}: ${n}`));
check('页面零 JS 错误', errs.length === 0, errs.join(' | '));
const fails = res.steps.filter((s) => s.startsWith('FAIL') || s.startsWith('ERR'));
check('全链 8 断言', fails.length === 0, fails.join(' ; '));
await browser.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
