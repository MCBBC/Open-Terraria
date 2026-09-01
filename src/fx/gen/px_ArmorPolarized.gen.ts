/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=67, 实指令=11,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorPolarized(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x02 */
let tmp3_0 = R[1] + R[0];
R[0] = tmp3_0;
/* inst#4 op:0x02 */
let tmp4_0 = R[2] + R[0];
R[0] = tmp4_0;
/* inst#5 op:0x04 */
let tmp5_1 = R[0] * (-C[0]) + C[1];
R[1] = tmp5_1;
/* inst#6 op:0x05 */
let tmp6_2 = R[0] * C[2];
R[2] = tmp6_2;
/* inst#7 op:0x04 */
let tmp7_0 = R[0] * C[2] + C[3];
R[0] = tmp7_0;
/* inst#8 op:0x58 */
let tmp8_0 = R[1] >= 0 ? R[2] : R[0];
let tmp8_1 = R[1] >= 0 ? R[2] : R[0];
let tmp8_2 = R[1] >= 0 ? R[2] : R[0];
R[4] = tmp8_0;
R[5] = tmp8_1;
R[6] = tmp8_2;
/* inst#9 op:0x01 */
let tmp9_3 = C[4];
R[7] = tmp9_3;
/* inst#10 op:0x05 */
let tmp10_0 = R[3] * R[4];
let tmp10_1 = R[3] * R[5];
let tmp10_2 = R[3] * R[6];
let tmp10_3 = R[3] * R[7];
R[0] = tmp10_0;
R[1] = tmp10_1;
R[2] = tmp10_2;
R[3] = tmp10_3;
/* inst#11 op:0x05 */
let tmp11_0 = R[0] * V[0];
let tmp11_1 = R[1] * V[1];
let tmp11_2 = R[2] * V[2];
let tmp11_3 = R[3] * V[3];
R[0] = tmp11_0;
R[1] = tmp11_1;
R[2] = tmp11_2;
R[3] = tmp11_3;
/* inst#12 op:0x01 */
let tmp12_0 = R[0];
let tmp12_1 = R[1];
let tmp12_2 = R[2];
let tmp12_3 = R[3];
O[0] = tmp12_0;
O[1] = tmp12_1;
O[2] = tmp12_2;
O[3] = tmp12_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

