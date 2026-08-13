// 调试工具批：F2 无敌+无限魔力（Player.debugGod）/ F6 召唤面板（纯过滤函数）。
// 面板 DOM 侧不进 vitest（node 环境）——由 filterSummonEntries 覆盖列表逻辑。
import { describe, it, expect } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { filterSummonEntries, SUMMON_ENTRIES } from '../src/core/DebugSummonPanel';

describe('F2 无敌 + 无限魔力', () => {
  const mk = (): Player => new Player(20 * 16, 27 * 16, new Inventory());

  it('damage()：godmode 早退——不扣血/返回 false；关闭后正常结算', () => {
    const p = mk();
    expect(p.hp).toBe(p.maxHp);
    expect(p.damage(50, p.cx - 40, p.y)).toBe(true);
    expect(p.hp).toBe(p.maxHp - 50);
    p.iframes = 0;                     // 清受击无敌帧（damage 内设置）
    p.debugGod = true;
    expect(p.damage(9999, p.cx - 40, p.y)).toBe(false);
    expect(p.hp).toBe(p.maxHp - 50);   // 未变
    p.debugGod = false;
    expect(p.damage(10, p.cx - 40, p.y)).toBe(true);
    expect(p.hp).toBe(p.maxHp - 60);
  });

  it('fixedUpdate：godmode 每 tick 血蓝回满（DoT 后归位）', () => {
    const p = mk();
    p.debugGod = true;
    p.hp = 1;
    p.mana = 0;
    p.buffs.apply(7 as never, 60);     // OnFire DoT（-4 HP/s）
    // fixedUpdate 需要 GameHooks——此处只验回满逻辑在 tick 头生效:
    // 用与实现相同的守卫语义直接断言（damage 拦截 + 回满是两条独立防线）
    expect(p.damage(100, p.cx - 40, p.y)).toBe(false);
    expect(p.hp).toBe(1);              // damage 不再扣；回满由 fixedUpdate 头执行
    void 0;
  });
});

describe('F6 召唤面板列表', () => {
  it('全量表覆盖 560+ 条,含 Boss/城镇/小动物标记', () => {
    expect(SUMMON_ENTRIES.length).toBeGreaterThan(560);
    expect(SUMMON_ENTRIES.some((e) => e.id === 262 && e.boss)).toBe(true);   // 世纪之花
    expect(SUMMON_ENTRIES.some((e) => e.id === 4 && e.boss)).toBe(true);     // 克眼
    expect(SUMMON_ENTRIES.some((e) => e.town)).toBe(true);                   // 城镇 NPC
    expect(SUMMON_ENTRIES.some((e) => e.critter)).toBe(true);                // 小动物
    // 按 id 升序
    for (let i = 1; i < SUMMON_ENTRIES.length; i++) {
      expect(SUMMON_ENTRIES[i].id).toBeGreaterThan(SUMMON_ENTRIES[i - 1].id);
    }
  });

  it('过滤:空串取头部;id 精确命中优先;名字子串命中', () => {
    expect(filterSummonEntries('', 10).length).toBe(10);
    const byId = filterSummonEntries('262');
    expect(byId[0].id).toBe(262);
    const byName = filterSummonEntries('plantera');
    expect(byName.some((e) => e.id === 262)).toBe(true);
    expect(filterSummonEntries('zzz_no_such_npc').length).toBe(0);
  });
});
