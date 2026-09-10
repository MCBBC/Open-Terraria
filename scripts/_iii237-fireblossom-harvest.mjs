/**
 * _iii237-fireblossom-harvest.mjs — 火焰花(style5)采收时辰门探针(IIIII237)
 *
 * 玩家报告:夜 20:00 地下成熟火焰花仍可采收且掉种子(原版天黑不可收)。
 *
 * vanilla 锚(Terarria1458/Terraria/WorldGen.cs):
 *   :66646 IsHarvestableHerbWithSeed(82=false / 83=时辰门 / 84=恒真)
 *   :66671 IsAlchemyPlantHarvestable — style5(:66689-66700) =
 *     (!Main.raining | y>Main.worldSurface) && Main.time > 40500.0
 *     Main.time 是【分段昼内 ticks】(昼 0..54000/夜 0..32400) → 40500 ⟺ 昼 15:45,
 *     窗=昼 15:45→19:30;夜里 Main.time∈[0,32400) 恒 ≤40500 → 夜不可收。
 * 我方锚(game/src/core/Game.ts):
 *   :19926 isAlchemyPlantHarvestable(:19940 曾写 `c.timeOfDay > 15.75/24` 裸钟面直比,
 *     缺昼段门 → 夜 19:30-24:00 段(钟面 0.8125→1.0)全误开)。
 *   消费面:右键采收门 :24881(interactAt) / 破坏掉种门 :20897(breakTile) /
 *     演化域 :6442→WorldEvolution.ts:566。
 *
 * 断言面(=修复后正确语义;修复前 B 段红=玩家症状复现):
 *   B 夜 20:00 右键采收→拒(格在+零掉落);破坏→草药掉、种子零
 *   C 昼窗 16:30 右键采收→收下(格消+草药+种子)
 *   D 正午 12:00 拒(昼但窗未开——防"恒开"假绿)
 *   E 凌晨 02:00 拒(夜的另一段)
 *   F 84 开花态 @ 夜 20:00 →可收+种子(84 恒开守恒,防过修)
 *
 * IIII238 框架收编回归(④freezeClock+③分步计时):
 *   - 时辰钉法从「页内裸赋 clock.timeOfDay」换为框架夹具 freezeClock(page,{tod})
 *     ——钉+冻结一体,pump/真实帧期间钟面不走(自证段:pump 60t 钟面纹丝不动);
 *   - 每个场景 case 套 L.step(▶ 起始/◀ 耗时行),轮询窗可见进度;
 *   - 全部 case 完成后 unfreezeClock,断言钟面回滚冻结前值(夹具"像没发生过"语义)。
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump, ledger, teleport, itemByVid,
  freezeClock, unfreezeClock, clockInfo,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await pump(page, 30, { clearEnemies: true });

  // ── IIII238 ④:时钟冻结夹具——钉夜 20:00 并冻结(此前手工裸赋 timeOfDay,
  //    pump/真实帧期间钟面缓走 24min 周期;冻结后时辰窗断言不漂)
  const clock0 = await clockInfo(page);
  L.say(`钟面基准 tod=${clock0.tod.toFixed(6)} isDay=${clock0.isDay} vanillaMainTime=${clock0.vanillaMainTime} frozen=${clock0.frozen}`);
  const fz = await freezeClock(page, { tod: 20 / 24 });
  L.chk('freezeClock 钉钟 20:00+冻结生效', fz.ok && fz.tod === 20 / 24 && fz.isDay === false,
    `tod=${fz.tod} isDay=${fz.isDay}`);
  const fp = await pump(page, 60, { clearEnemies: true });
  const fa = await clockInfo(page);
  L.chk('freezeClock 自证:pump 60t 钟面纹丝不动', fp.ticks === 60 && fa.frozen && fa.tod === 20 / 24,
    `ticks=${fp.ticks} frozen=${fa.frozen} tod=${fa.tod}`);

  // ── 场景:地下带(groundLevel+60,避地狱 h-300),清带+灰烬底+成熟火焰花(style5 frameX=90)
  const scene = await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store;
    const T83 = window.__swTiles['v_83_herbs_mature'];
    const ASH = window.__swTiles['ash'];
    const gl = g.world.groundLevel || 0;
    const x = Math.min(300, st.w - 40);
    const y = Math.min(Math.floor(gl) + 60, st.h - 300);
    for (let yy = y - 4; yy <= y + 5; yy++) {
      for (let xx = x - 8; xx <= x + 8; xx++) {
        if (xx < 1 || yy < 1 || xx >= st.w - 1 || yy >= st.h - 1) continue;
        const i = st.idx(xx, yy);
        st.setTile(xx, yy, 0, 0, 0);
        st.liquid[i] = 0; st.wire[i] = 0; st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0;
      }
    }
    for (let xx = x - 6; xx <= x + 6; xx++) st.setTile(xx, y + 2, ASH, 0, 0);
    st.setTile(x, y + 1, T83, 90, 0);   // style5 火焰花(frameX=90),frameY=0 同原版 CheckAlch
    return {
      x, y: y + 1, gl, T83, T84: window.__swTiles['v_84_herbs_bloom'], ASH,
      isDay: g.world.clock.isDay, tod: g.world.clock.timeOfDay,
      gateAt8pm: g.isAlchemyPlantHarvestable(5, y + 1),
    };
  });
  L.chk('场景 underground(sect.y>groundLevel)', scene.y > scene.gl,
    `y=${scene.y} gl=${scene.gl}`);
  L.say(`场景 (x=${scene.x},y=${scene.y}) groundLevel=${scene.gl} T83=${scene.T83} gate(5,y)@当前时=${scene.gateAt8pm}`);

  await teleport(page, scene.x * 16 + 8, (scene.y - 3) * 16, { snapCamera: true });
  await pump(page, 4, { clearEnemies: true });

  const HERB_VID = 318, SEED_VID = 312;
  const herbId = await itemByVid(page, HERB_VID);
  const seedId = await itemByVid(page, SEED_VID);
  L.chk('vid 反查(318 火焰花/312 种子)', herbId > 0 && seedId > 0, `herb=${herbId} seed=${seedId}`);

  // 单例直接驱动,无 ?t= 击穿纪律(A4):__swGame 是引擎正消费的活实例
  async function runCase(name, { tid, fx = 90, todFrac, mode }) {
    return L.step(name, async () => {
      await freezeClock(page, { tod: todFrac });        // ④ 钉时辰+冻结(重复 freeze=改钉)
      const r = await page.evaluate(({ x, y, tid, fx, mode, herbId, seedId }) => {
        const g = window.__swGame, st = g.world.store;
        st.setTile(x, y, tid, fx, 0);                     // 重铺花
        g.entities.drops.forEach((d) => { d.dead = true; }); // 清掉落桶(防跨案污染)
        const gate = g.isAlchemyPlantHarvestable(Math.floor(st.frameX[st.idx(x, y)] / 18), y);
        if (mode === 'interact') g.interactAt(x, y);      // 右键采收门(:24870 分支)
        else g.breakTile(x, y, true);                     // 破坏掉种门(:20897 分支)
        const drops = g.entities.drops.filter((d) => !d.dead);
        const cnt = (id) => drops.filter((d) => d.itemId === id).reduce((a, d) => a + d.stack, 0);
        return {
          gate, tileGone: st.get(x, y) === 0 || !st.hasTile(x, y),
          herb: cnt(herbId), seeds: cnt(seedId), total: drops.length,
          isDay: g.world.clock.isDay,
          tod: g.world.clock.timeOfDay,
        };
      }, { x: scene.x, y: scene.y, tid, fx, mode, herbId, seedId });
      L.say(`${name}: gate=${r.gate} isDay=${r.isDay} tod=${r.tod.toFixed(4)} tileGone=${r.tileGone} herb=${r.herb} seeds=${r.seeds} (drops=${r.total})`);
      return r;
    });
  }

  // B 负:夜 20:00 —— 右键采收必须拒;破坏必须"只掉草药不掉种子"
  const b1 = await runCase('B1 夜20:00 右键采收', { tid: scene.T83, todFrac: 20 / 24, mode: 'interact' });
  L.chk('B1 夜20:00 右键采收被拒', !b1.tileGone && b1.total === 0,
    `tileGone=${b1.tileGone} drops=${b1.total}`);
  const b2 = await runCase('B2 夜20:00 破坏', { tid: scene.T83, todFrac: 20 / 24, mode: 'break' });
  L.chk('B2 夜20:00 破坏:草药掉/种子不掉', b2.tileGone && b2.herb >= 1 && b2.seeds === 0,
    `herb=${b2.herb} seeds=${b2.seeds}`);

  // C 正:昼窗 16:30 —— 右键采收成功 + 种子掉
  const c1 = await runCase('C1 昼16:30 右键采收', { tid: scene.T83, todFrac: 16.5 / 24, mode: 'interact' });
  L.chk('C1 昼16:30 右键采收成功+种子', c1.tileGone && c1.herb >= 1 && c1.seeds >= 1,
    `tileGone=${c1.tileGone} herb=${c1.herb} seeds=${c1.seeds}`);

  // D 负:正午 12:00(昼但窗未开) —— 防"恒开"假绿
  const d1 = await runCase('D1 正午12:00 右键采收', { tid: scene.T83, todFrac: 12 / 24, mode: 'interact' });
  L.chk('D1 正午12:00 右键采收被拒', !d1.tileGone && d1.total === 0, `tileGone=${d1.tileGone} drops=${d1.total}`);
  const d2 = await runCase('D2 正午12:00 破坏', { tid: scene.T83, todFrac: 12 / 24, mode: 'break' });
  L.chk('D2 正午12:00 破坏:种子不掉', d2.tileGone && d2.herb >= 1 && d2.seeds === 0,
    `herb=${d2.herb} seeds=${d2.seeds}`);

  // E 负:凌晨 02:00(夜的另一段——钟面回绕段,修复前后都须拒)
  const e1 = await runCase('E1 凌晨02:00 右键采收', { tid: scene.T83, todFrac: 2 / 24, mode: 'interact' });
  L.chk('E1 凌晨02:00 右键采收被拒', !e1.tileGone && e1.total === 0, `tileGone=${e1.tileGone} drops=${e1.total}`);

  // F 守恒:84 开花态 @ 夜 20:00 恒可收(IsHarvestableHerbWithSeed type84→true,防过修)
  const f1 = await runCase('F1 84开花态 夜20:00 右键采收', { tid: scene.T84, todFrac: 20 / 24, mode: 'interact' });
  L.chk('F1 84开花态 夜间仍可收+种子', f1.tileGone && f1.herb >= 1 && f1.seeds >= 1,
    `tileGone=${f1.tileGone} herb=${f1.herb} seeds=${f1.seeds}`);

  // 窗边界自证:15:45 恰=40500 → 严格大于不收;15:46 收(昼内线性,与 vanillaMainTime 等价)
  const g1 = await runCase('G1 昼15:44 右键采收', { tid: scene.T83, todFrac: 15.733 / 24, mode: 'interact' });
  L.chk('G1 昼15:44(窗前 1 分钟)被拒', !g1.tileGone && g1.total === 0, `tileGone=${g1.tileGone}`);

  // ── IIII238 ④收尾:解冻——钟面回滚冻结前值+恢复推进(夹具"像没发生过"语义)
  const uf = await unfreezeClock(page);
  const back = await clockInfo(page);
  L.chk('unfreezeClock 回滚钟面+恢复推进', uf.ok && !back.frozen && Math.abs(back.tod - clock0.tod) < 1e-12,
    `tod0=${clock0.tod.toFixed(6)} back=${back.tod.toFixed(6)} frozen=${back.frozen}`);

  L.print();
  process.exit(L.exitCode());
} finally {
  await browser.close();   // J1 孤儿防线
}
