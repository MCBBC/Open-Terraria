// ★BJ318（2026-09-23）：读档 OOM 族错误判别——isOomLoadError 纯谓词单测。
// 背景：用户实报大世界读档炸 `[worldGen worker] Array buffer allocation failed`
// （tab 内存 1.7GB 水位 + worker 读档峰值叠加）。worker 上抛的技术性文案对用户
// 不可操作——mainFlow 两个读档 catch 按本谓词换用自救文案（Toast.LoadOom）。
import { describe, expect, it } from 'vitest';
import { isOomLoadError } from '../src/save/LoadErrors';

describe('isOomLoadError（BJ318 读档 OOM 判别）', () => {
  it('真阳性：V8 分配失败消息族', () => {
    // 用户实测原样消息（worldGen.worker catch 上抛 → WorldGenClient 包装）
    expect(isOomLoadError('[worldGen worker] Array buffer allocation failed')).toBe(true);
    expect(isOomLoadError('Array buffer allocation failed')).toBe(true);
    // V8 其它分配面
    expect(isOomLoadError('Invalid array buffer length')).toBe(true);
    expect(isOomLoadError('RangeError: Invalid typed array length: allocation failed')).toBe(true);
    expect(isOomLoadError('JavaScript heap out of memory')).toBe(true);
    expect(isOomLoadError('Fatal JavaScript out of memory')).toBe(true);
    // 大小写不敏感
    expect(isOomLoadError('ARRAY BUFFER ALLOCATION FAILED')).toBe(true);
  });

  it('真阴性：普通读档失败不误报', () => {
    expect(isOomLoadError('存档数据缺失')).toBe(false);
    expect(isOomLoadError('握手超时')).toBe(false);
    expect(isOomLoadError('读档超时')).toBe(false);
    expect(isOomLoadError('Unexpected token < in JSON')).toBe(false);
    expect(isOomLoadError('data.header.width undefined')).toBe(false);
    // 'oom' 子串陷阱：普通词含 oom 不得命中（World 域TownRooms/世界名等）
    expect(isOomLoadError('townRooms missing')).toBe(false);
    expect(isOomLoadError('world name: Doom')).toBe(false);
  });

  it('边界：空/undefined 串安全', () => {
    expect(isOomLoadError('')).toBe(false);
    expect(isOomLoadError(String(undefined))).toBe(false);
  });
});
