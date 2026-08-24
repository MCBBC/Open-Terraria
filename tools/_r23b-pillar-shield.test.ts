// R23b 探针:星璇四塔盾期无敌通道审计(env 门控=SW_R23B=1)。
// 红队发现 R23b-P1:towerAI 用 iframes=2 近似原版 dontTakeDamage(Enemy.ts:11717),
// 而 Enemy.hurt 免疫门是 `pierce !== 1 && this.iframes > 0`(Enemy.ts:11888)——
// pierce===1(单发弹:箭/枪弹/多数随从)完全绕过 → 盾>0 时塔本体仍可被直伤。
// 原版:NPC.cs:39492-39501 每 tick dontTakeDamage = ShieldStrengthTowerX != 0(全通道),
// Projectile.cs:12682-12686 命中双闸。对照组:golem 挂载头用真 dontTakeDamage(bossAI_golem.ts:334)。
// 运行:npx vitest run tools/_r23b-pillar-shield.test.ts(SW_R23B=1 才跑断言体)
import { it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';

const RUN = process.env.SW_R23B === '1';

/** 全应答 game 桩:hurt 管线沿途的 game.* 调用全部吞掉 */
function stubGame(): unknown {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'player') return null;
      if (prop === 'world') return { flags: {} };
      if (prop === 'enemies') return () => [];
      return () => undefined;
    },
    set() { return true; },
  });
}

(RUN ? it : it.skip)('R23b-P1: 塔(iframes=2)在 pierce=1 单发弹下免疫门被绕过', () => {
  const tower = Enemy.fromVanilla(517, 100, 100);
  expect(tower).toBeTruthy();
  const t = tower!;
  const hp0 = t.hp;
  // 复刻 towerAI :11717 的近似写法(盾>0 每 tick 刷新)
  t.iframes = 2;
  expect(t.dontTakeDamage).toBe(false); // 关键缺陷证据:塔实例 dontTakeDamage 从未置位
  const g = stubGame() as never;

  // pierce=2 穿透弹:被免疫门挡下(对照组)
  const blocked = t.hurt(500, 0, 0, g, 0, false, 2);
  expect(blocked).toBe(false);
  expect(t.hp).toBe(hp0);

  // pierce=1 单发弹(箭/枪弹):绕过免疫门 → 伤害入账
  const leaked = t.hurt(500, 0, 0, g, 0, false, 1);
  expect(leaked).toBe(false);            // 未死,但…
  expect(t.hp).toBeLessThan(hp0);        // …血已扣 = 盾形同虚设(原版应为 0 伤害)

  // 对照:同型场景 golem 挂载头用真 dontTakeDamage → 单发弹也挡住
  const head = Enemy.fromVanilla(246, 100, 100)!;
  head.dontTakeDamage = true;
  const hpHead = head.hp;
  head.hurt(500, 0, 0, g, 0, false, 1);
  expect(head.hp).toBe(hpHead);
});

(RUN ? it : it.skip)('R23b-P2 旁证: 星旋支线 b 点位 LOS 门方向(静态断言)', () => {
  // 只钉字符串,防回归时注释与实现再次反向:
  // 原版 NPC.cs:39722-39724 = !CanHitLine → 弃点(合格点须视线通畅);
  // 我方 Enemy.ts:11838 = losClear → continue(保留视线被阻点)= 反相。
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const src = readFileSync('src/entities/Enemy.ts', 'utf8');
  expect(src).toContain('if (losClear(game, this.cx, this.cy, player.cx, player.cy)) continue;');
});
