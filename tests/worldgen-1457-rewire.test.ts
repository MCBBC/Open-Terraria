// 1457 对齐档 2（代码重接线，2026-08-23）接线断言：worldgen 从 1456 硬钉切回
// ../Terarria1457/ 基准后的逐处接线验证。行为面由金标四套承载（caves/shimmer
// 链 76 检查点双种子全绿=JS↔oracle 1457 转录逐位对拍）；本文件锁【接线本体】：
// 掷位删增/池扩/判据族/逃生门/掷序/复线存在性——防止未来回漂时静默。
// 锚：Terarria1457/Terraria/WorldGen.cs（1456 行号以括注保留）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { nextJungleItem } from '../src/world/gen/vanilla/BuriedChestsPass';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const SRC = join(__dirname, '..', 'src', 'world', 'gen', 'vanilla');
const read = (p: string): string => readFileSync(join(SRC, p), 'utf8');

// ★VVVVVV（2026-08-23）双态门配套：worldgen 基准自本批起双态（HellFort/Temple/
// BuriedChests 三文件,缺省 1456=七条 mile8 槽链认证线,SW_MB_1457=1=本文件所锁的
// 1457 对齐档 2 线）。本文件全部断言（结构锁+nextJungleItem 行为锁）锚 1457 形
// ——置门后运行,继续认证 1457 线;1456 线由 mile8 槽链对拍认证（tools/_mile8）。
// 懒读取门（hfIs1457 首次调用 memoize）,此处模块体赋值先于用例执行,生效。
process.env.SW_MB_1457 = '1';

/** 掷计数 RNG（nextJungleItem 掷形断言用）：记录每次掷的界,值恒 0（命中各 1/N 门） */
function countingRng(): { rng: RNG; rolls: string[] } {
  const rolls: string[] = [];
  const rng = {
    int(min: number, max: number): number { rolls.push(`int(${min},${max})`); return min; },
    nextInt(n: number): number { rolls.push(`nextInt(${n})`); return 0; },
    next(): number { rolls.push('next()'); return 0; },
  } as unknown as RNG;
  return { rng, rolls };
}

describe('1457 对齐档 2：BuriedChests 三掷位', () => {
  it('GetNextJungleChestItem 753 首支已删：每次调用恰 1 掷（1456 形是 1-2 掷）', () => {
    // 1457 cs:10164-10176：result=循环四选后 `Next(15)==0→2292 else Next(20)==0→3017`
    // ——恒 1 掷；1456 cs:10147 首分支 Next(50)==0→753 在（命中时 2 掷）
    const gs = { jungleItemIdx: 0 } as GenState;
    for (let i = 0; i < 50; i++) {
      const { rng, rolls } = countingRng();
      nextJungleItem(gs, rng);
      expect(rolls.length).toBe(1);
      expect(rolls[0]).toBe('int(0,14)');   // 首掷=Next(15) 玻璃钢鱼竿门（无 Next(50)）
    }
  });

  it('GetNextJungleChestItem 值域不含 753（2 万抽全落 {211,212,213,964,2292,3017}）', () => {
    const gs = { jungleItemIdx: 0 } as GenState;
    const rng = new RNG(12345);
    const legal = new Set([211, 212, 213, 964, 2292, 3017]);
    for (let i = 0; i < 20000; i++) {
      const v = nextJungleItem(gs, rng);
      expect(legal.has(v)).toBe(true);
    }
    expect(gs.jungleItemIdx).toBe(20000);   // JungleItemCount 记账不变
  });

  it('主件池 Next(7) 七选含 6153 GlacierFang；669 主物门已删（1457 cs:36456）', () => {
    const s = read('BuriedChestsPass.ts');
    expect(s).toContain('[670, 724, 950, 1319, 987, 1579, 6153][rng.nextInt(7)]');
    expect(s).not.toContain('[670, 724, 950, 1319, 987, 1579][rng.nextInt(6)]');
    expect(s).not.toContain('mainId = 669');   // 1456 cs:36126 主物门（1457 删,移箱尾）
  });

  it('尾段 753/669 副物品门复线且序正确：2204→753→2198→669（1457 cs:37771-37784）', () => {
    const s = read('BuriedChestsPass.ts');
    const i2204 = s.indexOf('flags.ivy && rng.int(0, 3) === 0');
    const i753 = s.indexOf('flags.ivy && rng.int(0, 49) === 0) pushItem(753)');
    const i2198 = s.indexOf('flags.ice && rng.int(0, 6) === 0');
    const i669 = s.indexOf('flags.ice && rng.int(0, 49) === 0) pushItem(669)');
    expect(i2204).toBeGreaterThan(-1);
    expect(i753).toBeGreaterThan(i2204);
    expect(i2198).toBeGreaterThan(i753);
    expect(i669).toBeGreaterThan(i2198);
  });
});

