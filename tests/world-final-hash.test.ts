// 终态四数组哈希金标门(2026-08-12 世界生成全量审计 Phase 3):
// generateWorld 终态 type/flags/wall/liquid 的 FNV-1a 硬断言——从此任何
// 管线 pass 的无意改动(漏掷骰/改常量/换顺序)都会被确定性抓住,而非等用户
// 肉眼发现「悬空宝石」式的生成期 bug。
//
// 基线再生(有意改动 worldgen 后):
//   UPDATE_GOLDEN=1 npx vitest run tests/world-final-hash.test.ts
// 提交前必须人工确认改动本身是原版 1:1(金标只锁"没变",不锁"对不对")。
// 注意:与 caves-checkpoint 的 C# 位级金标互补——那套锁到 underworld 且逐段,
// 本门锁全管线终态(含 corruption 之后的全部 pass)。
//
// ★2026-08-23 再生(1457 对齐档 2=**1457 基线重冻**)：项目基准切 ../Terarria1457/
//   后 worldgen 从 1456 硬钉整体切回 1457——HellFort 1457 复线(左翼先掷/翼行
//   Clamp(Next(10),3,3)/中央跨 Max-Min 钳/门落点 AttemptToPlaceDoor+doorExists
//   记账/右外门修复/塌墙阶段,helper 即插自 rollback1457/HellFort.1457.ts)/
//   makeTemple 砖线复线(深度组 GenerateBricks,rollback1457/TempleBricks.1457.ts)/
//   BuriedChests 三掷位(753 首支删/669 主物门删/主件池 Next(6)→Next(7) 六选加
//   6153 GlacierFang/尾段 753·669 副物品门复线)/FinalCleanup PlantCheck 判据族
//   补 61+spore 回写按 type2/case103 AnchorValid(Table) 逃生门/FinalSeedCleanup
//   终扫复线(1457 WorldGen.cs:22666→:692)。终态四数组哈希按 **1457 链新基线**
//   重冻(旧值锚 1456 几何,作废)。caves/shimmer 链 C# oracle 金标已同批翻 1457
//   并再生(76 检查点,双种子全绿)——oracle↔JS 双端同态。
//
// ── 旧基线备案(1456 硬钉期,2026-08-21/22 批次) ──
//   9293480:     type 816e0bcf flags 93f048c5 wall 4f89a71f liquid 893afc95
//   1511931452:  type 1e3fcec8 flags 1e64968d wall cedb77a4 liquid dc75ac81
//   （批4 review 的 PlantCheck 61/碗锚/FSC 涂格等修复史见 git/批账,此处不再展开）
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { generateWorld } from '../src/world/gen/WorldGen';
import { fnv1a } from './pass-hash.test';

const GOLDEN_DIR = join(__dirname, 'golden');
const CASES = [
  { seed: '9293480', evil: 0, file: 'world-final-9293480.json' },
  { seed: '1511931452', evil: 1, file: 'world-final-1511931452.json' },
];

// ★VVVVVV（2026-08-23）双态门配套：本文件金标=1457 oracle 再生线（world-final-*.json
// 2026-08-23 03:54,含 FinalSeedCleanup 1457 终扫）——置 SW_MB_1457=1 使 JS 侧走 1457
// 形继续认证该线;1456 线由 mile8 槽链对拍认证（tools/_mile8,缺省 1456）。
process.env.SW_MB_1457 = '1';
describe('终态哈希金标门(全管线)', () => {
  for (const c of CASES) {
    it(`种子 ${c.seed}:generateWorld 终态四数组哈希恒定`, async () => {
      const world = await generateWorld({ width: 4200, height: 1200, seedText: c.seed, evil: c.evil as 0 | 1 });
      const st = world.store;
      const hashes = {
        type: fnv1a(st.type), flags: fnv1a(st.flags),
        wall: fnv1a(st.wall), liquid: fnv1a(st.liquid),
      };
      const path = join(GOLDEN_DIR, c.file);
      if (process.env.UPDATE_GOLDEN === '1') {
        if (!existsSync(GOLDEN_DIR)) mkdirSync(GOLDEN_DIR);
        writeFileSync(path, JSON.stringify({ seed: c.seed, ...hashes }, null, 2));
        console.log(`[world-final-hash] 再生 ${path}`, hashes);
        return;
      }
      expect(existsSync(path), `金标缺失 ${c.file}(先 UPDATE_GOLDEN=1 再生)`).toBe(true);
      const golden = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
      expect(hashes.type).toBe(golden.type);
      expect(hashes.flags).toBe(golden.flags);
      expect(hashes.wall).toBe(golden.wall);
      expect(hashes.liquid).toBe(golden.liquid);
    }, 300000);
  }
});
