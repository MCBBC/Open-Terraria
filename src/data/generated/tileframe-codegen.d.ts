// tileframe-codegen.js 的类型声明(生成物,勿手改代码;签名见 VanillaFraming.ts 适配层)
export interface FrameTileH {
  bare: boolean;
  type: number;
  fx: number;
  fy: number;
  act(): boolean;
  slope(): number;
  half(): boolean;
  tops(): boolean;
  lefts(): boolean;
  rights(): boolean;
  bots(): boolean;
}
export interface FrameDRV {
  inv(): boolean | undefined;
  cull(dx: number, dy: number): boolean;
  tf(dx: number, dy: number): void;
}
export interface FrameMF { up: boolean; down: boolean; left: boolean; right: boolean }
export declare function makeFrame(TR?: unknown): (
  MF: FrameMF,
  S: Record<string, unknown>,
  SETREF: Record<string, unknown>,
  TM: boolean[][],
  LOC: Record<string, unknown>,
  PRED: Record<string, unknown>,
  DRV: FrameDRV,
  i: number,
  j: number,
  num0: number,
  num60: number,
  vr: number,
  rl: number,
  slp: number,
  hlf: boolean,
  TU: FrameTileH,
  TD: FrameTileH,
  TL: FrameTileH,
  TRt: FrameTileH,
  TUL: FrameTileH,
  TUR: FrameTileH,
  TDL: FrameTileH,
  TDR: FrameTileH,
) => [number, number];
