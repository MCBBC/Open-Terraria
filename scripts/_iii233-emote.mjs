// IIII233 探针③：表情触发族全链（headless）
//   A. 玩家表情（MakeLocalPlayerEmote :279-293）→ 出泡 360t + OnBubbleChange Player 锚门
//   B. NPC 回应（CheckForNPCsToReactToEmoteBubble :152-167）→ ai0=19 220t + 面向玩家
//   C. 回应态帧 16 冒 NewBubbleNPC(anchor,112)（NPC.cs:69810）→ 表情由 PickNPCEmote
//      全量池（world/EmotePick.ts）掷出——验证 live 语境（EmotePick host 接线）
//   D. 结对聊天 NewBubbleNPC(anchor,70/100,other)（NPC.cs:70049-70053,ai0 3/4）
//   E. 自创"空闲随机冒泡"已退役（IIIII233）——静置期无泡
// 运行:SW_ORIGIN=http://localhost:5289 node tools/run-diag.mjs scripts/_iii233-emote.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000,
});
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small&emoteprobe=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  const res = {};
  // ★探针纪律：不动态 import 实体模块（stale transform 分叉出第二模块实例,
  // __swEmotes 句柄被覆写、static emoteHost 分裂——vite-probe-stale-transform-cache 案）。
  // TownNPC 类取自在场实例的 constructor（static emoteHost 随类走,同 Game 注入态）。

  // ---- 场地：平整出生点（消背景气泡干扰）----
  const ptx = Math.floor(g.player.cx / TILE);
  let gy = Math.floor(g.player.cy / TILE) + 2;
  while (gy < st.h - 4 && !st.isSolid(ptx, gy)) gy++;
  for (let x = ptx - 12; x <= ptx + 12; x++) {
    for (let y = gy - 6; y < gy; y++) { st.setTile(x, y, 0); st.setWall(x, y, 0); }
    st.setTile(x, gy, 2);
  }
  const { snapshot: emoteSnapshot, clear: emoteClearAll } = window.__swEmotes;
  emoteClearAll();

  // ---- 生成商人（17）于玩家旁 3 tile ----
  const anyTown = g.entities.npcs.find((n) => n.npcKey && !n.dead);
  if (!anyTown) return { error: 'no existing TownNPC to clone ctor from' };
  const TownNPC = anyTown.constructor;                 // app 实例同类（static 一致）
  const merchant = new TownNPC('merchant', (ptx + 3) * TILE + 8, (gy - 1) * TILE);
  g.entities.add(merchant, 'npcs');
  await sleep(600);
  res.npc = {
    spawned: !!merchant && !merchant.dead,
    vanillaId: merchant.vanillaId,
    ai0: merchant.ai0,
  };

  // ---- A+B. 玩家表情 → NPC 回应 ----
  emoteClearAll();
  g.makeLocalPlayerEmote(0);            // 爱心
  await sleep(200);
  const snapA = emoteSnapshot();
  res.A = {
    bubbleCount: snapA.length,
    emote0Alive: snapA.some((x) => x.emote === 0 && x.lifeTime > 300),  // 360t 起步
  };
  res.B = {
    npcReacting: merchant.social?.kind === 19,
    reactT: merchant.social?.t,
    facing: merchant.facing,            // 面向玩家（玩家在其左 → -1）
  };

  // ---- C. 回应态 16t 帧点 → NewBubbleNPC(anchor,112)（PickNPCEmote 全量池）----
  emoteClearAll();
  for (let i = 0; i < 40 && emoteSnapshot().length === 0; i++) await sleep(100);
  const snapC = emoteSnapshot();
  res.C = {
    npcBubble: snapC.length > 0,
    emoteId: snapC[0]?.emote ?? -1,
    lifeTime: snapC[0]?.lifeTime,        // ≈112（112t 泡）
    emoteIdValid: snapC.length > 0 && snapC[0].emote >= 0 && snapC[0].emote <= 150,
  };

  // ---- C2. live PickNPCEmote 语境（EmotePick host → 全量池非"情绪近似"）----
  // 池面验证 = 连续 60 次任意商人锚抽样的去重数（情绪基池仅 15 项,全量池 >15）
  const ctx = TownNPC.emoteHost?.();
  res.C2 = {
    hostWired: !!ctx,
    hasCensus: typeof ctx?.census === 'function',
    censusMerchant: ctx ? ctx.census(17) : -1,
    poolSpread: (() => {
      if (!ctx) return 0;
      const ids = new Set();
      for (let i = 0; i < 60; i++) {
        ids.add(merchant.npcEmotePick());
      }
      return ids.size;
    })(),
  };

  // ---- D. 结对聊天（ai0 3/4 双泡 70/100/90）----
  emoteClearAll();
  const guide = new TownNPC('guide', (ptx - 3) * TILE + 8, (gy - 1) * TILE);
  g.entities.add(guide, 'npcs');
  await sleep(400);
  // 直接入态（省 600t 掷骰等待——状态机/帧点由 townnpc-behavior 单测覆盖）。
  // ★t = ai[1] 倒计时（socialUpdate 每 tick --，<=0 退场）——须给满 420 态长;
  //   帧点用 frameT（socialFrame 内自增）
  merchant.social = { kind: 3, t: 420, other: guide, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
  guide.social = { kind: 4, t: 420, other: merchant, frameT: 0, prevFrame: 0, rpsA: 0, rpsB: 0 };
  for (let i = 0; i < 60 && emoteSnapshot().length < 2; i++) await sleep(100);
  const snapD = emoteSnapshot();
  res.D = {
    bubbles: snapD.length,              // ≥2：t=70 伙伴泡 + t=216/320 发起者泡
    emotes: snapD.map((x) => x.emote),
    lifeTimes: snapD.map((x) => x.lifeTime),   // 90/70/100 档
    diag: {
      merchantSocial: merchant.social ? { kind: merchant.social.kind, t: merchant.social.t, frameT: merchant.social.frameT } : null,
      guideSocial: guide.social ? { kind: guide.social.kind, t: guide.social.t, frameT: guide.social.frameT } : null,
      onGround: [merchant.onGround, guide.onGround],
      dist: Math.hypot(merchant.cx - guide.cx, merchant.cy - guide.cy),
    },
  };

  // ---- E. 静置期无自创泡（tickNpcEmotes 退役验证）----
  emoteClearAll();
  merchant.social = null; guide.social = null;
  await sleep(4000);
  res.E = { idleBubbles: emoteSnapshot().length };   // 期望 0

  return res;
});
console.log(JSON.stringify(out, null, 2));
const ok = !!(out && out.A?.bubbleCount >= 1 && out.A?.emote0Alive
  && out.B?.npcReacting && out.C?.npcBubble && out.C?.emoteIdValid
  && out.C2?.hostWired && out.C2?.poolSpread >= 8
  && out.D?.bubbles >= 2 && out.E?.idleBubbles === 0);
console.log(ok ? 'III233-EMOTE-PROBE: PASS' : 'III233-EMOTE-PROBE: FAIL');
await b.close();
process.exit(ok ? 0 : 1);
