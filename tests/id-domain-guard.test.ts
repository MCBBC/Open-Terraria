// id 域纪律守卫 vitest 接线（2026-09-18;BJ150 §6 处方方案 B,grep 臂）。
// 守卫本体=tools/id-domain-guard.mjs（l10n-audit/atlas-lint 同款三消费形态之一:
//   CLI 直跑/node 直跑/vitest 锁定;不挂 vite 插件——编辑 vite.config.ts 会让全部
//   运行中实例各重启一次,项目约定避让）。
// 规则面 IDG-1..5 详见守卫头注;行为面哨兵=tests/id-domain-sentinel.test.ts。
// ★变异证红记录（2026-09-18,均在验证后还原）：
//   ①serialize.ts mapItem 换向 ITEM_INTERNAL_OF_STABLE.get → 本测 IDG-1 红 +
//     sentinel choke1 红;
//   ②SaveFile.ts mapItem 换向 ITEM_STABLE_OF_INTERNAL[裸] → 本测 IDG-2 红 +
//     sentinel choke2 红;
//   ③WldExport 箱侧重接 SW-BO1 旧错(netId=ITEM_INTERNAL_OF_STABLE.get(it.id)) →
//     本测 IDG-1 红 + sentinel choke5/6 红;同一变异下历史件 tests/wld-export.test.ts
//     仍全绿(夹具 stableOf 与错映射同表=自回环恒等掩盖的活体复现)。
import { describe, it, expect } from 'vitest';
import { auditIdDomains } from '../tools/id-domain-guard.mjs';

describe('IDG id 域纪律守卫（grep 臂）', () => {
  it('IDG-1..5+T1..T3 全绿:写向禁加载向表/读向禁写向表/Map 禁括号/联机中立/防空洞锚/tile 域三则', () => {
    const violations = auditIdDomains();
    expect(violations).toEqual([]);
  });
});
