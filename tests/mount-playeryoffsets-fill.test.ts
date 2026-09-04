// vanilla-mounts.json playerYOffsets 提取器缺口收偿（2026-09-04 blue-fix，array-fill 型批）。
// 缺口根因：tools/extract-mounts.mjs 旧解析只认字面 `array[i]` 循环变量 + 数字下标
// +=/-=，漏反编译器重命名循环变量（num3..num27）均匀填充、负实参助手代入
// （SetAsMinecart 8-(-10)+(-8)）、直接赋值 array[K]=N、条件增量 if(V==a||…){+=M}、
// `ref int r = ref array[K]; r = r;` no-op——34 个坐骑 playerYOffsets 缺键。
// 修法：提取器换反编译语句微解释器（逐句 1:1），重跑生成（只增不删，既有键
// 逐键对账零漂移，见 tests 同目录对账记录）。
// 真值 = Terarria1457/Terraria/Mount.cs（逐处行号见各断言）。
// 消费面 = Mount.PlayerOffset（:410-425 = playerYOffsets[_frame]，frame≥totalFrames→0）
//   → MountInstance.get playerOffset（Mounts.ts 同门）→ Player.anchorPlayerOffset /
//   mountedCenter（:7318）/ Renderer mOff / Game itemLocation 换算。
import { describe, it, expect } from 'vitest';
import { MOUNT_DATA, MOUNT_COUNT } from '../src/entities/Mounts';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

describe('① array-fill 型 playerYOffsets 数据真值（1457 Mount.cs 逐处实读）', () => {
  it('UFO 7：8×16 均匀填充（:1240-1245 `for num3: array[num3]=16`）', () => {
    expect(MOUNT_DATA['7'].playerYOffsets).toEqual([16, 16, 16, 16, 16, 16, 16, 16]);
  });

  it('Drill 8：1×4（:1297-1301 `for num4: array[num4]=4`）', () => {
    expect(MOUNT_DATA['8'].playerYOffsets).toEqual([4]);
  });

  it('Bee 5：16×12 + 直接赋值 array[8]=18（:1187-1190 fill 16 + :1189 直赋）', () => {
    expect(MOUNT_DATA['5'].playerYOffsets).toEqual([16, 16, 16, 16, 16, 16, 16, 16, 18, 16, 16, 16]);
  });

  it('Santank 46：条件增量档（:2012-2018 fill 4 + if(1|2|7|8) +=2,27 档）', () => {
    expect(MOUNT_DATA['46'].playerYOffsets).toEqual([
      4, 6, 6, 4, 4, 4, 4, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
    ]);
  });

  it('屁股车 51/53：SetAsMinecart(-10,-8) → 8-(-10)+(-8)=10×3（:2770-2776 助手 + :1102/:1110 实参）', () => {
    expect(MOUNT_DATA['51'].playerYOffsets).toEqual([10, 10, 10]);
    expect(MOUNT_DATA['53'].playerYOffsets).toEqual([10, 10, 10]);
  });

  it('Wolf 52（变身坐骑）：零填 + 逐档修正（:2267-2284;`ref int reference=ref array[6/11]` no-op 跳过）', () => {
    expect(MOUNT_DATA['52'].playerYOffsets).toEqual([0, -14, -10, -8, 18, -2, 0, 2, 4, 4, 2, 0, 4, 2, -4]);
  });

  it('WallOfFleshGoat 47：fill 30 + 数字下标 +=（:2061-2069）', () => {
    expect(MOUNT_DATA['47'].playerYOffsets).toEqual([30, 30, 30, 32, 32, 30, 30, 32, 32, 30, 30, 30, 32, 32, 30, 34]);
  });

  it('★既有键零漂移对账：重跑前后逐键恒等（0/15/40/57/62 抽样全量门）', () => {
    expect(MOUNT_DATA['0'].playerYOffsets).toEqual([30, 32, 30, 30, 30, 30, 30, 30, 30, 30, 30, 32]);
    expect(MOUNT_DATA['15'].playerYOffsets).toEqual([8, 8, 8]);
    expect(MOUNT_DATA['40'].playerYOffsets).toEqual([28, 28, 28, 30, 30, 28, 28, 30, 30, 28, 28, 28, 30, 30, 28, 32]);
    expect(MOUNT_DATA['57'].playerYOffsets).toEqual([2]);
    expect(MOUNT_DATA['62'].playerYOffsets).toEqual([10, 10, 10, 10, 12, 16, 12, 10, 12, 16, 16, 14, 10]);
    // 62/63 1457 终值钉（SetAsChillet 非 hardmode 支 :2692-2698;提取器重跑曾回退 1456 值 9/8）
    expect(MOUNT_DATA['62']).toMatchObject({ dashSpeed: 6.5, jumpHeight: 6 });
    expect(MOUNT_DATA['63']).toMatchObject({ dashSpeed: 6.5, jumpHeight: 6 });
  });

  it('全量不变式：66 骑全有 playerYOffsets 且长度 ≡ totalFrames（漂移即爆红）', () => {
    expect(MOUNT_COUNT).toBe(66);
    for (const [id, d] of Object.entries(MOUNT_DATA)) {
      expect(d.playerYOffsets, `mount ${id}`).toBeDefined();
      expect(d.playerYOffsets!.length, `mount ${id}`).toBe(d.totalFrames);
    }
  });
});

describe('② UFO 7 消费面读数（bob/mountedCenter 对齐原版）', () => {
  it('playerOffset 全帧 16;frame≥totalFrames → 0（Mounts.ts 门 ≡ Mount.PlayerOffset :415-423）', () => {
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    expect(p.mount.setMount(7, p)).toBe(true);
    for (let f = 0; f < 8; f++) {
      p.mount.frame = f;
      expect(p.mount.playerOffset).toBe(16);
    }
    p.mount.frame = 8;
    expect(p.mount.playerOffset).toBe(0);
    p.mount.dismount(p);
    expect(p.mount.playerOffset).toBe(0);
  });

  it('mountedCenter = Bottom−21−16（Player.cs mountedCenter 面;Player.ts :7318 消费 anchorPlayerOffset）', () => {
    const p = new Player(60 * 16, 90 * 16, new Inventory());
    p.mount.setMount(7, p);
    const mc = p.mountedCenter;
    expect(mc.x).toBe(p.x + p.w / 2);
    expect(mc.y).toBe(p.y + p.h - 21 - 16);
  });

  it('PlayerOffsetHitbox = −PlayerOffset + heightBoost = −16+16 = 0（:427-436;数据面钉 heightBoost）', () => {
    expect(MOUNT_DATA['7'].heightBoost).toBe(16);
    // 本仓 PlayerOffsetHitbox 消费位 deadCellsBeheadedStep hoc = boost − bob → 0（hover 族盒不浮）
  });
});
