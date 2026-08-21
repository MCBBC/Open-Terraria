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
// ★2026-08-21 再生(1457 对齐批 4)：HellFort 1457 重构(掷序重分配+翼/中央钳 3+
//   AttemptToPlaceDoor 真实格检查+右外门修复+塌墙阶段)/makeTemple 砖线重做
//   (深度组 DungeonBounds+StrictAngles L 线)/placeTrap_CanContinue 门/冰箱 7 元池+
//   753·669 副物品/GetNextJungleChestItem 删 753 支/FinalSeedCleanup 终扫——
//   终态四数组哈希按 1457 行为重捕(旧值锚 1456 几何,作废)。caves-checkpoint 的
//   1456 C# oracle 金标 underworld 起不再可比,待 1457 oracle 重建。
//
// ★★2026-08-21 二次重捕(批4 review 修复 PlantCheck/碗锚/FSC 涂格)——修 1457 对齐
//   偏差,非行为演进：①PlantCheck isMushroomOrSpore 三项(补 61/入口帧判定/type2==201
//   回写 144↔270,cs:81818-81886)②Check2x1 case103 碗 AnchorValid(Table) 逃生门
//   (cs:47417-47430,碗落平台/solidTop 不再误杀)③FinalSeedCleanup fall-down 分支
//   涂原格(i,j)+canKillTileFSC 补仙人掌80帧门/箱族 CanDestroyChest/锁门·音乐盒支
//   (悬空沙下邻有货箱改走原格静态化,箱格不再被覆盖)④makeTemple Vector2 float32
//   仿真+退化 hitbox 走钳位 setter(本种子无差,备案)⑤HellFort cell InWorld(10) 门/
//   SolidTile 族 inActive 位(现世界尺寸不可达,备案)。
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
