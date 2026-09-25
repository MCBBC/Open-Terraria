// ★BJ341 件1（红·headline，2026-09-25）：BJ336-F3 peekSaveDims 键名锚漂移清偿判别面。
//
// 病灶定谳：peekSaveDims 旧正则 `"w":(\d{1,5}),"h":(\d{1,5})` 对真实存档恒不命中——
// 真实序列化头的键名是 **width/height**（serialize.ts:505 header 投影
// `width: meta.w, height: meta.h`；SaveFile.ts meta 的 w/h 键在落盘前被改名投影，
// 旧注释「name,seed,w,h 落盘序」系锚漂移）。后果：loadFromJson 路 dims 恒 null
// ⇒ 大世界读档超时扩面全死（恒回退 180s 缺省=BJ331 实报慢机误杀同款复发面）。
//
// 判别面（本文件）：
//  ① 真实 serializeSave 产物头部命中（修正后）——变异（回退旧正则）= null 证红；
//  ② 扩面生效：大世界 dims → worldGenTimeoutMs > 180s 缺省（loadFromJson 消费式，
//    8400×2400 封顶 720s 由 bj331 worldGenTimeoutMs 面钉）；
//  ③ 非存档 JSON/损坏头 → null（回退缺省语义保持）+ 字符串值转义引号不误命中。
// 键名安全论证：JSON 字符串值内引号必转义（\"width\":），正则的裸 `"` 只能命中
// 结构性键位；落盘序固定 format,version,header{name,seed,width,height,…} ⇒
// 首个命中即真头（4KB 有界窗内）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { buildSaveParts } from '../src/save/SaveFile';
import { serializeSave } from '../src/save/serialize';
import { peekSaveDims, worldGenTimeoutMs } from '../src/workers/WorldGenClient';

describe('BJ341 件1 peekSaveDims 键名锚（真实 serializeSave 产物）', () => {
  it('大世界存档头命中 width/height（4200×1200）+ 扩面生效', () => {
    const w = new World(4200, 1200, 1, 'bj341');
    const parts = buildSaveParts(w);
    const json = serializeSave(parts.view, parts.meta, parts.player, 0);
    // 真实产物头部键序（format 在首,header 内 name/seed 在前）
    expect(json.startsWith('{"format":"sandboxworld.save"')).toBe(true);
    const headEnd = json.indexOf('"width":');
    expect(headEnd).toBeGreaterThanOrEqual(0);
    expect(headEnd).toBeLessThan(4096);               // 有界窗覆盖头部
    const dims = peekSaveDims(json);
    expect(dims).toEqual({ w: 4200, h: 1200 });
    // loadFromJson 消费式：4200×1200=基准档恰 180s;扩面>缺省另以纯函数面钉
    // （8400×2400 → 面积 ×4 封顶 720s——旧键名锚漂移下 dims=null 恒回退 180s）
    expect(worldGenTimeoutMs(dims!.w, dims!.h)).toBe(180_000);
    expect(worldGenTimeoutMs(8400, 2400)).toBe(720_000);
    expect(720_000).toBeGreaterThan(180_000);
  });

  it('小世界存档头命中（640×480）→ 扩面钳回 180s 基准（clamp 下限）', () => {
    const w = new World(640, 480, 1, 'bj341s');
    const parts = buildSaveParts(w);
    const json = serializeSave(parts.view, parts.meta, parts.player, 0);
    expect(peekSaveDims(json)).toEqual({ w: 640, h: 480 });
    expect(worldGenTimeoutMs(640, 480)).toBe(180_000);
  });

  it('非存档 JSON / 损坏头 → null（回退 180s 缺省语义）', () => {
    expect(peekSaveDims('')).toBeNull();
    expect(peekSaveDims('not json at all')).toBeNull();
    expect(peekSaveDims('{"header":{"name":"x"}}')).toBeNull();
    expect(peekSaveDims('{"header":{"name":"a\\"width\\":9,\\"height\\":9"}}')).toBeNull();
    // 键名对但值缺一 → null（width/height 必须相邻成对）
    expect(peekSaveDims('{"header":{"width":100}}')).toBeNull();
  });
});
