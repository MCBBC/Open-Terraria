// 小动物笼族逐族状态机回归（AnimateTiles_CritterCages Main.cs:13452-16536 +
// UpdateOwlCageFrame :16557-16611 + UpdateDragonflyJarFrame :16612-16666）。
// 每族断言 = 原版 for 循环体的可观测性质：值域（= 素材帧行数）、空闲下界
// （rand.Next(a,b) 每 tick 重掷 → counter 必达 a 才可能出招）、出招分支集、
// 段持帧时长与回卷。RNG 按 (族,样式,槽位) 种子化 → 序列确定可重放。
import { describe, it, expect } from 'vitest';
import {
  CAGE_FAMILY, cageFrameOf, cageSlot, cageAnimRate, cageBandOffset, resetCageAnim,
} from '../src/render/CritterCage';
import { DRAW_Y_OFFSET } from '../src/render/VanillaTiler';
import { TILE_BY_KEY } from '../src/data/tiles';

/** 取某 sheet 的完整帧轨迹（每 trace 前清态 → 测试间顺序无关） */
function trace(sheet: number, ticks: number, slot = 0): number[] {
  resetCageAnim();
  const fam = CAGE_FAMILY[sheet];
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) out.push(cageFrameOf(fam, slot, t));
  return out;
}

const within = (a: number[], lo: number, hi: number) => {
  for (const v of a) {
    expect(v, `帧 ${v} 越出 [${lo},${hi}]`).toBeGreaterThanOrEqual(lo);
    expect(v, `帧 ${v} 越出 [${lo},${hi}]`).toBeLessThanOrEqual(hi);
  }
};

