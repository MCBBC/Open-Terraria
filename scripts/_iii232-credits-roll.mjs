// 一次性（IIIII232）：制作组名单（CreditsRoll）端到端探针。
//   ① 触发条件：月总首杀（bossBlock ev=10 分支）→ CreditsRollEvent.TryStarting
//   ② remainingTime = composer endTime（SkyManager AmountOfTimeNeededForFullPlay 等价）
//   ③ 每帧 UpdateTime 递减（Main.cs:65949）
//   ④ 选曲 89（MusicID.JourneysEnd，链首）
//   ⑤ 演出 overlay 上屏（CreditsRollSky 消费侧：opacity 斜坡 + 文字卷轴非空像素）
// ★IIIII236 迁移版:引导/建世界/泵/overlay 非空像素哨兵/断言台账收敛到统一框架
//   (tools/probe/lib);行为等价=①~⑤断言逐条保持(原文备份 /tmp/iii236-out/originals/)。
// 用法①: node tools/probe.mjs run scripts/_iii232-credits-roll.mjs --size=small
// 用法②: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_iii232-credits-roll.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, litStats, ledger } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const L = ledger({ failExit: 2 });
const pageErrors = [];   // 页错误只上报不判死(与原探针口径一致)
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: pageErrors });
  const boot = await bootstrap(page, ORIGIN);
  L.chk('bootstrap(导航+清IDB+ack)', boot.ok, boot.why ?? '');
  if (boot.ok) {
    const gen = await createGame(page, { mode: 'url', size: process.env.SW_SIZE || 'small' });
    L.chk('createGame(?play 旁路进世界)', gen.ok, gen.why ?? '');
    if (gen.ok) {
      const out = await page.evaluate(async () => {
        const g = window.__swGame;
        const { creditsRoll } = await import('/src/world/CreditsRoll.ts');
        const { getCreditsRollFill } = await import('/src/world/creditsRollComposer.ts');
        const r = { wasDownedBefore: !!g.world.flags['downed_398'] };

        creditsRoll.reset();
        const fill = getCreditsRollFill(true);
        r.composer = { segments: fill.segments.length, endTime: fill.endTime };
        r.cvBefore = !!document.querySelector('.sw-credits');

        // 平地 + 召唤月总
        const st = g.world.store;
        const px0 = Math.floor(g.player.cx / 16);
        let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
        for (let dx = -120; dx <= 120; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
        for (let dx = -120; dx <= 120; dx++) st.setTile(px0 + dx, gy + 1, 2);
        g.player.hp = g.player.maxHp;
        g.summonBoss('moon_lord');
        if (!g.boss) return { ...r, boss: false };
        r.bossId = g.boss.vanillaId;
        // 击杀（fromPlayer → 交互位；月总 398 死亡走 bossBlock 击败链）。
        // 核心 398 双手/头死前无敌（AI_077）——先清部件 394/396/397 再打核心
        const killParts = () => {
          for (const e of [...g.entities.enemies, ...g.entities.critters]) {
            if (e.dead || ![394, 396, 397].includes(e.vanillaId)) continue;
            for (let i = 0; i < 6 && !e.dead; i++) e.hurt(9999999, 1, 0, g, 0, false, 0, true);
          }
        };
        for (let i = 0; i < 12 && g.boss && !g.boss.dead; i++) {
          killParts();
          g.boss.hurt(9999999, 1, 0, g, 0, false, 0, true);
          for (let k = 0; k < 20; k++) g.fixedUpdate(1 / 60);
        }
        // 月总死亡演出（ai0=2 死亡动画段）走完才收 dead——步进 12s
        for (let i = 0; i < 60 * 12 && g.boss && !g.boss.dead; i++) {
          if (g.player.hp < 60) g.player.hp = g.player.maxHp;
          g.fixedUpdate(1 / 60);
        }
        r.coreHp = g.boss ? g.boss.hp : 0;
        r.coreAi0 = g.boss ? g.boss.ai0 : null;
        r.bossDead = !g.boss || g.boss.dead;
        r.downedFlag = !!g.world.flags['downed_398'];

        // ① 触发 + ② 时长
        r.event = {
          ongoing: creditsRoll.isEventOngoing,
          remaining: creditsRoll.remainingTime,
          equalsComposerEnd: creditsRoll.remainingTime === fill.endTime,
        };
        r.fillEndTime = fill.endTime;
        return r;
      });

      // ⑤ 演出上屏:步进 ~4s(opacity 斜坡 1/120 每帧 → ~2s 满格)后取 overlay 像素
      //   (原版 60*4 泵在页内;此处走框架分段泵=同一 tick 语义)
      await pump(page, 60 * 4);
      await new Promise((res) => setTimeout(res, 200));
      // ④ 选曲 + ③ 递减读位:4s 窗后=跨过多个 15t 选曲门(与原版同位)
      const after = await page.evaluate(async () => {
        const g = window.__swGame;
        const { creditsRoll } = await import('/src/world/CreditsRoll.ts');
        return { lastMusic: g.lastMusic ?? null, remaining: creditsRoll.remainingTime, ongoing: creditsRoll.isEventOngoing };
      });
      const overlay = await litStats(page, { selector: '.sw-credits' });
      L.say(`out: ${JSON.stringify(out)}`);
      L.say(`after4s: ${JSON.stringify(after)}`);
      L.say(`overlay: ${JSON.stringify(overlay)}`);

      L.chk('月总召唤+击杀走 bossBlock 击败链', out.bossId === 398 && out.bossDead === true && out.downedFlag === true,
        `id=${out.bossId} dead=${out.bossDead} flag=${out.downedFlag}`);
      L.chk('① 触发 IsEventOngoing', out.event?.ongoing === true, JSON.stringify(out.event));
      L.chk('② remainingTime = composer endTime', out.event?.equalsComposerEnd === true, JSON.stringify(out.event));
      L.chk('④ 选曲 89 JourneysEnd', after.lastMusic === 89, `lastMusic=${after.lastMusic}`);
      L.chk('⑤ 演出 overlay 上屏且非空像素', (overlay?.nonZero ?? 0) > 100, JSON.stringify(overlay));
      L.chk('③ remainingTime 随世界 tick 递减', after.remaining < out.fillEndTime,
        `a=${out.event?.remaining} b=${after.remaining} endTime=${out.fillEndTime}`);
    }
  }
  if (pageErrors.length) L.say(`pageErrors(前3): ${JSON.stringify(pageErrors.slice(0, 3))}`);
} catch (e) {
  L.chk('framework', false, String(e?.message ?? e));
} finally {
  await browser.close();
}
process.exit(L.exitCode());
