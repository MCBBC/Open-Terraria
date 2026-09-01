/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=41, 实指令=6,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_LensFlare(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#1 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#2 op:0x05 */
let tmp2_0 = R[0] * V[0];
let tmp2_1 = R[1] * V[1];
let tmp2_2 = R[2] * V[2];
let tmp2_3 = R[3] * V[3];
R[0] = tmp2_0;
R[1] = tmp2_1;
R[2] = tmp2_2;
R[3] = tmp2_3;
/* inst#3 op:0x01 */
let tmp3_0 = C[0];
let tmp3_1 = C[0];
R[4] = tmp3_0;
R[5] = tmp3_1;
/* inst#4 op:0x42 */
SAM[1](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#5 op:0x05 */
let tmp5_0 = R[0] * R[7];
let tmp5_1 = R[1] * R[7];
let tmp5_2 = R[2] * R[7];
let tmp5_3 = R[3] * R[7];
R[0] = tmp5_0;
R[1] = tmp5_1;
R[2] = tmp5_2;
R[3] = tmp5_3;
/* inst#6 op:0x01 */
let tmp6_0 = R[0];
let tmp6_1 = R[1];
let tmp6_2 = R[2];
let tmp6_3 = R[3];
O[0] = tmp6_0;
O[1] = tmp6_1;
O[2] = tmp6_2;
O[3] = tmp6_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

