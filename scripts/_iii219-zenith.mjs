// IIII219 探针（天顶运行时机制）：①开局派对 + 毁灭派对清算 ②饥饿链三态/极饿掉血/
// 食物喂饱/蘑菇重置。断言依据 = 反编译静态期望（Terarria1458）：
//   P1 武装位  ：WorldGen.cs:11157-11164 Reset 域——tenth&&!skyblock → GenuineParty=
//                 true+PartyDaysOnCooldown=5；getGood 嵌套臂 → afterPartyOfDoom=true。
//                 天顶=getfixedboi 七依赖全置（WorldSeedOption_Everything.cs:16-34）。
//   P2 起始镇民：WorldGen.cs:19852-19987 十周年主支——zenith(tenth∧remix) 首位=
//                 税务员 441 "Andrew"(savedTaxCollector) / @+2 蒸汽朋克 178 /
//                 @−2 公主 663 / @+4 drunk→画家 227 / @−4 remix→彩虹史莱姆 681。
//   P3 毁灭清算：Main.cs:18109-18126 UpdateNPCs——afterPartyOfDoom && !PartyIsUp →
//                 在场 townNPC 且 type∉{37,453,368,680,20} → StrikeNPCNoInteraction
//                 (9999,10f,-direction)；六旗复位 savedMech/unlockedPartyGirl/
//                 unlockedPrincess/unlockedSlimeRainbow/unlockedSlimeGreen/boughtBunny
//                 （★441 税务员不在豁免表——三基线 1456:17764/1457:18114/1458:18114 同构）。
//   H1 饥饿链  ：Player.cs:11743-11768 UpdateStarvingState（无 fed-state → 332，
//                 remix×constant=28800t）→ UpdateHungerBuffs :11686-11741（332≤2t→333、
//                 333≤2t→334 5t+Hungry 音）；:19255/:19458-19477 极饿流干 statLifeMax2/50
//                 （沙漠/雪原 ×2）死因 ByOther(18)；:5080-5089 IsFedState 换档；
//                 :52507/:52513 蘑菇 5/蛋奶酒 1912 → TryToResetHungerToNeutral。
// 用法:SW_ORIGIN=http://localhost:5276 node tools/run-diag.mjs scripts/_iii219-zenith.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// 直桥建天顶世界（小尺寸压耗时）
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('getfixedboi', 4200, 1200); });
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
  const left = (t) => g.player.buffs.active.get(t);
  const aliveKeys = () => g.entities.npcs.filter((n) => n instanceof TownNPC && !n.dead).map((n) => n.npcKey);
  const keyOf = (k) => g.entities.npcs.filter((n) => n instanceof TownNPC && n.npcKey === k);

  // ── P1 武装位 ──
  const sf = w.seedFlags ?? {};
  chk('P1a zenith 七依赖旗全置', !!(sf.everything && sf.theConstant && sf.tenthAnniversary
    && sf.getGoodWorld && sf.remix && sf.drunkWorld && sf.notTheBees && sf.noTraps),
    JSON.stringify({ everything: !!sf.everything, theConstant: !!sf.theConstant, tenth: !!sf.tenthAnniversary, ftw: !!sf.getGoodWorld, remix: !!sf.remix }));
  chk('P1b 开局派对基态（Reset 域 cs:11158-11159）',
    g.partyState.genuineParty === true && g.partyState.daysOnCooldown === 5,
    `genuine=${g.partyState.genuineParty} cd=${g.partyState.daysOnCooldown}`);
  chk('P1c CelebratingNPCs=五名 seed 镇民', g.partyState.celebratingNpcs.length === 5,
    `n=${g.partyState.celebratingNpcs.length}`);
  chk('P1d afterPartyOfDoom 武装（cs:11162）', w.flags.afterPartyOfDoom === true);

  // ── P2 起始镇民 ──
  pump(30);
  const starters = ['tax_collector', 'steampunker', 'princess', 'painter', 'town_slime_diva'];
  const stAlive = starters.map((k) => ({ k, n: keyOf(k).filter((n) => !n.dead).length }));
  chk('P2a 天顶起始镇民五员在场且活', stAlive.every((s) => s.n === 1), JSON.stringify(stAlive));
  chk('P2b 首位=税务员 441（remix 臂 cs:19869）', keyOf('tax_collector')[0]?.vanillaId === 441);
  chk('P2c savedTaxCollector 置位（cs:19870）', w.flags.savedTaxCollector === true);

  // ── H1 饥饿链 ──
  chk('H1a 饥饿链上下文注入（theConstant+remix）',
    g.player.buffs.dontStarveWorld === true && g.player.buffs.remixHunger === true,
    `ds=${g.player.buffs.dontStarveWorld} remix=${g.player.buffs.remixHunger}`);
  chk('H1b 无 fed-state → 332 授予（UpdateStarvingState）', has(BuffType.NeutralHunger),
    `left=${left(BuffType.NeutralHunger)?.toFixed(1)}s`);
  // 快进：332 ≤2t → 333（28800t=480s remix 档）
  g.player.buffs.set(BuffType.NeutralHunger, 0.04); pump(2);
  chk('H1c 332≤2t → 333 饥饿（remix 480s 档）', has(BuffType.Hunger) && Math.abs(left(BuffType.Hunger) - 480) < 2,
    `left=${left(BuffType.Hunger)?.toFixed(1)}s`);
  const d0 = g.player.defense, hp0 = g.player.hp;
  g.player.buffs.set(BuffType.Hunger, 0.04); pump(2);
  chk('H1d 333≤2t → 334 极饿（恒 5t）', has(BuffType.Starving) && left(BuffType.Starving) <= 5 / 60 + 1e-9);
  // 极饿流干：num2=max(4,120·maxHp/3000)/2 HP/s；100hp → 2HP/s，3s 内必掉 ≥4
  pump(180);
  chk('H1e 极饿掉血（:19458 流干链）', g.player.hp < hp0, `hp ${hp0}→${g.player.hp}`);
  // 极饿 stat 惩罚（:11584-11595 防-4）
  chk('H1f 极饿防-4（ResetEffects 位）', g.player.defense === d0 - 4, `def ${d0}→${g.player.defense}`);
  // 食物喂饱：26/206/207 任一 → 三态剥离（IsFedState :5080-5089）
  g.player.hp = g.player.maxHp;
  g.player.buffs.apply(BuffType.WellFed, 60);
  chk('H1g 喂饱剥 334（IsFedState 换档）', !has(BuffType.Starving) && !has(BuffType.Hunger) && has(BuffType.WellFed));
  pump(5);
  chk('H1h fed 在栏不再授 332', !has(BuffType.NeutralHunger));
  // fed 到期 → 链重启（UpdateStarvingState 再授 332）
  g.player.buffs.set(BuffType.WellFed, 0.04); pump(3);
  chk('H1i fed 到期 → 332 重授', has(BuffType.NeutralHunger));
  // 蘑菇 5 端到端：333 在栏 → 吃蘑菇 → TryToResetHungerToNeutral（:52513）→ 333/334 摘除
  g.player.buffs.set(BuffType.NeutralHunger, 0.04); pump(2);   // → 333
  const mushroomId = window.__swFlow.itemByVid(5);
  g.player.inv.slots[0] = { id: mushroomId, stack: 3 };
  g.player.inv.selected = 0;
  const sx = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx[0] ?? sx.x ?? 0; g.input.mouseY = sx[1] ?? sx.y ?? 0;
  for (let i = 0; i < 60; i++) { g.input.mouseDown = true; g.input.mouseHeld = true; g.fixedUpdate(1 / 60); }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const ateMushroom = (g.player.inv.slots[0]?.stack ?? 0) < 3 || g.player.inv.slots[0]?.id !== mushroomId;
  chk('H1j 蘑菇重置：333 摘除、链回 332 满档（TryToResetHungerToNeutral）',
    ateMushroom && !has(BuffType.Hunger) && !has(BuffType.Starving) && has(BuffType.NeutralHunger)
      && left(BuffType.NeutralHunger) > 470,
    `ate=${ateMushroom} 332=${left(BuffType.NeutralHunger)?.toFixed(0)}s`);
  chk('H1k 蘑菇药水病（mushroomDelay 1800t=30s）', has(BuffType.Resistance)
    && Math.abs(left(BuffType.Resistance) - 30) < 2, `left=${left(BuffType.Resistance)?.toFixed(1)}s`);
  // 极饿致死（ByOther(18)）——血量压到 5 泵到死
  g.player.buffs.remove(BuffType.NeutralHunger);
  g.player.buffs.set(BuffType.Hunger, 0.04); pump(2);          // → 334
  g.player.hp = 5; g.player.iframes = 0;
  let died = false;
  for (let i = 0; i < 900 && !died; i++) { pump(1); died = g.player.dead === true; }
  chk('H1l 极饿致死 + 死因 starved（ByOther(18)）',
    died && g.player.lastDamageCause?.kind === 'starved',
    `dead=${g.player.dead} cause=${JSON.stringify(g.player.lastDamageCause)}`);
  pump(10);   // 复活窗口避开（重生前读态即可,后续断言只看 NPC）
  if (g.player.dead) { try { g.respawnPlayer?.(); } catch { /* 死亡态不阻塞 NPC 断言 */ } }

  // ── P3 毁灭清算 ──
  // 豁免五型在场证人（NPCID.cs：37/453/368/680/20）
  const exemptKeys = ['dryad', 'old_man', 'travelling_merchant', 'town_slime_clumsy', 'skeleton_merchant'];
  const px = g.player.x, py = g.player.y - 48;
  exemptKeys.forEach((k, i) => { g.entities.add(new TownNPC(k, px + (i - 2) * 40, py), 'npcs'); });
  pump(30);   // 站稳
  const exemptBefore = exemptKeys.map((k) => keyOf(k).filter((n) => !n.dead).length);
  chk('P3a 豁免证人五员就位', exemptBefore.every((n) => n >= 1), JSON.stringify(exemptBefore));
  // 快进到黄昏（DUSK=0.8125）
  w.clock.timeOfDay = 0.8125 - 0.002;
  pump(120);
  chk('P3b 派对散场（CheckNight cs:40-53）',
    g.partyState.genuineParty === false && g.partyState.manualParty === false);
  chk('P3c afterPartyOfDoom 卸武装（:18127）', w.flags.afterPartyOfDoom === false);
  const after = starters.map((k) => ({ k, alive: keyOf(k).filter((n) => !n.dead).length }));
  chk('P3d 天顶起始镇民五员全灭（含税务员——vanilla 豁免表无 441）',
    after.every((s) => s.alive === 0), JSON.stringify(after));
  const exemptAfter = exemptKeys.map((k) => keyOf(k).filter((n) => !n.dead).length);
  chk('P3e 豁免五型幸存（37/453/368/680/20）', exemptAfter.every((n) => n >= 1), JSON.stringify(exemptAfter));
  chk('P3f 六旗复位（:18121-18126）——公主/彩虹史莱姆解锁清退',
    w.flags.unlockedPrincessSpawn === false && w.flags.unlockedSlimeRainbowSpawn === false
    && w.flags.savedMech === false && w.flags.unlockedPartyGirlSpawn === false
    && w.flags.unlockedSlimeGreenSpawn === false && w.flags.boughtBunny === false);
  chk('P3g savedTaxCollector 不在复位表（vanilla 无此臂）', w.flags.savedTaxCollector === true);
  return R;
});

console.log(out.join('\n'));
const fails = out.filter((l) => l.startsWith('FAIL'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 10).join('\n'));
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
