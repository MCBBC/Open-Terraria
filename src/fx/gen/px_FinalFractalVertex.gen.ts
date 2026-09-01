/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=90, 实指令=18,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_FinalFractalVertex(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#1 op:0x04 */
let tmp1_3 = T[0] * C[12] + C[13];
R[3] = tmp1_3;
/* inst#2 op:0x04 */
let tmp2_0 = T[0] * C[4] + C[5];
R[0] = tmp2_0;
/* inst#3 op:0x23 */
let tmp3_1 = Math.abs(R[0]);
R[1] = tmp3_1;
/* inst#4 op:0x13 */
let tmp4_1 = R[1] - Math.floor(R[1]);
R[1] = tmp4_1;
/* inst#5 op:0x58 */
let tmp5_0 = R[0] >= 0 ? R[1] : (-R[1]);
R[4] = tmp5_0;
/* inst#6 op:0x01 */
let tmp6_2 = C[14];
R[2] = tmp6_2;
/* inst#7 op:0x04 */
let tmp7_0 = R[0] * (-C[8]) + R[2];
R[0] = tmp7_0;
/* inst#8 op:0x06 */
let tmp8_1 = 1 / T[2];
R[1] = tmp8_1;
/* inst#9 op:0x05 */
let tmp9_1 = R[1] * T[1];
R[5] = tmp9_1;
/* inst#10 op:0x42 */
SAM[1](R[4], R[5], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#11 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#12 op:0x05 */
let tmp12_0 = R[4] * V[0];
let tmp12_1 = R[4] * V[1];
let tmp12_2 = R[4] * V[2];
let tmp12_3 = R[4] * V[3];
R[4] = tmp12_0;
R[5] = tmp12_1;
R[6] = tmp12_2;
R[7] = tmp12_3;
/* inst#13 op:0x05 */
let tmp13_0 = R[4] * C[0];
let tmp13_1 = R[5] * C[0];
let tmp13_2 = R[6] * C[0];
let tmp13_3 = R[7] * C[0];
R[4] = tmp13_0;
R[5] = tmp13_1;
R[6] = tmp13_2;
R[7] = tmp13_3;
/* inst#14 op:0x02 */
let tmp14_1 = (-R[3]) + R[8];
R[1] = tmp14_1;
/* inst#15 op:0x02 */
let tmp15_1 = R[1] + R[1];
R[1] = sat(tmp15_1);
/* inst#16 op:0x05 */
let tmp16_0 = R[4] * R[1];
let tmp16_1 = R[5] * R[1];
let tmp16_2 = R[6] * R[1];
let tmp16_3 = R[7] * R[1];
R[4] = tmp16_0;
R[5] = tmp16_1;
R[6] = tmp16_2;
R[7] = tmp16_3;
/* inst#17 op:0x05 */
let tmp17_0 = R[0] * R[4];
let tmp17_1 = R[0] * R[5];
let tmp17_2 = R[0] * R[6];
let tmp17_3 = R[0] * R[7];
R[0] = tmp17_0;
R[1] = tmp17_1;
R[2] = tmp17_2;
R[3] = tmp17_3;
/* inst#18 op:0x01 */
let tmp18_0 = R[0];
let tmp18_1 = R[1];
let tmp18_2 = R[2];
let tmp18_3 = R[3];
O[0] = tmp18_0;
O[1] = tmp18_1;
O[2] = tmp18_2;
O[3] = tmp18_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

