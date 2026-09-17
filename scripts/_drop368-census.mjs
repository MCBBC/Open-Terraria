/**
 * _drop368-census.mjs — 旅商死亡掉落实报复现 + 特殊 NPC 掉落族普查探针
 *
 * 用户实报：杀死旅商（368）不掉商贩帽（Peddler's Hat 2222）。
 * 原版锚：Terarria1457/Terraria.GameContent.ItemDropRules/ItemDropDatabase.cs:745
 *   RegisterToNPC(368, ItemDropRule.Common(2222)) —— 100% ×1（chanceDenominator=1）。
 * 本仓链：TownNPC.hurt(:1483 hp<=0) → townNpcDeathDrops(:1519) → resolveDrops
 *   （vanilla-npcdrops.json 368 条目已核在）→ spawnDrop（ITEM_BY_KEY['vi_2222_PeddlersHat']=3225 已核在）。
 *
 * 断言面：
 *   ① 368 击杀 → 掉落含 vid 2222 ×1（6 次重复，期望 6/6——100% 规则）；
 *   ② 掉落族普查（原版 RegisterTownNPCDrops 全 12 注册 + 特殊 NPC 零掉落对照）：
 *      54 布商→260(100%)；22 向导 NamedNPC(Andrew)→867；227 画家 Jim→5290(100%)；
 *      178 蒸汽朋克 Whitney→4372(100%)；353 理发师→3352(1/8)；441 税收官→3351(1/8)；
 *      227 画家→3350(1/8)；550 酒保→3821(1/8)；207 染料商→3349(1/8)；
 *      208 派对女孩→3548(1/4,30-60)；124 机械师→4818(1/8)；663 公主→5065(1/8,困难门)；
 *      453 骷髅商/369 渔夫/37 老人/17 商人/18 护士→无掉落。
 *      概率件按 6× 统计判例取样（1/8 ×48 期望 6 中；P(0 中)≈0.16%）。
 *
 * 运行（并行会话约定，私有实例 5219）：
 *   SW_ORIGIN=http://localhost:5219 node tools/probe.mjs run scripts/_drop368-census.mjs
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump,
  spawnTownNPC, clearEnemies, godMode, ledger,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await pump(page, 30, { clearEnemies: true });

  // 页内击杀+读掉落（named = NamedNPC 具名钉,给定 Lang 全键）
  const killOne = async (key, named = null) => {
    const r = await page.evaluate(async ({ key, named }) => {
      const g = window.__swGame;
      let vidOf = null;
      try { ({ vanillaIdOfItem: vidOf } = await import('/src/stats/Shimmer.ts')); }
      catch (e) { return { ok: false, why: 'shimmer-import:' + e }; }
      const TownNPC = (await import('/src/entities/TownNPC.ts')).TownNPC;
      const { TOWN_NPC_IDS } = await import('/src/data/vanillaNpcs.ts');
      if (!TOWN_NPC_IDS[key]) return { ok: false, why: 'unknown-key:' + key };
      const cx = g.player.cx + 300, foot = g.player.cy + 21;
      const n = new TownNPC(key, cx, foot);
      n.x = cx - n.w / 2;
      n.home = null;
      g.entities.add(n, 'npcs');
      if (named) {
        const { Lang } = await import('/src/i18n/Lang.ts');
        n.givenName = Lang.text(named);
      }
      const before = (g.entities.drops ?? []).filter((d) => !d.dead)
        .map((d) => vidOf(d.itemId));
      n.hurt(99999, 1, 0, g);
      const after = (g.entities.drops ?? []).filter((d) => !d.dead)
        .map((d) => ({ vid: vidOf(d.itemId), n: d.stack }));
      return { ok: true, dead: n.dead, vid: n.vanillaId, name: n.givenName ?? null, before, after };
    }, { key, named });
    return r;
  };

  const sweep = () => clearEnemies(page, { kinds: ['npcs', 'drops', 'projectiles', 'critters', 'enemies'] });

  // ---- ① 368 旅商：6 次 击杀→读掉落（每次清场） ----
  const results368 = [];
  for (let i = 0; i < 6; i++) {
    await sweep();
    const r = await killOne('travelling_merchant');
    results368.push(r);
    await pump(page, 3);
  }
  const hits368 = results368.filter((r) => r.ok && r.dead && r.after.some((d) => d.vid === 2222 && d.n === 1)).length;
  L.chk('368 旅商 → 2222 ×1（6/6,原版 100%）', hits368 === 6,
    `hits=${hits368}/6 samples=${JSON.stringify(results368).slice(0, 400)}`);

  // ---- ② 普查表 ----
  // mode: 'always' 每试必中 / 'rate' trials 内 ≥1 中且无超纲 vid / 'none' 零掉落
  const census = [
    { id: 'clothier(54)',        key: 'clothier',        expect: [260],  trials: 6,  mode: 'always' },
    { id: 'guide22-Andrew(867)', key: 'guide',           named: 'GuideNames.Andrew', expect: [867], trials: 6, mode: 'always' },
    { id: 'painter227-Jim(5290)',key: 'painter',         named: 'PainterNames.Jim',  expect: [5290], trials: 6, mode: 'always' },
    { id: 'steampunker178-Whitney(4372)', key: 'steampunker', named: 'SteampunkerNames.Whitney', expect: [4372], trials: 6, mode: 'always' },
    { id: 'stylist(3352 1/8)',   key: 'stylist',         expect: [3352], trials: 48, mode: 'rate' },
    { id: 'taxcollector(3351 1/8)', key: 'tax_collector', expect: [3351], trials: 48, mode: 'rate' },
    { id: 'painter(3350 1/8)',   key: 'painter',         expect: [3350], trials: 48, mode: 'rate' },
    { id: 'tavernkeep(3821 1/8)',key: 'tavernkeep',      expect: [3821], trials: 48, mode: 'rate' },
    { id: 'dyer(3349 1/8)',      key: 'dyer',            expect: [3349], trials: 48, mode: 'rate' },
    { id: 'partygirl(3548 1/4 30-60)', key: 'party_girl', expect: [3548], trials: 48, mode: 'rate', nMin: 30, nMax: 60 },
    { id: 'mechanic(4818 1/8)',  key: 'mechanic',        expect: [4818], trials: 48, mode: 'rate' },
    { id: 'princess(5065 1/8 困难门)', key: 'princess',  expect: [5065], trials: 48, mode: 'rate' },
    { id: 'skeleton_merchant(453 零掉落)', key: 'skeleton_merchant', expect: [], trials: 12, mode: 'none' },
    { id: 'angler(369 零掉落)',  key: 'angler',          expect: [], trials: 12, mode: 'none' },
    { id: 'old_man(37 零掉落)',  key: 'old_man',         expect: [], trials: 12, mode: 'none' },
    { id: 'merchant(17 零掉落)', key: 'merchant',        expect: [], trials: 12, mode: 'none' },
    { id: 'nurse(18 零掉落)',    key: 'nurse',           expect: [], trials: 12, mode: 'none' },
  ];
  const censusOut = [];
  for (const c of census) {
    let hits = 0; let anyDrop = false; const badVid = []; let badN = 0; const samples = [];
    for (let i = 0; i < c.trials; i++) {
      await sweep();
      const r = await killOne(c.key, c.named ?? null);
      if (!r?.ok) { samples.push({ err: r?.why ?? 'fail' }); continue; }
      const matched = r.after.filter((d) => c.expect.includes(d.vid)
        && (!c.nMin || (d.n >= c.nMin && d.n <= c.nMax)));
      if (matched.length) hits++;
      if (r.after.length) anyDrop = true;
      for (const d of r.after) {
        if (!c.expect.includes(d.vid)) badVid.push(d.vid);
        else if (c.nMin && (d.n < c.nMin || d.n > c.nMax)) badN++;
      }
      if (samples.length < 3) samples.push(r.after);
      await pump(page, 2);
    }
    censusOut.push({ ...c, hits, anyDrop, badVid, badN, samples });
    if (c.mode === 'always') {
      L.chk(`普查 ${c.id} 每试必中`, hits === c.trials, `hits=${hits}/${c.trials} samples=${JSON.stringify(samples)}`);
    } else if (c.mode === 'rate') {
      L.chk(`普查 ${c.id} ≥1 中/${c.trials} 试`, hits >= 1 && badVid.length === 0 && badN === 0,
        `hits=${hits} badVid=${JSON.stringify(badVid)} badN=${badN} samples=${JSON.stringify(samples)}`);
    } else {
      L.chk(`普查 ${c.id} 零掉落`, !anyDrop && badVid.length === 0,
        `anyDrop=${anyDrop} badVid=${JSON.stringify(badVid)} samples=${JSON.stringify(samples)}`);
    }
  }
  console.log('[census]', JSON.stringify(censusOut));
} catch (e) {
  L.fails.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  console.log('[ledger]', JSON.stringify({ fails: L.fails, lines: L.lines, elapsed: L.elapsed() }, null, 1));
  await browser.close();
}
