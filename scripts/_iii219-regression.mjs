// IIII219 回归探针（非天顶零扰动）：普通种子世界——①毁灭派对不武装不触发
// ②饥饿链全关（Buffs 三态永不入栏）③黄昏跨夜城镇 NPC 生命周期无异常。
// 依据：afterPartyOfDoom 武装位仅在 tenth&&!skyblock&&getGood（Reset 域）；
// 饥饿链总门 = Main.dontStarveWorld（Player.cs:9948/UpdateBuffs）。
// 用法:SW_ORIGIN=http://localhost:5276 node tools/run-diag.mjs scripts/_iii219-regression.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('22114455', 4200, 1200); });   // 固定普通种子
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const { BuffType } = await import('/src/stats/Buffs.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const R = [];
  const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
  const pump = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };
  const has = (t) => g.player.buffs.active.has(t);

  const sf = w.seedFlags ?? {};
  chk('R1a 非天顶：无一切子旗', !sf.everything && !sf.theConstant && !sf.tenthAnniversary && !sf.getGoodWorld && !sf.remix,
    JSON.stringify({ everything: !!sf.everything, theConstant: !!sf.theConstant }));
  chk('R1b afterPartyOfDoom 未武装', w.flags.afterPartyOfDoom !== true);
  chk('R1c 开局派对未置（普通种子无十周年基态）',
    g.partyState.genuineParty === false && g.partyState.daysOnCooldown === 0);
  chk('R1d 饥饿链总门关（dontStarveWorld=false）', g.player.buffs.dontStarveWorld === false
    && g.player.buffs.remixHunger === false);
  pump(120);   // 2s+：UpdateStarvingState 若误开此处必已授 332
  chk('R1e 饥饿三态不入栏', !has(BuffType.NeutralHunger) && !has(BuffType.Hunger) && !has(BuffType.Starving));

  // 向导起始（普通种子兜底 cs:20054）——跨黄昏存活（毁灭清算门不开）
  const guideBefore = g.entities.npcs.filter((n) => n instanceof TownNPC && n.npcKey === 'guide' && !n.dead).length;
  w.clock.timeOfDay = 0.8125 - 0.002;
  pump(150);
  const guideAfter = g.entities.npcs.filter((n) => n instanceof TownNPC && n.npcKey === 'guide' && !n.dead).length;
  chk('R1f 跨黄昏向导存活（清算零触发）', guideBefore >= 1 && guideAfter >= 1,
    `before=${guideBefore} after=${guideAfter}`);
  chk('R1g 黄昏后 afterPartyOfDoom 仍未武装', w.flags.afterPartyOfDoom !== true);
  return R;
});

console.log(out.join('\n'));
const fails = out.filter((l) => l.startsWith('FAIL'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 10).join('\n'));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
