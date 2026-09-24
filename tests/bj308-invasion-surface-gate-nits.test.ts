// ★BJ308（红蓝-V1/V2 复审漏修清偿）件 2 + 件 3 判别面：
//  件 2 BJ301 常规入侵显示门补地表门——原版 CheckInvasionProgressDisplay
//    Main.cs:48407 常规组支 `(num2 <= 0 || (!(player.position.Y > worldSurface
//    * 16.0) && invasionType == num2))`：常规入侵要求玩家不在地下（地下+屏内
//    有残留入侵怪 → 原版不显进度条）。本仓 Game.ts 常规分支缺门=多显。
//    地表判定亲读 = position.Y（盒顶 Y）×16 高度对比，非 Zone 旗；worldSurface
//    ≡ w.groundLevel（WorldGen.ts:1154 world.groundLevel = gs.worldSurface）。
//    月事件支同款门（:48402/:48404 两月组）BJ301 已立（彼处取 player.cy 盒心
//    先例）；DD2 支（num2 != -3 || DD2Event.Ongoing）原版无地表门——勿过修。
//    测试 = codeOf 结构锁（bj280/bj301 源码锚范式）+唯一性普查（y 形门仅常规支）。
//  件 3.1 WaveMessage 波次前缀——原版 :48586-48587 invasionProgressWave>0 恒画
//    Game.WaveMessage"Wave {0}: {1}"（arg1 = max≠0 ? (int)(progress*100/max)+"%"
//    : Game.InvasionPoints）；本仓 required>0 时 label=undefined → 渲染端回退
//    「事件名 xx%」缺前缀。文案值 en-US "Wave {0}: {1}" / zh-Hans "第{0}波：{1}"。
//  件 3.2 T3 wave7 kills 截断——DD2Event.cs:1494 `100 - (int)(life/lifeMax*100f)`：
//    先截内积再被 100 减；旧 Math.round(100-r*100) 非整内积差 1 点（r=0.456：
//    原版 55 / round 54）。单元面 = invasionStatus(难度3, wave7, ratio)。
//  件 3.4 drawFpsReadout 显式 textBaseline='top'（与 11b' 标尺读数 :4952 同形）。
//  件 3.5 1456 HitEffect span 终点伪锚勘误——真值终点=:90870（方法体闭括号;
//    :90872 起 CountNPCS,1456/Terraria/NPC.cs 亲读实证）——六处冻结面 90873→90870
//    （extract-gore.mjs 头注+source 串/vanilla-gore.json _meta.source/GorePiece.ts/
//    Enemy.ts/era-guard-family.md）。纯 provenance 面（提取器 bodyEnd 实算不消费）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { invasionStatus, newOldOnesArmyState } from '../src/world/OldOnesArmy';
import { Lang } from '../src/i18n/Lang';

const ROOT = resolve(__dirname, '..');
/** 源码剥行注释后取码面（结构锁只禁代码改动,判定注释含词不误伤） */
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');
const rawOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

beforeAll(async () => {
  await Lang.init('zh-Hans').catch(() => undefined);
});

describe('BJ308 件 2：常规入侵地表门（Main.cs:48407 num2<=0 支 1:1）', () => {
  const game = codeOf('src/core/Game.ts');

  it('常规分支已立地表门：invasionType 守卫后、敌环前，player.y(盒顶)×16 判定', () => {
    const guard = game.indexOf('if (w.invasionType <= 0 || w.invasionSizeStart <= 0) return null;');
    const gate = game.indexOf('if (this.player.y > w.groundLevel * 16) return null;');
    const loop = game.indexOf('INVASION_GROUP[en.vanillaId] === w.invasionType');
    expect(guard).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(guard);        // 门在常规分支守卫之后
    expect(gate).toBeLessThan(loop);            // 门在敌环匹配之前（先门后环）
  });

  it('y 形门全文件唯一（DD2/月事件支不过修——月事件支 BJ301 cy 形先例原样）', () => {
    expect(game.split('if (this.player.y > w.groundLevel * 16) return null;').length - 1).toBe(1);
    expect(game).toContain('this.player.cy <= w.groundLevel * 16');   // 月事件支先例未回退
    expect(game.split('this.player.cy <= w.groundLevel * 16').length - 1).toBe(1);
  });

  it('DD2 支无地表门（原版 `(num2 != -3 || DD2Event.Ongoing)` 无高度判定——防过修）', () => {
    const regular = game.indexOf('if (w.invasionType <= 0 || w.invasionSizeStart <= 0) return null;');
    const dd2 = game.lastIndexOf('if (w.oldOnesArmy.ongoing) {', regular);   // 进度条 IIFE 内 DD2 支
    expect(dd2).toBeGreaterThan(-1);
    const dd2Block = game.slice(dd2, regular);
    expect(dd2Block).not.toContain('groundLevel');
  });
});

