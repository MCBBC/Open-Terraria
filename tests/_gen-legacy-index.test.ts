// 迁移锚生成器(vitest 执行——src 内无扩展名 TS 导入需要 vite 解析,裸 node 解不了)。
// 运行:npx vitest run tests/_gen-legacy-index.test.ts
// ★ 时序约束:必须在"删除任何 item() 定义前的最后一次构建"上生成/再生成;
//   items.ts 注册顺序一旦再变,本文件必须重跑(否则 v3 旧档 armor 段回放错位)。
// 产物:src/data/legacyItemIndex.generated.json(index→key 全量)= v3 存档
//       armor/dye/trash/miscEquips/loadouts 裸内部下标的解码表。
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ITEM_DEFS } from '../src/data/items';

describe('legacyItemIndex 迁移锚生成', () => {
  it('导出 index→key 全量快照', () => {
    const keys = ITEM_DEFS.map((d) => d.key);
    writeFileSync(
      new URL('../src/data/legacyItemIndex.generated.json', import.meta.url),
      JSON.stringify(keys),
    );
    // 基线断言:注册表首个为本地键(退役基线锚点);总条数与注册表一致。
    // 快照为裸数组(同键双注册各有下标,按原样记录)
    expect(keys[0]).toBe('dirt_block');
    expect(keys.length).toBe(ITEM_DEFS.length);
    expect(keys.length).toBeGreaterThan(6000);
    const localCount = keys.filter((k) => !k.startsWith('vi_') && !k.startsWith('place_v_')).length;
    // eslint-disable-next-line no-console
    console.log(`legacyItemIndex: ${keys.length} 条导出,本地键 ${localCount} 条(退役基线)`);
  });
});
