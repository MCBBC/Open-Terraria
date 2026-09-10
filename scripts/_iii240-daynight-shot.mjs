// IIII240 验收探针:探针框架截图三坑收编(①昼夜可见性 ②角色对框 ③欢迎弹窗)。
//   A. 欢迎弹窗:bootstrap 不预置 ack(welcomeAck:false=负对照前提)→ 弹窗在进世界后
//      真实挂出(mainFlow onWorldReady)→ createGame 首轮自动关(how!=='absent' 即证
//      「真弹过又被关」)+ ack 落袋 + DOM 已无根节点;
//   B. staging 布景:一键清整带+地板+火把行+目标物+玩家传送布景中心+相机对框;
//      相机被故意拽偏 1600px 后 ensureContent('snapcam') 自愈(E12);
//   C. 地表昼夜双拍:时段正确(isDay/shotTod)、拍拍指纹必异(钉钟真的改变了画面)、
//      拍完钟面回滚(restore 夹具语义);
//   D. 地下无光洞室(周圈石封防天然洞漏光):onDark:'off' 哨兵如实报黑(负对照)→
//      'torch' 注入持久火把转绿(mutated 落点+tile 实证)→ 夜拍仍保夜时段;
//   E. 换昼拍:无光洞室夜拍 onDark:'day' → 'day' 策略真执行(钟面切昼)+返回值如实标注
//      shotIsDay=true+dark=true(无光洞室换昼也救不活=不冒充成功);
//   F. 地狱场景夜拍(熔岩层布景+火把照明)。
// 运行:node tools/probe.mjs run scripts/_iii240-daynight-shot.mjs --vite=5294 \
//        --out=/tmp/iii240-out --seed=05162020 --size=small
//  兼容:SW_ORIGIN=http://localhost:5294 node tools/run-diag.mjs scripts/_iii240-daynight-shot.mjs
import {
  launchBrowser, openPage, bootstrap, createGame, pump, ledger,
  stage, screenshot, ensureContent, litStats, clockInfo, viewRectTiles, worldToScreen, godMode, saveJson, teleport,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5294';
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii240-out';
const L = ledger({ failExit: 2 });
const pageErrors = [];
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: pageErrors });
  let anchor = null;        // 地表布景锚({tx,ty};B 段定,C/E 段复用)
  let groundLevel = 0;

  await L.step('A. 欢迎:不预置 ack 建世界(弹窗真实挂出→首轮自动关)', async () => {
    const boot = await bootstrap(page, ORIGIN, { welcomeAck: false });   // ★负对照前提:不预置 ack
    L.chk('bootstrap(不预置 ack)', boot.ok, boot.why ?? '');
    if (!boot.ok) return;
    const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
    L.chk('createGame', gen.ok, gen.why ?? `${gen.w}x${gen.h}`);
    L.chk('③ 欢迎弹窗被首轮自动关(how≠absent=真弹过)', gen.ok && gen.welcome?.ok === true
      && gen.welcome.how !== 'absent', JSON.stringify(gen.welcome));
    const dom = await page.evaluate(() => ({
      gone: !document.getElementById('sw-welcome-announce'),
      ack: localStorage.getItem('sw.welcome.announce.acked'),
    }));
    L.chk('③ 弹窗 DOM 已无+ack 永久落袋', dom.gone && dom.ack === '1', JSON.stringify(dom));
    await pump(page, 60, { clearEnemies: true });
    groundLevel = await page.evaluate(() => Math.floor(window.__swGame.world.groundLevel));
  });

  if (!L.fails.length) await L.step('B. staging 布景+相机对框(E12)', async () => {
    await godMode(page, true);
    // 开天锚点:worldSurface 是全局标量,个别 x 处有山体/沟壑——选「布景带全宽
    // (±26 格)局部地表齐平且 ≈worldSurface」的 x(左右交替外扩扫描),保证清整带
    // 上方是露天、昼拍见天(单列判据曾切进山体坡脚,带内气格仍背后墙=假洞感)
    anchor = await page.evaluate((gl) => {
      const g = window.__swGame, st = g.world.store;
      const spawnX = Math.floor(g.player.cx / 16);
      const surfaceAt = (x) => {
        let y = Math.max(10, gl - 60);
        while (y < st.h - 2 && !st.isSolid(x, y)) y++;
        return y;
      };
      for (let k = 0; k < 240; k++) {
        const x = spawnX + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 29;
        if (x < 100 || x > st.w - 120) continue;
        const cols = [-26, -13, 0, 13, 26].map((d) => surfaceAt(x + d));
        const lo = Math.min(...cols), hi = Math.max(...cols);
        if (hi - lo <= 3 && Math.abs(cols[2] - gl) <= 8) return { tx: x, ty: Math.max(11, cols[2] - 6) };
      }
      return { tx: spawnX, ty: gl - 6 };
    }, groundLevel);
    const sc = await stage(page, {
      at: anchor,
      platform: { key: 'stone' },
      light: 'torch',                       // 火把行+手持火把(IIII220 照明花园)
      tiles: [{ dx: 0, dy: -2, key: 'torch' }],
      player: true, camera: true,
    });
    L.chk('② stage 一键布景(寻地面/清整带/火把/目标物)', sc.ok === true && sc.torches > 0 && sc.placed >= 1,
      JSON.stringify({ cx: sc.cx, cy: sc.cy, torches: sc.torches, placed: sc.placed, why: sc.why }));
    if (!sc.ok) return;
    const rect = await viewRectTiles(page);
    const inView = rect && sc.cx >= rect.x0 && sc.cx <= rect.x1 && sc.cy >= rect.y0 && sc.cy <= rect.y1;
    const [sx, sy] = await worldToScreen(page, sc.wx, sc.wy);
    L.chk('② 相机对框:布景中心在视野内+近屏心', inView === true && Math.abs(sx - 640) < 320 && Math.abs(sy - 400) < 240,
      `rect=${JSON.stringify(rect)} screen=(${sx},${sy})`);
    // 相机/玩家错位(玩家西移 1600px:相机 follow 跟玩家→布景中心稳定挂画布右外=offscreen
    // 稳态,不与 0.15 缓动赛跑)→ ensureContent snapcam 自愈
    await teleport(page, sc.wx - 1600, sc.wy);
    const off = await litStats(page, { wx: sc.wx, wy: sc.wy });
    const healed = await ensureContent(page, { wx: sc.wx, wy: sc.wy, strategies: ['snapcam'] });
    L.chk('② 相机错位后哨兵亮红→snapcam 一招自愈',
      (off.why === 'offscreen' || off.ratio < 0.02) && healed.ok === true && healed.applied[0]?.strategy === 'snapcam',
      `off=${JSON.stringify({ why: off.why, ratio: off.ratio })} applied=${JSON.stringify(healed.applied)}`);
  });

  if (!L.fails.length) await L.step('C. 地表昼夜双拍(钉钟/收敛/指纹/回滚)', async () => {
    const sc = await stage(page, { at: anchor, platform: { key: 'stone' }, light: 'torch', player: true, camera: true });
    if (!sc.ok) { L.chk('stage', false, sc.why ?? ''); return; }
    // 清整带拆墙:带内气格 wall=0 → 地表线上方渲染天空(地表线上方=天空,下方=洞穴黑),
    // 昼拍见蓝天/夜拍见夜幕——昼夜差异肉眼可判(山体坡脚的带内气格曾背后墙=假洞感)
    await page.evaluate(({ tx0, ty0, tx1, gy }) => {
      const st = window.__swGame.world.store;
      for (let y = Math.max(1, ty0); y <= gy - 1; y++) for (let x = tx0; x <= tx1; x++) st.setWall(x, y, 0);
      return true;
    }, { tx0: sc.tx0, ty0: sc.ty0, tx1: sc.tx1, gy: sc.groundY });
    const before = await clockInfo(page);
    const day = await screenshot(page, 'iii240-surface-day', { time: 'day', wx: sc.wx, wy: sc.wy });
    L.chk('① 地表昼拍可见+时段正确+钉钟冻结', day.ok === true && day.shotIsDay === true && day.frozen === true,
      `lit.ratio=${day.lit?.ratio} tod=${day.shotTod?.toFixed?.(4)}`);
    L.chk('① 昼拍后钟面回滚(restore 夹具语义)', day.restored === true && day.afterTod != null
      && Math.abs(day.afterTod - before.tod) < 2 / 1440,   // 容差=2 游戏分钟(解冻至读数间隙真实漂移)
      `before=${before.tod.toFixed(6)} after=${day.afterTod?.toFixed?.(6)}`);
    const night = await screenshot(page, 'iii240-surface-night', { time: 'night', wx: sc.wx, wy: sc.wy });
    L.chk('① 地表夜拍可见+夜 22:00 钉准+保夜时段',
      night.ok === true && night.shotIsDay === false && Math.abs(night.shotTod - 22 / 24) < 1e-9,
      `lit.ratio=${night.lit?.ratio} applied=${JSON.stringify(night.applied)}`);
    L.chk('① 昼/夜两拍指纹必异(钉钟真的改变了画面)',
      day.lit?.fp?.fnv !== night.lit?.fp?.fnv,
      `day.fp=${JSON.stringify(day.lit?.fp)} night.fp=${JSON.stringify(night.lit?.fp)}`);
    const after = await clockInfo(page);
    L.chk('① 两拍收口:钟面未冻+回到拍前', after.frozen === false
      && Math.abs(after.tod - before.tod) < 2 / 1440, `frozen=${after.frozen} tod=${after.tod.toFixed(6)}`);
  });

  /** 石封无光洞室(周圈砌墙,防天然洞/天空漏光)+带内抽水(清场窗天然水体曾倒灌)——
   *  暗室负对照的确定性前提 */
  const sealCave = async (cave) => {
    await page.evaluate(({ tx0, ty0, tx1, gy }) => {
      const st = window.__swGame.world.store;
      const S = window.__swTiles['stone'];
      for (let x = tx0 - 1; x <= tx1 + 1; x++) st.setTile(x, ty0 - 1, S, 0, 0);   // 顶
      for (let y = ty0 - 1; y <= gy - 1; y++) { st.setTile(tx0 - 1, y, S, 0, 0); st.setTile(tx1 + 1, y, S, 0, 0); }   // 左右壁
      return true;
    }, { tx0: cave.tx0, ty0: cave.ty0, tx1: cave.tx1, gy: cave.groundY });
    return page.evaluate(({ tx0, ty0, tx1, gy }) => {
      const g = window.__swGame, st = g.world.store;
      for (let y = ty0; y <= gy - 1; y++) for (let x = tx0; x <= tx1; x++) st.liquid[st.idx(x, y)] = 0;
      if (g.lighting) g.lighting.liquidDirty = true;
      return true;
    }, { tx0: cave.tx0, ty0: cave.ty0, tx1: cave.tx1, gy: cave.groundY });
  };

  /** 找一间「真黑」洞室:候选点位逐个 stage+石封+测暗,取首个哨兵报黑者——
   *  洞壁自带发光体(荧光蘑/发光苔)时洞内不黑,属世界态非夹具问题,换点即可 */
  const findDarkCave = async (offsets) => {
    for (const dx of offsets) {
      const cave = await stage(page, {
        at: { tx: anchor.tx + dx, ty: groundLevel + 60 },
        w: 32, h: 14, platform: { key: 'stone' }, light: null, player: true, camera: true,
      });
      if (!cave.ok) continue;
      await sealCave(cave);
      const dark = await ensureContent(page, { wx: cave.wx, wy: cave.wy, strategies: [], minNonBlack: 0.02 });
      if (dark.ok === false) return { cave, dark };
      L.say(`候选洞室(${cave.cx},${cave.cy}) 非真黑(发光体污染 ratio=${dark.stats?.ratio})→换点`);
    }
    return null;
  };

  if (!L.fails.length) await L.step('D. 地下无光洞室(哨兵负对照→火把注入→夜拍保真)', async () => {
    // ★清手持火把(B/C 段 stage 留下的):heldLight 跟玩家进洞会把"无光洞室"照亮
    await page.evaluate(() => {
      const g = window.__swGame;
      g.player.inv.slots[0] = null;
      g.player.inv.selected = 0;
    });
    await pump(page, 6);
    const found = await findDarkCave([-120, -60, 60, 120, -180, 180]);
    if (!found) { L.chk('找到真黑洞室', false, '候选点全被发光体污染'); return; }
    const { cave, dark } = found;
    L.chk('stage 无光洞室(地表下 60,石封+抽水)', cave.ok === true,
      JSON.stringify({ cx: cave.cx, cy: cave.cy }));
    L.chk('① 负对照:无光洞室哨兵如实报黑(不虚绿)', dark.ok === false && dark.why === 'content-dark',
      `ratio=${dark.stats?.ratio} distinct=${dark.stats?.fp?.distinct}`);
    const lit = await ensureContent(page, { wx: cave.wx, wy: cave.wy, strategies: ['torch'] });
    const torchRes = lit.applied?.find((a) => a.strategy === 'torch')?.result;
    L.chk('① torch 注入转绿+落点记账+写面落袋(同 evaluate 读回)',
      lit.ok === true && lit.mutated?.length >= 1 && torchRes?.active === true && torchRes?.type > 0,
      `applied=${JSON.stringify(lit.applied)} mutated=${JSON.stringify(lit.mutated)}`);
    if (lit.ok && lit.mutated?.length) {
      // 火把后续存活属引擎域(弹幕 cutTiles/失锚等合法 break 链会打掉)——只报不判
      const late = await page.evaluate(async ([tx, ty]) => {
        const g = window.__swGame, st = g.world.store;
        const { TILE_DEFS } = await import('/src/data/tiles.ts');
        const i = st.idx(tx, ty);
        return { active: !!st.flags[i], sheet: TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? null };
      }, lit.mutated[0]);
      L.say(`火把注入后读回(信息位): ${JSON.stringify(late)}`);
    }
    const caveNight = await screenshot(page, 'iii240-cave-night', { time: 'night', wx: cave.wx, wy: cave.wy });
    L.chk('① 无光洞室夜拍:auto 补光转绿且【仍保夜时段】',
      caveNight.ok === true && caveNight.shotIsDay === false && Math.abs(caveNight.shotTod - 22 / 24) < 1e-9,
      `shotTod=${caveNight.shotTod?.toFixed?.(4)} applied=${JSON.stringify(caveNight.applied)}`);
  });

  if (!L.fails.length) await L.step('E. 换昼拍(onDark:day 真执行+如实标注,不冒充成功)', async () => {
    const found2 = await findDarkCave([-150, 150, -90, 90, -210, 210]);
    if (!found2) { L.chk('找到换拍用真黑洞室', false, '候选点全被发光体污染'); return; }
    const cave2 = found2.cave;
    const swap = await screenshot(page, 'iii240-cave-dayswap', { time: 'night', wx: cave2.wx, wy: cave2.wy, onDark: 'day' });
    L.chk('① 夜拍太暗→day 策略真执行+返回值如实标注(shotIsDay=true/dark=true)',
      swap.applied.some((a) => a.strategy === 'day') && swap.shotIsDay === true && swap.dark === true,
      `applied=${JSON.stringify(swap.applied)} shotTod=${swap.shotTod?.toFixed?.(4)} lit.ratio=${swap.lit?.ratio}`);
  });

  if (!L.fails.length) await L.step('F. 地狱场景夜拍(熔岩层布景)', async () => {
    const hell = await page.evaluate(() => Math.floor(window.__swGame.world.lavaLine ?? (window.__swGame.world.h - 200)));
    const rect = await viewRectTiles(page);
    const hs = await stage(page, {
      at: { tx: Math.floor(rect.camX / 16) + 260, ty: hell - 24 },
      w: 36, h: 16, platform: { key: 'ash' }, light: 'torch', player: true, camera: true,
    });
    L.chk('F 地狱布景成功', hs.ok === true, JSON.stringify({ cx: hs.cx, cy: hs.cy, torches: hs.torches, why: hs.why }));
    if (!hs.ok) return;
    const hNight = await screenshot(page, 'iii240-hell-night', { time: 'night', wx: hs.wx, wy: hs.wy });
    const hDay = await screenshot(page, 'iii240-hell-day', { time: 'day', wx: hs.wx, wy: hs.wy });
    L.chk('① 地狱夜/昼双拍可见+时段正确',
      hNight.ok === true && hNight.shotIsDay === false && hDay.ok === true && hDay.shotIsDay === true,
      `night.lit.ratio=${hNight.lit?.ratio} day.lit.ratio=${hDay.lit?.ratio}`);
  });

  saveJson(`${OUT}/report.json`, { out: OUT, fails: L.fails, lines: L.lines, pageErrors: pageErrors.slice(0, 6) });
  if (pageErrors.length) L.say(`pageErrors(前3): ${JSON.stringify(pageErrors.slice(0, 3))}`);
} catch (e) {
  L.chk('framework', false, String(e?.message ?? e));
} finally {
  await browser.close();
}
process.exit(L.exitCode());
