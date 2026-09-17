/**
 * _f1-zerostep-hover.mjs — SW-F1 非暂停 0 步进帧悬停空窗 e2e 探针（红蓝 2 定谳）
 *
 * 症状（修复前）：本仓 mouseOversClear 挂 frame() 头【每绘制帧】清零,而三族悬停
 * claim（NPC 名/他玩家血名/掉落物名）原只在 fixedUpdate（tickCursorIcon）→ 0 步进
 * 帧（frameSkipMode on/off 档 + >60Hz 下逻辑不步进照画的帧,~58%）清后无回填 =
 * 悬停名单帧闪烁（默认 subtle 档被 SuppressDraw 掩蔽）。
 *
 * vanilla 锚（Terarria1457/Terraria/Main.cs）：
 *   :17213   MouseOversClear 在 Update 头（60Hz/步）——非每绘制帧;
 *   :43595   DrawMouseOver 三族 claim（drops :43608-43638 / 他玩家 :43639-43662 /
 *            HoverOverNPCs :43664→:43820-43832）,唯一调用点 = DrawInterface_39_
 *            MouseOver :45902→:45906（接口层 "Vanilla: Mouse Over" :45659-45663）=
 *            【绘制相】每绘制帧重 claim → 清零(60Hz)+claim(每绘制帧) 永不空窗。
 *   :63394   DrawInterface 在黑幕 :63367-63381 之后（F2 同域,不在本探针面）。
 *
 * 本仓锚（game/src/core/Game.ts）：frame() 头 mouseOversClear()（每绘制帧）→
 *   SuppressDraw 判定 → refreshCursorIconDrawState() → 绘制相无条件块
 *   `if (this.world) { tickHoverNpcName/tickHoverRemotePlayerName/tickHoverDropName }`
 *   → render()（★SW-F1 2026-09-16,三族自 tickCursorIcon 退役）。
 *
 * 断言面（0 步进帧 = g.frame(g.lastTime) 同拍时间戳 → dtMs=0 → steps=0,绘制相
 * 照走、fixedUpdate 不跑;单 evaluate 同步任务内完成,rAF 无法插缝）：
 *   ① 基线普通帧（步进>0）后 NPC 名已 claim;
 *   ② 0 步进帧内先清后 claim：帧前置哨兵 'SENTINEL' → 帧后为真名（=清零面跑过+
 *      绘制相回填跑过;修复前该处为 ''=清零后无回填,即用户症状）;
 *   ③ 连续两个 0 步进帧悬停名持续不灭（frameSkipMode off/on 两档各跑一遍;
 *      subtle 档 0 步进帧 SuppressDraw 整帧不进 = 原版同相,不进断言）。
 * 变异证红：三族 claim 回挂 fixedUpdate（tickCursorIcon）→ ②③ 红（结构锁
 *   sw-bj105「退役锁」同面,tests/sw-bj105-hover-claims.test.ts）。
 *
 * 运行（私有静默实例,并行会话约定）：先起
 *   SW_PORT=5205 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5205 nohup npx vite > /tmp/vite-5205.log 2>&1 &
 *   SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs scripts/_f1-zerostep-hover.mjs
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump, ledger,
  spawnTownNPC, clearEnemies, godMode, freezeClock, unfreezeClock, clockInfo,
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

  // 时钟冻结夹具（IIII238 ④）：钉当前时辰并冻结——探针期间钟面不走,重复手工
  // frame() 不触发昼转/事件面,0 步进断言纯净化
  const clock0 = await clockInfo(page);
  await freezeClock(page, { tod: clock0.tod });
  const fzChk = await clockInfo(page);
  L.chk('freezeClock 冻结生效', fzChk.ok && fzChk.frozen, `tod=${fzChk.tod} frozen=${fzChk.frozen}`);

  // 场景：向导钉在玩家脚下 3 格侧位（home 门内不游走）;清敌怪/掉落物防意外命中
  const ppos = await page.evaluate(() => {
    const g = window.__swGame;
    return { px: g.player.cx, py: g.player.cy };
  });
  const npc = await spawnTownNPC(page, 'guide', { x: ppos.px + 48, yFoot: ppos.py + 21 });
  L.chk('spawn guide', !!npc?.ok, npc?.why ?? JSON.stringify(npc));
  await clearEnemies(page, { kinds: ['enemies', 'drops', 'projectiles', 'critters'] });

  for (const mode of ['off', 'on']) {
    const sm = await page.evaluate(async (m) => {
      const { options } = await import('/src/core/Options.ts');
      options.set('frameSkipMode', m);
      return options.data.frameSkipMode;
    }, mode);
    L.chk(`frameSkipMode=${mode} 置位`, sm === mode, `got=${sm}`);

    // 单同步任务：光标先钉 → 基线帧 → 钉 NPC/光标复核 → 哨兵 → 0 步进帧×2（rAF 不可插缝）
    const r = await page.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const tileSolidAt = (tx, ty) => st.inBounds(tx, ty) && st.isSolid(tx, ty);
      // 0) 光标先钉 NPC 盒中心（基线帧的 claim 面读本光标位）
      const n = g.entities.npcs.find((x) => x.npcKey === 'guide' && !x.dead);
      if (!n) return { why: 'no-guide' };
      const [sx0, sy0] = g.camera.worldToScreen(n.cx, n.cy);
      g.input.mouseX = Math.round(sx0); g.input.mouseY = Math.round(sy0);
      // 1) 基线：真实时间戳帧（elapsed>0 → 步进>0;fixedUpdate+绘制相全跑）
      g.frame(performance.now());
      const base0 = g.player.cursorItemIconText;
      // 2) 钉 NPC（基线帧内 AI/重力已挪位——0 步进帧自身不步进,钉一次即稳）+ 光标复核
      const nx = n.cx, nyBottom = n.y + n.h;
      if (n.vx !== undefined) n.vx = 0;
      if (n.vy !== undefined) n.vy = 0;
      n.x = nx - n.w / 2; n.y = nyBottom - n.h;
      const [sx, sy] = g.camera.worldToScreen(n.cx, n.cy);
      g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
      // 4) 0 步进绘制帧：同拍时间戳 → dtMs=0 → acc 不增 → steps=0
      const accBefore = g.acc;
      g.player.cursorItemIconText = 'SENTINEL';          // 帧内清零面证据哨兵
      const lastT = g.lastTime;
      g.frame(lastT);                                    // 0 步进帧 #1
      const mid = { text: g.player.cursorItemIconText, acc: g.acc };
      g.player.cursorItemIconText = 'SENTINEL';          // 帧内清零面证据哨兵
      g.frame(lastT);                                    // 0 步进帧 #2
      const fin = { text: g.player.cursorItemIconText, acc: g.acc };
      return {
        base0, mid, fin,
        zeroStep: mid.acc === accBefore && fin.acc === accBefore,  // acc 纹丝不动=0 步进
        onGroundHint: tileSolidAt(Math.floor(nx / 16), Math.floor(nyBottom / 16) + 1),
      };
    });
    if (r.why) { L.chk(`[${mode}] 场景就绪`, false, r.why); continue; }
    L.chk(`[${mode}] 基线普通帧 NPC 名已 claim`, typeof r.base0 === 'string' && r.base0.length > 0,
      JSON.stringify(r.base0));
    L.chk(`[${mode}] 0 步进判定成立（acc 双帧不动）`, r.zeroStep === true,
      `acc mid=${r.mid.acc} fin=${r.fin.acc}`);
    L.chk(`[${mode}] 0 步进帧先清后 claim（哨兵被清、绘制相回填真名=空窗消灭）`,
      r.mid.text.length > 0 && r.mid.text !== 'SENTINEL',
      `mid=${JSON.stringify(r.mid.text)}`);
    L.chk(`[${mode}] 连续 0 步进帧悬停名持续`,
      r.fin.text === r.mid.text && r.fin.text.length > 0,
      `fin=${JSON.stringify(r.fin.text)}`);
  }

  // subtle 档对照：0 步进帧 SuppressDraw 整帧不进（渲染/claim 全跳）= 原版同相;
  // 哨兵原样残留即"整帧未进"证据（清零在抑制帧照跑?——不,抑制 return 在 clear 之后
  // clear 已跑,claim 不跑 → 哨兵被清成 ''。两者皆证"claim 未跑",关键断言=非真名）
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    options.set('frameSkipMode', 'subtle');
  });
  const sub = await page.evaluate(() => {
    const g = window.__swGame;
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide' && !x.dead);
    const [sx, sy] = g.camera.worldToScreen(n.cx, n.cy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    const lastT = g.lastTime;
    g.frame(lastT);   // subtle + steps=0 → SuppressDraw return（clear 已跑,claim 不跑）
    return { text: g.player.cursorItemIconText };
  });
  L.chk('[subtle] 0 步进帧被 SuppressDraw 抑制（clear 照跑、claim 停摆 → 哨兵被清成空）',
    sub.text === '',
    `text=${JSON.stringify(sub.text)}（''=清零后停摆,非真名=抑制生效）`);

  const uf = await unfreezeClock(page);
  L.chk('unfreezeClock 恢复', uf.ok, JSON.stringify(uf));

  L.print();
  process.exit(L.exitCode());
} finally {
  await browser.close();   // J1 孤儿防线
}
