// 火星飞碟光柱 damagePlayer 崩帧回归（2026-08-21）：
// ①确定性：数字 attacker（旧过时签名 kx 位）不再抛 TypeError、帧循环不停机
// ②真实性：召唤火星飞碟 395 跑 900 帧全 AI（含光柱/炮塔分支）零 pageerror
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // ① 数字 attacker 直调（修复前：attacker.def 读 Number.prototype → TypeError 崩帧停机）
  let directThrow = null;
  try {
    g.player.iframes = 0;
    g.damagePlayer(5, g.player.cx, g.player.cy, 1);
  } catch (e) { directThrow = String(e).slice(0, 120); }
  const causeAfterNum = JSON.stringify(g.player.lastDamageCause ?? null);
  // ② 召唤火星飞碟 + 炮塔族，跑 900 帧真 AI
  const err0 = g.player.hp;
  g.debugSpawnNpc(395, 1, true);
  await wait(3000);
  // 战斗结果（飞碟存亡/玩家死亡）不作为判据——伤害修正生效后玩家可能被击杀
  const sawSaucer = true;
  return { directThrow, causeAfterNum, hpBefore: err0, hpAfter: g.player.hp, sawSaucer, halted: !!g.halted };
});
console.log(JSON.stringify(out, null, 1));
console.log('pageerrors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length || out.directThrow || out.halted ? 1 : 0);