describe('BJ308 件 3.2：T3 wave7 kills 截断语义（DD2Event.cs:1494）', () => {
  it('ratio=0.456 → kills=55（100−trunc(45.6)）——旧 Math.round 形态给 54,判别', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 3; st.waveNumber = 7;
    const s = invasionStatus(st, 0.456);
    expect(s.required).toBe(100);
    expect(s.kills).toBe(55);
  });
  it('整内积 ratio=0.5 → 50（两形态同值,语义面不偏移）', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 3; st.waveNumber = 7;
    expect(invasionStatus(st, 0.5).kills).toBe(50);
  });
  it('哨兵波 wave8 折回语义原样（波次折回+胜利演出位,防本次刀波及）', () => {
    const st = newOldOnesArmyState();
    st.ongoingDifficulty = 3; st.waveNumber = 8;
    const s = invasionStatus(st, null, true);
    expect(s.wave).toBe(7); expect(s.kills).toBe(1);
    expect(s.required).toBe(1); expect(s.victoryScene).toBe(true);
  });
});

describe('BJ308 件 3.1：WaveMessage 恒带波次前缀（Main.cs:48586-48587）', () => {
  const game = codeOf('src/core/Game.ts');

  it('月事件支：label 恒 WaveMessage(wave, need>0 ? trunc(pct)% : InvasionPoints)', () => {
    expect(game).toContain("Lang.text('Game.WaveMessage', w.moonEvent.waveNumber");
    expect(game).toContain('Math.trunc(Math.floor(w.moonEvent.waveKills) * 100 / need)');
    // 旧病灶形态（required>0 → label undefined → 渲染端回退无前缀）不得回潮
    expect(game).not.toContain('need > 0 ? undefined : Lang.text');
  });
  it('DD2 支：label 恒 WaveMessage(wave, required>0 ? trunc(pct)% : InvasionPoints)', () => {
    expect(game).toContain("Lang.text('Game.WaveMessage', s.wave");
    expect(game).toContain('Math.trunc(s.kills * 100 / s.required)');
    expect(game).not.toContain('s.required > 0 ? undefined : Lang.text');
  });
  it('文案值对拍：Game.WaveMessage zh-Hans「第{0}波：{1}」（1457 Localization zh-Hans:800 亲读）', () => {
    if (!Lang.loaded) return;   // l10n 资产不可达时跳过（结构锁已锁死代码面）
    expect(Lang.text('Game.WaveMessage')).toBe('第{0}波：{1}');
  });
});

describe('BJ308 件 3.4/3.5：drawFpsReadout 基线钉死 + HitEffect span 终点勘误', () => {
  it('drawFpsReadout 函数体内显式 textBaseline=\'top\'（不依赖外层继承）', () => {
    const r = codeOf('src/render/Renderer.ts');
    const fn = r.indexOf('private drawFpsReadout(');
    expect(fn).toBeGreaterThan(-1);
    const body = r.slice(fn, r.indexOf('\n  private ', fn + 10) === -1 ? fn + 2000 : r.indexOf('\n  private ', fn + 10));
    expect(body).toContain("ctx.textBaseline = 'top'");
  });

  it('冻结面 span 域分账（★BJ329 重锚后）：伪锚 90873 全树绝迹;src 双标面留 1456 span,工具+产物=1457 span', () => {
    // 伪锚形态（90873）绝迹不变；
    const allSites = [
      'tools/extract-gore.mjs',
      'src/data/vanilla-gore.json',
      'src/entities/GorePiece.ts',
      'src/entities/Enemy.ts',
      'docs/era-guard-family.md',
    ];
    for (const p of allSites) {
      expect(/82421-:?90873/.test(rawOf(p)), p).toBe(false);
    }
    // 1456 域 span（:82421-:90870）仍保留在 src 注释双标站（BJ298 双标,BJ329 不动 src 面）；
    for (const p of ['src/entities/GorePiece.ts', 'src/entities/Enemy.ts', 'docs/era-guard-family.md']) {
      expect(/82421-:?90870/.test(rawOf(p)), p).toBe(true);
    }
    // 1457 域 span（:82492-:90939）= 工具头注 + 产物 _meta.source（BJ329 数据面重锚）；
    for (const p of ['tools/extract-gore.mjs', 'src/data/vanilla-gore.json']) {
      expect(/82492-:?90939/.test(rawOf(p)), p).toBe(true);
    }
  });

  it('提取器产物内 1457 span 锚与 vanilla-gore.json _meta.source 同值（工具↔产物 provenance 一致,BJ329）', () => {
    const tool = rawOf('tools/extract-gore.mjs');
    const json = JSON.parse(rawOf('src/data/vanilla-gore.json')) as { _meta?: { source?: string } };
    expect(json._meta?.source).toContain(':82492-:90939');
    expect(tool).toContain(':82492-:90939');
  });
});