describe('笼族新入表：罐/缸族 28 张（TileDrawing.cs:5925-6001）', () => {
  /** (sheet, tiles.ts key, 期望族) */
  const NEW_TILES: Array<[number, string, string]> = [
    [282, 'v_282_fish_bowl', 'fishBowl'],
    [505, 'v_505_gold_fish_bowl', 'fishBowl'],
    [543, 'v_543_pupfish_bowl', 'fishBowl'],
    [598, 'v_598_lava_serpent_bowl', 'lavaFishBowl'],
    [568, 'v_568_pink_fairy_jar', 'fairyJar'],
    [569, 'v_569_green_fairy_jar', 'fairyJar'],
    [570, 'v_570_blue_fairy_jar', 'fairyJar'],
    [521, 'v_521_black_dragonfly_jar', 'dragonfly'],
    [522, 'v_522_blue_dragonfly_jar', 'dragonfly'],
    [523, 'v_523_green_dragonfly_jar', 'dragonfly'],
    [524, 'v_524_orange_dragonfly_jar', 'dragonfly'],
    [525, 'v_525_red_dragonfly_jar', 'dragonfly'],
    [526, 'v_526_yellow_dragonfly_jar', 'dragonfly'],
    [527, 'v_527_gold_dragonfly_jar', 'dragonfly'],
    [316, 'v_316_blue_jellyfish_jar', 'jellyfish'],
    [317, 'v_317_green_jellyfish_jar', 'jellyfish'],
    [318, 'v_318_pink_jellyfish_jar', 'jellyfish'],
    [288, 'v_288_monarch_butterfly_jar', 'butterfly'],
    [289, 'v_289_purple_emperor_butterfly_jar', 'butterfly'],
    [290, 'v_290_red_admiral_butterfly_jar', 'butterfly'],
    [291, 'v_291_ulysses_butterfly_jar', 'butterfly'],
    [292, 'v_292_sulphur_butterfly_jar', 'butterfly'],
    [293, 'v_293_tree_nymph_butterfly_jar', 'butterfly'],
    [294, 'v_294_zebra_swallowtail_butterfly_jar', 'butterfly'],
    [295, 'v_295_julia_butterfly_jar', 'butterfly'],
    [580, 'v_580_hell_butterfly_jar', 'butterfly'],
    [620, 'v_620_prismatic_lacewing_jar', 'butterfly'],
  ];

  it('28 张全部入 CAGE_FAMILY 且 tiles.ts 在库（sheet/key 双向）', () => {
    expect(NEW_TILES).toHaveLength(27);
    for (const [sheet, key, family] of NEW_TILES) {
      expect(CAGE_FAMILY[sheet], `sheet ${sheet}`).toBeDefined();
      expect(CAGE_FAMILY[sheet].family, `sheet ${sheet}`).toBe(family);
      expect(TILE_BY_KEY[key], `tiles.ts 缺 ${key}`).toBeDefined();
      expect(TILE_BY_KEY[key]).toBeGreaterThanOrEqual(0);
    }
  });

  it('样式档 1:1：蝴蝶 = type-288（360/580/620 钉 8）、蜻蜓 = type-521、水母 = type-316、鼻涕虫 0-2',
    () => {
      expect(CAGE_FAMILY[288].style).toBe(0);
      expect(CAGE_FAMILY[295].style).toBe(7);
      expect(CAGE_FAMILY[360].style).toBe(8);
      expect(CAGE_FAMILY[580].style).toBe(8);
      expect(CAGE_FAMILY[620].style).toBe(8);
      for (let s = 521; s <= 527; s++) expect(CAGE_FAMILY[s].style, `蜻蜓 ${s}`).toBe(s - 521);
      for (let s = 316; s <= 318; s++) expect(CAGE_FAMILY[s].style, `水母 ${s}`).toBe(s - 316);
      for (let s = 392; s <= 394; s++) expect(CAGE_FAMILY[s].style, `鼻涕虫 ${s}`).toBe(s - 392);
      // 多维数组维度对账（Main.cs:1549/1555/1597/1629）
      expect(new Set([288, 289, 290, 291, 292, 293, 294, 295, 360].map((s) => CAGE_FAMILY[s].style)).size)
        .toBe(9);   // butterflyCageFrame[9, cageFrames]
      expect(new Set([521, 522, 523, 524, 525, 526, 527].map((s) => CAGE_FAMILY[s].style)).size)
        .toBe(7);   // dragonflyJarFrame[7, cageFrames]
    });

  it('槽位哈希族：水母走 small（:5990-6000），罐缸族走 water（:5929-5989）', () => {
    expect(CAGE_FAMILY[316].slot).toBe('small');
    expect(CAGE_FAMILY[317].slot).toBe('small');
    expect(CAGE_FAMILY[318].slot).toBe('small');
    for (const s of [282, 505, 543, 598, 568, 569, 570, 288, 360, 521, 527]) {
      expect(CAGE_FAMILY[s].slot, `sheet ${s}`).toBe('water');
    }
    // 全部新族无顶盖、36px 帧带
    for (const [s] of NEW_TILES) {
      expect(CAGE_FAMILY[s].lid, `sheet ${s}`).toBe(-1);
      expect(CAGE_FAMILY[s].step, `sheet ${s}`).toBe(36);
    }
  });

  it('tileTop=2 全量（含新增 288-295/316-318/580/620 共 13 张）', () => {
    for (const s of Object.keys(CAGE_FAMILY).map(Number)) {
      expect(DRAW_Y_OFFSET[s], `sheet ${s} 缺 tileTop 2`).toBe(2);
    }
    for (const s of [288, 289, 290, 291, 292, 293, 294, 295, 316, 317, 318, 580, 620]) {
      expect(DRAW_Y_OFFSET[s], `新增 sheet ${s}`).toBe(2);
    }
  });

  it('重烘焙节奏按族（ChunkCache.advanceAnim 消费）', () => {
    expect(cageAnimRate(316)).toBe(4);    // 水母 mode2 rand(4,9)
    expect(cageAnimRate(521)).toBe(4);    // 蜻蜓摆动 counter/4 相位
    expect(cageAnimRate(288)).toBe(3);    // 蝴蝶 rand(3,16) 下界
    expect(cageAnimRate(542)).toBe(10);   // 猫头鹰 counter%40/10
    expect(cageAnimRate(310)).toBe(30);   // 蠕虫 rand(30,91)
    expect(cageAnimRate(710)).toBe(7);    // 河豚 7t 主链
    expect(cageAnimRate(275)).toBe(5);    // 兔 5t 动作段
    expect(cageAnimRate()).toBe(5);       // 缺省回落
  });
});