describe('1457 对齐档 2：FinalCleanup PlantCheck/case103', () => {
  it('PlantCheck_TryGetNewType 判据族含 61（1457 cs:81889=3|61|110|24;1456 是 3|110|24）', () => {
    const s = read('FinalCleanupPass.ts');
    // spore 判定仍用入口帧（C# 折叠前读 frameX）——整行锁（判据族+入口帧判定一体）
    expect(s).toContain('if (type === 3 || type === 61 || type === 110 || type === 24) spore = nfx === 144;');
  });

  it('PlantCheck spore 回写键=type2（转化后类型;1457 cs:81871-81880;1456 查入口 type）', () => {
    const s = read('FinalCleanupPass.ts');
    expect(s).toContain('if (r.spore) st.frameX[i] = r.type === 201 ? 270 : 144;');
    expect(s).not.toContain('st.frameX[i] = sheet === 201 ? 270 : 144;');
  });

  it('Check2x1 case103 独立支=桌面门【或】AnchorValid(Table) 逃生门（1457 cs:47417-47430）', () => {
    const s = read('FinalCleanupPass.ts');
    const i103 = s.indexOf('if (sheet === 103) {');
    const i29 = s.indexOf('} else if (sheet === 29 || sheet === 462) {');
    expect(i103).toBeGreaterThan(-1);
    expect(i29).toBeGreaterThan(i103);
    // case103 支内：tableGate 拒时还要过 anchorValidTable 逃生门才杀
    const branch = s.slice(i103, i29);
    expect(branch).toContain('tableGate && !anchorValidTable(st, xx, y + 1)');
    expect(branch).not.toContain('solidAllowBottom');   // 103 不走 else 实心支
  });

  it('AnchorValid(Table) 三腿齐备（1457 cs:52294-52340）：平台正帧/solid∩solidTop/tileTable∩blockType0', () => {
    const s = read('FinalCleanupPass.ts');
    expect(s).toContain('function anchorValidTable(');
    expect(s).toContain('} else if (genSolidType(ti) && d && d.platform) return true;');   // tileSolid∩tileSolidTop
    expect(s).toContain('!PLATFORMS.has(sh) && TILE_TABLE.has(sh)');                        // Table 支
    expect(s).toContain('if ((!st.half[i] && n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26)) return true;');   // 平台正帧
  });
});

