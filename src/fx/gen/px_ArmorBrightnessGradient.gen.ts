/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=91, 实指令=17,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorBrightnessGradient(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x01 */
let tmp3_3 = C[16];
R[7] = tmp3_3;
/* inst#4 op:0x04 */
let tmp4_0 = T[0] * R[7] + (-C[12]);
R[4] = tmp4_0;
/* inst#5 op:0x05 */
let tmp5_0 = R[4] * C[0];
R[4] = sat(tmp5_0);
/* inst#6 op:0x04 */
let tmp6_1 = R[4] * C[21] + C[22];
R[5] = tmp6_1;
/* inst#7 op:0x05 */
let tmp7_0 = R[4] * R[4];
R[4] = tmp7_0;
/* inst#8 op:0x05 */
let tmp8_0 = R[5] * R[4];
R[4] = tmp8_0;
/* inst#9 op:0x04 */
let tmp9_0 = R[4] * C[24] + C[25];
R[4] = tmp9_0;
/* inst#10 op:0x01 */
let tmp10_0 = C[4];
let tmp10_1 = C[5];
let tmp10_2 = C[6];
R[8] = tmp10_0;
R[9] = tmp10_1;
R[10] = tmp10_2;
/* inst#11 op:0x04 */
let tmp11_0 = R[4] * R[8] + C[8];
let tmp11_1 = R[4] * R[9] + C[9];
let tmp11_2 = R[4] * R[10] + C[10];
R[4] = tmp11_0;
R[5] = tmp11_1;
R[6] = tmp11_2;
/* inst#12 op:0x02 */
let tmp12_3 = R[1] + R[0];
R[7] = tmp12_3;
/* inst#13 op:0x02 */
let tmp13_3 = R[2] + R[7];
R[7] = tmp13_3;
/* inst#14 op:0x05 */
let tmp14_3 = R[7] * C[20];
R[7] = tmp14_3;
/* inst#15 op:0x05 */
let tmp15_0 = R[4] * R[7];
let tmp15_1 = R[5] * R[7];
let tmp15_2 = R[6] * R[7];
R[4] = tmp15_0;
R[5] = tmp15_1;
R[6] = tmp15_2;
/* inst#16 op:0x05 */
let tmp16_0 = R[3] * R[4];
let tmp16_1 = R[3] * R[5];
let tmp16_2 = R[3] * R[6];
R[0] = tmp16_0;
R[1] = tmp16_1;
R[2] = tmp16_2;
/* inst#17 op:0x05 */
let tmp17_0 = R[0] * V[0];
let tmp17_1 = R[1] * V[1];
let tmp17_2 = R[2] * V[2];
let tmp17_3 = R[3] * V[3];
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

