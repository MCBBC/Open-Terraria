// Mech 族缺口补齐回归（2026-08-14）：
//  ① 毁灭者身段受击出探针（HitEffect :90265-90281）② 双子 timeLeft 互保（:26548-26563）
//  ③ 发光叠层/拖尾表（NPC_GLOW 第五批 + generic 拖尾门） ④ 蛇发链光照=compositeLight 架构级覆盖
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const rendererSrc = readFileSync('src/render/Renderer.ts', 'utf8');
const bossAISrc = readFileSync('src/entities/bossAI.ts', 'utf8');
const enemySrc = readFileSync('src/entities/Enemy.ts', 'utf8');
const npcExtraPartsSrc = readFileSync('src/render/npcExtraParts.ts', 'utf8');

describe('Mech 族缺口补齐', () => {
  it('① 135 受击出探针：hurt 内 1/25（mech 1/50）+ ai2 门 + 139 段底生成', () => {
    expect(enemySrc).toContain('vanillaId === 135 && this.hp > 0 && this.ai2 === 0');
    expect(enemySrc).toContain('mechQueenUp() ? 50 : 25');
    //  ★重锚(2026-09-13,RB15c 勘误):139=30×30(NPC.cs:10748),探针中心=节底−15(NewNPC
    //  中心坐标语义);旧 -10 曾低 5px(旧注"h=20"前提错误)
    expect(enemySrc).toContain('Enemy.fromVanilla(139, this.cx, this.y + this.h - 15)');
  });
  it('② 双子互保：夜晚 + despawnTimer<10 → 借另一只眼生命期（DiscourageDespawn 语义）', () => {
    expect(bossAISrc).toContain("!game.world.clock.isDay && e.despawnTimer < 10");
    expect(bossAISrc).toContain('other.despawnTimer - 1 > e.despawnTimer');
  });
  it('③ 发光叠层：125 EyeLaser / 139 Probe(ai3==0 cond) / 131 BoneLaser / 134-136 Dest(opacity)', () => {
    expect(rendererSrc).toContain("125: { tex: 'vanilla/Eye_Laser.png'");
    expect(rendererSrc).toContain("139: { tex: 'vanilla/Probe.png'");
    expect(rendererSrc).toContain('cond: (e) => e.ai3 === 0');
    expect(rendererSrc).toContain("131: { tex: 'vanilla/Bone_Laser.png'");
    for (const [id, tex] of [[134, 'Dest1'], [135, 'Dest2'], [136, 'Dest3']] as const) {
      expect(rendererSrc).toContain(`${id}: { tex: 'vanilla/${tex}.png', mode: 'frame', a: 'opacity' }`);
    }
    expect(rendererSrc).toContain("if (g.cond && !g.cond(e)) return;");
  });
  it('③ 拖尾：125-131 + 139(ai3==0) + 140，oldPos 9→1 间隔 2，α=(10-i)/20', () => {
    // ★重锚（BJ209 迁 npcExtraParts 单源、BJ237 归位本体之下槽——旧 mId/mOp 内联
    // 文本随 BJ209 迁出已不存在，此断言自 BJ209 起陈旧失锚=先存红，本刀改锚现面）：
    // 门+α 在 drawMechTrailGhosts（npcExtraParts），Renderer 侧走残影族 id 门+前绘分发器
    expect(npcExtraPartsSrc).toContain('if (!((vid >= 125 && vid <= 131) || (vid === 139 && e.ai3 === 0) || vid === 140)) return;');
    expect(npcExtraPartsSrc).toContain('((10 - i) / 20) * o.opacity');
    expect(rendererSrc).toContain('NPC_TRAIL_GHOST_IDS');
    expect(rendererSrc).toContain('drawNpcTrailGhosts(ctx, e, this.atlas, r, {');
  });
  it('④ 蛇发链光照：compositeLight 全屏合成覆盖（架构级，无逐段 GetColor 必要）', () => {
    expect(rendererSrc).toContain('this.compositeLight(cam');
  });
});
