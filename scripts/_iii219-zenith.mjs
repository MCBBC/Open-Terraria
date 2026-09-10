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
// 环境控制：探针自建石盒庇护所（隔怪/黑暗）+ 手持火把——zenith 含 constant 黑暗
//   伤害（DontStarveDarkness 120t 蓄力 250 伤）会污染饥饿断言，持火保证光照安全。
// ★IIIII236 迁移版:引导/直桥建世界(getfixedboi)/庇护所/持火/断言台账收敛到统一框架
//   (tools/probe/lib);行为等价=P1/P2/H1×12/P3 断言逐条保持(原文备份 /tmp/iii236-out/originals/)。
//   断言体内部保留页内分段泵(≤30t+黑暗复位+清敌)——与框架 pump(resetDarkness,
//   clearEnemies) 同一 tick 语义,见 docs/methodology/probe-guide.md §D3/D4。
// 用法①: node tools/probe.mjs run scripts/_iii219-zenith.mjs --seed=zenith --size=small
// 用法②: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_iii219-zenith.mjs
import { launchBrowser, openPage, bootstrap, createGame, buildShelter, holdItem, ledger } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const L = ledger({ failExit: 2 });
const pageErrors = [];   // 页错误只上报不判死(与原探针口径一致)
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: pageErrors });
  const boot = await bootstrap(page, ORIGIN);
  L.chk('bootstrap(导航+清IDB+ack)', boot.ok, boot.why ?? '');
  if (boot.ok) {
    const gen = await createGame(page, {
      mode: 'direct', seed: 'getfixedboi', size: process.env.SW_SIZE || 'small',
    });
    L.chk('createGame(直桥 getfixedboi 天顶世界)', gen.ok, gen.why ?? '');
    if (gen.ok) {
      // ── 庇护所:spawn 带两侧各 12 格清空+石底/石顶/石壁/火把排+玩家居中(框架夹具,
      //    几何与原探针逐格同构:top=6/floor=3/halfW=12/torchStep=4)──
      const sh = await buildShelter(page, { halfW: 12, top: 6, floor: 3 });
      L.say(`shelter @ (${sh.sx},${sh.sy})`);
      // 手持火把（光照双保险,vid 8=火把）
      L.chk('持火(vid 8→内部 id)', await holdItem(page, 8) === true);
      await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__swGame.fixedUpdate(1 / 60); window.__swGame.entities.enemies.length = 0; window.__swGame.entities.projectiles.length = 0; });

      const out = await page.evaluate(async () => {
        const g = window.__swGame;
        const w = g.world;
        const st = w.store;
        const { BuffType } = await import('/src/stats/Buffs.ts');
        const { TownNPC } = await import('/src/entities/TownNPC.ts');
        const R = [];
        const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
        // 泵：分段——每 ≤30t 复位黑暗计时器（zenith 含 constant 黑暗 250 伤必死,会冻结饥饿链
        // 污染断言;headless 光照缓冲滞后,持火/火把不足以保证 safe）+ 清敌怪
        const pump = (n) => {
          let done = 0;
          while (done < n) {
            const step = Math.min(30, n - done);
            g.dontStarveDarkness.reset();
            g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
            for (let i = 0; i < step; i++) g.fixedUpdate(1 / 60);
            done += step;
          }
        };
        const has = (t) => g.player.buffs.active.has(t);
        const left = (t) => g.player.buffs.active.get(t);
        const keyOf = (k) => g.entities.npcs.filter((n) => n instanceof TownNPC && n.npcKey === k);
        const aliveOf = (k) => keyOf(k).filter((n) => !n.dead).length;
        const clearEnemies = () => { g.entities.enemies.length = 0; g.entities.projectiles.length = 0; };
        const torchId = window.__swFlow.itemByVid(8);
        const sxT = Math.floor(g.player.cx / 16), syT = Math.floor(g.player.cy / 16);

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
        const starters = ['tax_collector', 'steampunker', 'princess', 'painter', 'town_slime_diva'];
        const stAlive = starters.map((k) => ({ k, n: aliveOf(k) }));
        chk('P2a 天顶起始镇民五员在场且活', stAlive.every((s) => s.n === 1), JSON.stringify(stAlive));
        chk('P2b 首位=税务员 441（remix 臂 cs:19869）', keyOf('tax_collector')[0]?.vanillaId === 441);
        chk('P2c savedTaxCollector 置位（cs:19870）', w.flags.savedTaxCollector === true);

        // ── H1 饥饿链（玩家持火把防黑暗污染）──
        chk('H1a 饥饿链上下文注入（theConstant+remix）',
          g.player.buffs.dontStarveWorld === true && g.player.buffs.remixHunger === true,
          `ds=${g.player.buffs.dontStarveWorld} remix=${g.player.buffs.remixHunger}`);
        pump(30);
        chk('H1b 无 fed-state → 332 授予（UpdateStarvingState）', has(BuffType.NeutralHunger),
          `left=${left(BuffType.NeutralHunger)?.toFixed(1)}s`);
        const baseDef = g.player.defense, hp0 = g.player.hp;   // 332 无数值效果 → 此读=基础防
        // 快进：332 ≤2t → 333（28800t=480s remix 档）
        g.player.buffs.set(BuffType.NeutralHunger, 0.04); pump(2);
        chk('H1c 332≤2t → 333 饥饿（remix 480s 档）', has(BuffType.Hunger) && Math.abs(left(BuffType.Hunger) - 480) < 2,
          `left=${left(BuffType.Hunger)?.toFixed(1)}s`);
        g.player.buffs.set(BuffType.Hunger, 0.04); pump(2);
        chk('H1d 333≤2t → 334 极饿（恒 5t）', has(BuffType.Starving) && left(BuffType.Starving) <= 5 / 60 + 1e-9);
        // ★毛刺语义定谳（:12186-12238 + AddBuff IsFedState 换档 :5269）：334 无自持重钉,
        //   5t 到期 → UpdateStarvingState 重授 332——极饿是周期性毛刺,非持续态
        pump(12);
        chk('H1e 334 毛刺到期 → 链回 332（循环闭合）', !has(BuffType.Starving) && has(BuffType.NeutralHunger)
          && left(BuffType.NeutralHunger) > 470,
          `334=${has(BuffType.Starving)} 332=${left(BuffType.NeutralHunger)?.toFixed(0)}s`);
        // 极饿 stat 惩罚（:11584-11595 防-4）——毛刺内读（人为续钉保 334 在栏）
        g.player.buffs.set(BuffType.Starving, 0.55); pump(5);
        chk('H1f 极饿防-4（ResetEffects 位）', g.player.defense === baseDef - 4, `def ${baseDef}→${g.player.defense}`);
        // 极饿流干接线验证（:19458-19477）：续钉 334（= vanilla lifeRegenCount 深负流干态）,
        //   100hp → num12=2 HP 每 60t 一跳；先剥 334 清流干账（毛刺间回收 :19382/:19398 的
        //   本仓同构),再走链到 334 净账起算——180t 恰两跳 −4
        g.player.buffs.remove(BuffType.Starving); pump(2);      // 离栏清账 + 332 重授
        g.player.buffs.set(BuffType.NeutralHunger, 0.04); pump(2);
        g.player.buffs.set(BuffType.Hunger, 0.04); pump(2);     // → 334（净账）
        g.player.hp = g.player.maxHp;
        const hpHold0 = g.player.hp;
        for (let c = 0; c < 6; c++) { g.player.buffs.set(BuffType.Starving, 0.55); pump(30); }
        chk('H1e2 持续极饿流干 180t → 恰三跳 −6（num12=2 HP/60t,vanilla −4/t×180t=−720/240 同构）',
          Math.abs((hpHold0 - g.player.hp) - 6) < 0.6 && !g.player.dead,
          `hp ${hpHold0}→${g.player.hp}`);
        // 食物喂饱：26/206/207 任一 → 三态剥离（IsFedState :5080-5089）
        g.player.hp = g.player.maxHp;
        g.player.buffs.apply(BuffType.WellFed, 60);
        chk('H1g 喂饱剥 334（IsFedState 换档）', !has(BuffType.Starving) && !has(BuffType.Hunger) && has(BuffType.WellFed));
        pump(5);
        chk('H1h fed 在栏不再授 332', !has(BuffType.NeutralHunger));
        // fed 到期 → 链重启（UpdateStarvingState 再授 332）
        g.player.buffs.set(BuffType.WellFed, 0.04); pump(5);
        chk('H1i fed 到期 → 332 重授', has(BuffType.NeutralHunger));
        // 蘑菇 5 端到端：333 在栏 → 吃蘑菇 → TryToResetHungerToNeutral（:52513）→ 链回 332 满档
        g.player.buffs.set(BuffType.NeutralHunger, 0.04); pump(2);   // → 333
        const mushroomId = window.__swFlow.itemByVid(5);
        g.player.inv.slots[0] = { id: mushroomId, stack: 3 };
        g.player.inv.selected = 0;
        const scr = g.camera.worldToScreen(g.player.cx, g.player.cy);
        g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x; g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
        for (let i = 0; i < 60; i++) { g.input.mouseDown = true; g.input.mouseHeld = true; g.fixedUpdate(1 / 60); }
        g.input.mouseDown = false; g.input.mouseHeld = false;
        const ateMushroom = (g.player.inv.slots[0]?.stack ?? 0) < 3;
        chk('H1j 蘑菇重置：333 摘除、链回 332 满档（TryToResetHungerToNeutral）',
          ateMushroom && !has(BuffType.Hunger) && !has(BuffType.Starving) && has(BuffType.NeutralHunger)
            && left(BuffType.NeutralHunger) > 470,
          `ate=${ateMushroom} 332=${left(BuffType.NeutralHunger)?.toFixed(0)}s`);
        chk('H1k 蘑菇药水病（mushroomDelay 1800t=30s）', has(BuffType.Resistance)
          && Math.abs(left(BuffType.Resistance) - 30) < 3, `left=${left(BuffType.Resistance)?.toFixed(1)}s`);
        // 极饿致死（ByOther(18)）——续钉 334 + 血量压到 5 泵到死；期间持火把防黑暗抢死因
        g.player.buffs.remove(BuffType.NeutralHunger);
        g.player.inv.slots[0] = { id: torchId, stack: 1 };
        g.player.hp = 5; g.player.iframes = 0;
        clearEnemies();
        let died = false;
        for (let c = 0; c < 12 && !died; c++) { g.player.buffs.set(BuffType.Starving, 0.55); pump(30); died = g.player.dead === true; }
        chk('H1l 极饿致死 + 死因 starved（ByOther(18)）',
          died && g.player.lastDamageCause?.kind === 'starved',
          `dead=${g.player.dead} cause=${JSON.stringify(g.player.lastDamageCause)}`);

        // ── P3 毁灭清算 ──
        // 豁免五型在场证人（NPCID.cs：37/453/368/680/20）
        const exemptKeys = ['dryad', 'old_man', 'travelling_merchant', 'town_slime_clumsy', 'skeleton_merchant'];
        exemptKeys.forEach((k, i) => { g.entities.add(new TownNPC(k, (sxT - 8 + i * 4) * 16, (syT - 2) * 16), 'npcs'); });
        pump(30);   // 站稳
        clearEnemies();
        const exemptBefore = exemptKeys.map((k) => aliveOf(k));
        const startersBefore = starters.map((k) => aliveOf(k));
        chk('P3a 豁免证人五员就位+起始镇民尚活（清算前基线）',
          exemptBefore.every((n) => n >= 1) && startersBefore.every((n) => n >= 1),
          `exempt=${JSON.stringify(exemptBefore)} starters=${JSON.stringify(startersBefore)}`);
        // 快进到黄昏（DUSK=0.8125）——直接跳过界线（crossed 检测 pt<a≤ct,同拍兑现
        // CheckNight + 同拍毁灭清算——本仓 doom 块位于昼夜事件块之后）
        w.clock.timeOfDay = 0.8125 + 0.001;
        pump(30);
        chk('P3b 派对散场（CheckNight cs:40-53）',
          g.partyState.genuineParty === false && g.partyState.manualParty === false);
        chk('P3c afterPartyOfDoom 卸武装（:18127）', w.flags.afterPartyOfDoom === false);
        const after = starters.map((k) => ({ k, alive: aliveOf(k) }));
        chk('P3d 天顶起始镇民五员全灭（含税务员——vanilla 豁免表无 441）',
          after.every((s) => s.alive === 0), JSON.stringify(after));
        const exemptAfter = exemptKeys.map((k) => aliveOf(k));
        chk('P3e 豁免五型幸存（37/453/368/680/20）', exemptAfter.every((n) => n >= 1), JSON.stringify(exemptAfter));
        chk('P3f 六旗复位（:18121-18126）——公主/彩虹史莱姆解锁清退',
          w.flags.unlockedPrincessSpawn === false && w.flags.unlockedSlimeRainbowSpawn === false
          && w.flags.savedMech === false && w.flags.unlockedPartyGirlSpawn === false
          && w.flags.unlockedSlimeGreenSpawn === false && w.flags.boughtBunny === false);
        chk('P3g savedTaxCollector 不在复位表（vanilla 无此臂）', w.flags.savedTaxCollector === true);
        return R;
      });

      // 台账收口(原探针 PASS/FAIL 行语义逐条保留)
      for (const line of out) {
        const m = line.match(/^(PASS|FAIL): (.+?)(?:\s{2}(.*)|)$/s);
        if (m) L.chk(m[2].trim(), m[1] === 'PASS', m[3] ?? '');
        else L.say(line);
      }
    }
  }
  if (pageErrors.length) L.say(`pageErrors(前10):\n` + pageErrors.slice(0, 10).join('\n'));
} catch (e) {
  L.chk('framework', false, String(e?.message ?? e));
} finally {
  await browser.close();
}
process.exit(L.exitCode());