describe('1457 对齐档 2：HellFort 1457 形（rollback1457/HellFort.1457.ts 即插）', () => {
  it('列界掷序=左翼先（1457 cs:32996-33008;1456 右翼先）', () => {
    const s = read('HellFortPass.ts');
    const iLeft = s.indexOf('colR[1] = colL[2]; colL[1] = colR[1] - rng.int(8, 19)');
    const iRight = s.indexOf('colL[3] = colR[2]; colR[3] = colL[3] + rng.int(8, 19)');
    expect(iLeft).toBeGreaterThan(-1);
    expect(iRight).toBeGreaterThan(iLeft);
  });

  it('翼行=Clamp(Next(10),spanLo,spanHi) 不扩 span（1457 cs:33013/33036）+中央跨 Max/Min 钳（cs:33090-33091）', () => {
    const s = read('HellFortPass.ts');
    expect(s.match(/Math\.max\(spanLo, Math\.min\(spanHi, rng\.int\(0, 9\)\)\)/g)?.length).toBe(2);
    expect(s).toContain('const a = Math.max(spanLo, rng.int(0, 9))');
    expect(s).toContain('const b = Math.min(spanHi, rng.int(0, 9))');
    // 1456 形（翼行直接扩 span）已不在翼环内
    const wing = s.slice(s.indexOf('for (let round = 0; round < 2; round++)'), s.indexOf('// ---- 列合法性'));
    expect(wing).not.toContain('if (r0 < spanLo) spanLo = r0');
  });

  it('门落点走存档 helper：列间/外门=DoorLoop+doorExists 双账本,1/3 门=单发 AttemptDoorAt', () => {
    const s = read('HellFortPass.ts');
    expect(s).toContain("from './rollback1457/HellFort.1457'");
    expect(s.match(/hellFortPlaceDoorLoop\(/g)?.length).toBe(3);   // 列间×1+左外×1+右外×1
    expect(s).toContain('hellFortPlaceDoorLoop(st, rng, { v: needDoor }, doorExists2, rows, c, colR, rowB, wallType, 19)');
    expect(s).toContain('hellFortPlaceDoorLoop(st, rng, { v: needDoor }, doorExists, rows, c, colL, rowB, 0, 19)');
    expect(s).toContain('hellFortPlaceDoorLoop(st, rng, { v: needDoor }, doorExists2, rows, c, colR, rowB, 0, 19)');
    expect(s).toContain('hellFortAttemptDoorAt(st, rng, colR[c], rowB[r], wallType, 19)');
  });

  it('右外门死分支已删（1457 cs:33251-33283）+塌墙阶段在位（cs:33347-33365）', () => {
    const s = read('HellFortPass.ts');
    expect(s).not.toContain('while (flag8)');   // 1456 死分支残骸
    const iRight = s.indexOf('const x = colR[c] + 1;');
    expect(iRight).toBeGreaterThan(-1);          // 右外门预检（colR+1 三格空+无液）
    expect(s).toContain('hellFortCanCrumbleWall(st, rng, -1, c, r, colL, rowT, rowB)');
    expect(s).toContain('hellFortCanCrumbleWall(st, rng, 1, c, r, colR, rowT, rowB)');
    expect(s).toContain('hellFortAttemptCrumbleWall(st, rng, c, r, colL, rowT, rowB)');
  });

  it('存档导出面完整（即插契约）：DoorLoop/AttemptDoorAt/CanCrumble/AttemptCrumble 四 helper', () => {
    const arch = readFileSync(join(SRC, 'rollback1457', 'HellFort.1457.ts'), 'utf8');
    expect(arch).toContain('export function hellFortPlaceDoorLoop(');
    expect(arch).toContain('export function hellFortAttemptDoorAt(');
    expect(arch).toContain('export function hellFortCanCrumbleWall(');
    expect(arch).toContain('export function hellFortAttemptCrumbleWall(');
  });
});

describe('1457 对齐档 2：Temple 砖线 + FinalSeedCleanup 复线', () => {
  it('makeTemple 砖线=GenerateBricks（1457 cs:33864 调用位;rollback1457/TempleBricks.1457.ts 即插）', () => {
    const tp = read('TemplePass.ts');
    expect(tp).toContain("from './rollback1457/TempleBricks.1457'");
    expect(tp).toContain('makeTempleGenerateBricks(st, rooms, depths);');
    expect(tp).not.toContain('templeCorridors1456');   // 1456 全房对连线已退役
    // 深度组记账（1457 cs:33852-33859）：末房 num13+1,换向后 num13++
    expect(tp).toContain('depths.push(n === roomCount - 1 ? depthGroup + 1 : depthGroup);');
    expect(tp).toContain('if (runStep > runLen) { runLen++; runStep = 1; depthGroup++; }');
    const arch = readFileSync(join(SRC, 'rollback1457', 'TempleBricks.1457.ts'), 'utf8');
    expect(arch).toContain('export function makeTempleGenerateBricks(');
  });

  it('FinalSeedCleanup 接线存在且位序正确：vampireSeed 终段之后、残片兜底之前（1457 cs:22666→:692）', () => {
    const wg = readFileSync(join(__dirname, '..', 'src', 'world', 'gen', 'WorldGen.ts'), 'utf8');
    const iImport = wg.indexOf("import { finalSeedCleanup } from './vanilla/FinalSeedCleanupPass'");
    const iVamp = wg.indexOf('vampireSeedFinishPass(ctx);');
    const iFsc = wg.indexOf('finalSeedCleanup(ctx.store, ctx.world.seedFlags ?? {}, world.chests);');
    const iSweep = wg.indexOf('runMultitileFragmentSweepPass(ctx.store);');
    expect(iImport).toBeGreaterThan(-1);
    expect(iFsc).toBeGreaterThan(iVamp);   // 1457 管线序：vampireSeed 终段 → FinalizeSecretSeeds 尾
    expect(iSweep).toBeGreaterThan(iFsc);  // 残片兜底仍在终扫之后
  });

  it('FinalSeedCleanupPass 存档头注已翻「已接线」（KKKKKK DORMANT 备案解除）', () => {
    const s = read('FinalSeedCleanupPass.ts');
    expect(s).toContain('**已接线**');
    expect(s).not.toContain('DORMANT');
  });
});