describe('逐族状态机（Main.cs:13452-16536 直译）', () => {
  it('兔 bunny（:13457-13512）：双空闲 0/11，出招 ∈{1,2,4}，嗅探 2-3 各 10t，11 只能来自 10/12',
    () => {
      const a = trace(275, 20000);
      within(a, 0, 21);
      const first = a.findIndex((v) => v !== 0);
      expect(first).toBeGreaterThanOrEqual(30);        // rand(30,900) 下界
      expect([1, 2, 4]).toContain(a[first]);
      // 嗅探段 2 → 3 各持 10t（:13481-13492）
      const i2 = a.indexOf(2);
      expect(i2).toBeGreaterThan(-1);
      expect(a.slice(i2, i2 + 10).every((v) => v === 2)).toBe(true);
      expect(a[i2 + 10]).toBe(3);
      // 帧 11 是第二空闲帧（持留 rand(30,900)t）——只查【转移点】：进入 11 的前驱
      // 只可能是 10（耳动段尾 ++）或 12（回望段回卷 :13498-13501）
      for (let i = 1; i < a.length; i++) {
        if (a[i] === 11 && a[i - 1] !== 11) expect([10, 12]).toContain(a[i - 1]);
      }
      // 跳跃段 13-21 每 5t 一帧后回 0（:13500-13506）
      const i13 = a.indexOf(13);
      if (i13 > 0) {
        for (let k = 0; k <= 8; k++) expect(a[i13 + k * 5]).toBe(13 + k);
        expect(a[i13 + 45]).toBe(0);
      }
    });

  it('松鼠 squirrel（:13558-13655）：出招 ∈{1,2,4}，尾动 11-12 回卷 4/5 留 11', () => {
    const a = trace(276, 20000);
    within(a, 0, 17);
    const first = a.findIndex((v) => v !== 0);
    expect([1, 2, 4]).toContain(a[first]);
    // 跳跃段 13-17 → 0（:13651-13655）
    const i13 = a.indexOf(13);
    if (i13 > 0) {
      expect(a.slice(i13, i13 + 25).filter((v, k) => k % 5 === 0).every((v) => v >= 13)).toBe(true);
    }
  });

  it('绿头鸭 mallard（:13826-13953）：四空闲 0/4/12/16，出招 ∈{1,4,5}', () => {
    const a = trace(277, 20000);
    within(a, 0, 23);
    expect(a.findIndex((v) => v !== 0)).toBeGreaterThanOrEqual(45);   // rand(45,2700) 下界
    const first = a.findIndex((v) => v !== 0);
    expect([1, 4, 5]).toContain(a[first]);
  });

  it('鸭 duck（:13954-14081）：与 mallard 同构状态机，帧域一致', () => {
    const a = trace(278, 20000);
    within(a, 0, 23);
  });

  it('蹲鸊鷉 grebe（:14082-14151）：帧域 0-27，空闲 rand(300,400) 下界', () => {
    const a = trace(553, 20000);
    within(a, 0, 27);
    expect(a[299]).toBe(0);
    expect(a.findIndex((v) => v !== 0)).toBeLessThan(600);
  });

  it('海鸥 seagull（:14152-14311）：帧域 0-26，空闲 ≥180t；摆头舞相位帧连续', () => {
    const a = trace(554, 30000);
    within(a, 0, 26);
    expect(a[179]).toBe(0);                    // rand(180,250)：counter 必达 180
    expect(a.findIndex((v) => v !== 0)).toBeLessThan(400);
  });

  it('鸟族 bird/blueBird/redBird（:14312/:14448/:14584 同构）：帧域 0-18，出招 ∈{1,2}', () => {
    for (const sheet of [279, 280, 281]) {
      const a = trace(sheet, 20000);
      within(a, 0, 18);
      const first = a.findIndex((v) => v !== 0);
      expect(first, `sheet ${sheet}`).toBeGreaterThanOrEqual(30);
      expect([1, 2]).toContain(a[first]);
    }
  });

  it('鹦鹉 macaw（:14720-14818）：帧域 0-19，空闲 rand(300,2700) 下界，出招 ∈{1,16}', () => {
    const a = trace(632, 30000);
    within(a, 0, 19);
    expect(a[299]).toBe(0);
    const first = a.findIndex((v) => v !== 0);
    expect([1, 16]).toContain(a[first]);
  });

  it('蝎子 scorpion（:14819-14978）：帧域 0-17，空闲 rand(30,3600) 下界', () => {
    const a = trace(296, 20000);
    within(a, 0, 17);
    expect(a[29]).toBe(0);
  });

  it('企鹅 penguin（:14979-15143）：帧域 0-15，出招 ∈{1,2,4,15}', () => {
    const a = trace(309, 20000);
    within(a, 0, 15);
    const first = a.findIndex((v) => v !== 0);
    expect(first).toBeGreaterThanOrEqual(30);
    expect([1, 2, 4, 15]).toContain(a[first]);
  });

  it('龟 turtle（:15144-15173）：帧域 0-32，空闲 rand(180,250)，越 32 回 15', () => {
    const a = trace(550, 30000);
    within(a, 0, 32);
    expect(a[179]).toBe(0);
    expect(a).toContain(15);    // 回卷目标（:15171-15172）
    expect(a).toContain(32);
  });

  it('海马 seahorse（:15174-15214）：帧域 0-33，空闲 rand(220,340) 下界', () => {
    const a = trace(558, 30000);
    within(a, 0, 33);
    expect(a[219]).toBe(0);
  });

  it('河豚 pufferfish（:15215-15415）：帧域 0-70；常态 7t/帧；充气段 ≥41 可达；横带 33 行',
    () => {
      const a = trace(710, 40000);
      within(a, 0, 70);
      // 常态主链：前 7t 恒 0，第 8t 进 1（或 1/75 折跃 41）
      expect(a.slice(0, 7).every((v) => v === 0)).toBe(true);
      expect([1, 41]).toContain(a[7]);
      // 充气段必然到达（每步 1/75，40000t ≈ 5700 步）
      expect(Math.max(...a)).toBeGreaterThanOrEqual(41);
      // 横带分帧（TileDrawing.cs:5840-5843）：列 = floor(f/33) ∈ 0-2、行 = f%33
      for (const f of [0, 1, 32, 33, 40, 41, 65, 66, 70]) {
        const band = cageBandOffset(CAGE_FAMILY[710], f);
        expect(band.row).toBe(f % 33);
        expect(band.dx).toBe(Math.floor(f / 33) * 108);
      }
      expect(cageBandOffset(CAGE_FAMILY[275], 5)).toEqual({ dx: 0, row: 5 });  // 非横带族
    });

  it('蜗牛 snail（:15417-15438）：帧域 0-20，慢爬 rand(45,3600) 下界', () => {
    const a = trace(285, 20000);
    within(a, 0, 20);
    expect(a[44]).toBe(0);
  });

  it('发光蜗牛 snail2（:15490-15562）：同构机、慢爬 rand(30,2700) 下界', () => {
    const a = trace(286, 20000);
    within(a, 0, 20);
    expect(a[29]).toBe(0);
  });

  it('青蛙 frog（:15563-15663）：双空闲帧 0/6，各自出招 {1,12} / {7,18}，帧域 0-23', () => {
    const a = trace(298, 40000);
    within(a, 0, 23);
    expect(a).toContain(6);    // 二段空闲必达（12-17 段 1/3 出逃回 0 后再进 6 链）
    // 空闲 0 的出招只可能是 1（跳）或 12（吞）
    for (let i = 1; i < a.length; i++) {
      if (a[i - 1] === 0 && a[i] !== 0) expect([1, 12]).toContain(a[i]);
    }
    // 空闲 6 的出招只可能是 7 或 18
    for (let i = 1; i < a.length; i++) {
      if (a[i - 1] === 6 && a[i] !== 6) expect([7, 18]).toContain(a[i]);
    }
  });

  it('蝗虫 grasshopper（:15826-15888）：徘徊 0↔1 各 5t，5t 处 1/15 折跃进食', () => {
    const a = trace(339, 20000);
    within(a, 0, 11);
    expect(a[4]).toBe(0);
    expect([1, 2]).toContain(a[5]);
    expect(a).toContain(2);    // 进食段必达（1/15 × 长跑）
  });

  it('老鼠 mouse（:15664-15769）：徘徊 0↔1 各 5t，5t 处 1/15 折跃洗脸 4', () => {
    const a = trace(299, 20000);
    within(a, 0, 19);
    expect(a[4]).toBe(0);
    expect([1, 4]).toContain(a[5]);
  });

  it('蠕虫 worm（:15770-15799）：帧域 0-18，rand(30,91) 节拍 + 1/4 门', () => {
    const a = trace(310, 20000);
    within(a, 0, 18);
    expect(a[29]).toBe(0);
  });

  it('鼻涕虫 slug（:15800-15825）：三样式帧数 24/31/34（392/393/394）', () => {
    for (const [sheet, max] of [[392, 23], [393, 30], [394, 33]] as const) {
      const a = trace(sheet, 20000);
      within(a, 0, max);
      expect(Math.max(...a), `sheet ${sheet} 应跑满 ${max}`).toBe(max);
    }
  });

  it('蛆 maggot（:15889-15925）：帧域 0-23，慢帧 rand(100,140) 下界', () => {
    const a = trace(532, 20000);
    within(a, 0, 23);
    expect(a[99]).toBe(0);
  });

  it('瓢虫 ladybug（:15926-15989）：帧域 0-21', () => {
    const a = trace(538, 20000);
    within(a, 0, 21);
  });

  it('笼鼠 rat（:15990-16096）：帧域 0-16，空闲 rand(40,70) 下界，直立段 12-16 必达', () => {
    const a = trace(533, 30000);
    within(a, 0, 16);
    expect(a[39]).toBe(0);
    expect(Math.max(...a)).toBeGreaterThanOrEqual(12);   // 0 → 12（2/3）后 %90 相位舞
  });

  it('水黾 waterStrider（:16097-16146）：帧域 0-21，空闲 rand(110,210) 下界', () => {
    const a = trace(555, 30000);
    within(a, 0, 21);
    expect(a[109]).toBe(0);
    expect(a).toContain(16);   // 0 的 1/2 折跃目标（:16129-16131）
  });

  it('妖精罐 fairyJar（:16147-16167）：主槽 6t/帧 0-11 循环；槽 1..24 级联派生', () => {
    resetCageAnim();
    const fam = CAGE_FAMILY[568];
    // 主槽：0..5 恒 0，6..11 恒 1（counter>5 推进，:16147-16151）
    expect(cageFrameOf(fam, 0, 5)).toBe(0);
    expect(cageFrameOf(fam, 0, 6)).toBe(1);
    expect(cageFrameOf(fam, 0, 12)).toBe(2);
    expect(cageFrameOf(fam, 0, 71)).toBe(11);
    expect(cageFrameOf(fam, 0, 72)).toBe(0);
    // 派生式（:16152-16167）：+k%12，k%2==0 / k%5==0 / k%8==0 再各 +1，mod 12
    const t = 6 * 40 + 3;   // 主槽帧 40 mod 12 = 4
    const master = cageFrameOf(fam, 0, t);
    expect(master).toBe(4);
    for (let k = 1; k < 25; k++) {
      let want = master + (k % 12);
      if (k % 2 === 0) want++;
      if (k % 5 === 0) want++;
      if (k % 8 === 0) want++;
      expect(cageFrameOf(fam, k, t), `槽 ${k}`).toBe(want % 12);
    }
    // 三张罐共用同一数组（TileDrawing :5945-5953）→ 同槽同帧
    expect(cageFrameOf(CAGE_FAMILY[569], 3, t)).toBe(cageFrameOf(fam, 3, t));
    expect(cageFrameOf(CAGE_FAMILY[570], 3, t)).toBe(cageFrameOf(fam, 3, t));
  });

  it('鱼缸 fishBowl（:16168-16324）：m0 主链 10t/帧 0→10；帧域 0-16', () => {
    const a = trace(282, 30000);
    within(a, 0, 16);
    // m0 确定性前缀：f = floor(t/10)，直到帧 10 的 1/12 折跃（:16298-16311）
    for (let t = 0; t < 100; t++) {
      expect(a[t], `t=${t}`).toBe(Math.floor(t / 10));
    }
    // 静置段 12-13 与舒张段 14-16 必达（长跑）
    expect(a).toContain(12);
  });

  it('熔岩鱼缸 lavaFishBowl（:16325-16337）：帧域 0-26，5-7t/帧匀速回卷', () => {
    const a = trace(598, 40000);
    within(a, 0, 26);
    expect(a[4]).toBe(0);    // counter > 4+rand(3) → 最早第 5t 推进
    for (const f of [0, 13, 26]) expect(a).toContain(f);
  });

  it('蝴蝶 butterfly（:16338-16466）：帧域 0-15，正飞起步 0→1≥3t，上下半帧域 0-7/8-15', () => {
    const a = trace(288, 30000);
    within(a, 0, 15);
    expect(a[2]).toBe(0);    // rand(3,16) 下界：前 3t 恒 0
    for (const f of [0, 1, 2, 3, 4, 5, 6, 7]) expect(a, `帧 ${f}`).toContain(f);
    // 倒飞档（mode ≥10）与翅展域 8-15 长跑必达
    expect(Math.max(...a)).toBeGreaterThanOrEqual(8);
  });

  it('蜻蜓 dragonfly（:16612-16666）：停驻 ≥300t + rand(60) 门起飞 ∈{1,5,9}，帧域 0-12', () => {
    const a = trace(521, 30000);
    within(a, 0, 12);
    for (let t = 0; t < 300; t++) expect(a[t], `停驻 t=${t}`).toBe(0);
    const takeoffAt = a.findIndex((v) => v !== 0);
    expect(takeoffAt).toBeGreaterThanOrEqual(300);         // c>=300 且 rand(60)==0
    expect(takeoffAt).toBeLessThan(300 + 2000);            // 期望 ~360t 内起飞
    expect([1, 5, 9]).toContain(a[takeoffAt]);
    expect(a).toContain(12);   // 摆动段上界
  });

  it('水母 jellyfish（:16467-16536）：帧域 0-9，脉冲段 0-3，收缩链 4-9 必达', () => {
    const a = trace(316, 40000);
    within(a, 0, 9);
    expect(a[9]).toBe(0);    // mode0 rand(10,20) 下界
    for (const f of [0, 1, 2, 3]) expect(a).toContain(f);
    expect(Math.max(...a)).toBeGreaterThanOrEqual(7);   // mode1/2 收缩-快摆链
  });

  it('猫头鹰 owl（:16557-16611）：帧域 0-14，counter%40/10 相位 → 前段帧 0/1', () => {
    const a = trace(542, 8000);
    within(a, 0, 14);
    expect(a[0]).toBe(0);
    // seg0（c<40）：ph = c%40/10，3 钳 1 → 帧只可能是 0/1/2
    for (let t = 0; t < 39; t++) expect(a[t], `t=${t}`).toBeLessThanOrEqual(2);
    expect(new Set(a).size).toBeGreaterThan(1);    // 有推进（非冻结）
  });
});

describe('槽位独立性与确定性', () => {
  it('同族不同槽独立演进、同槽可重放', () => {
    resetCageAnim();
    const fam = CAGE_FAMILY[275];
    const seen = new Set<number>();
    for (let slot = 0; slot < 25; slot++) seen.add(cageFrameOf(fam, slot, 5000));
    expect(seen.size).toBeGreaterThan(1);    // 25 槽不同相位
    expect(cageFrameOf(fam, 3, 900)).toBe(cageFrameOf(fam, 3, 900));
  });

  it('tick 回卷（世界重载）重置帧态', () => {
    resetCageAnim();
    const fam = CAGE_FAMILY[275];
    expect(typeof cageFrameOf(fam, 0, 50000)).toBe('number');
    expect(cageFrameOf(fam, 0, 10)).toBe(0);    // 回卷后从 0 重新开始
  });

  it('water 槽哈希（GetWaterAnimalCageFrame :6636-6639）mod 25', () => {
    for (let x = 0; x < 300; x += 5) {
      for (let y = 0; y < 300; y += 9) {
        const s = cageSlot('water', x, y, 0, 0);
        expect(s).toBe(Math.floor(x / 2) * Math.floor(y / 3) % 25);
      }
    }
    // 2×2 罐族同物体四格同槽（锚还原）
    const slots = [cageSlot('water', 10, 20, 0, 0), cageSlot('water', 11, 20, 18, 0),
      cageSlot('water', 10, 21, 0, 18), cageSlot('water', 11, 21, 18, 18)];
    expect(new Set(slots).size).toBe(1);
  });
});
