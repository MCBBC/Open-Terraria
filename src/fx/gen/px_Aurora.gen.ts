/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=195, 实指令=40,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_Aurora(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x01 */
let tmp3_1 = C[12];
R[1] = tmp3_1;
/* inst#4 op:0x02 */
let tmp4_2 = T[0] + C[17];
R[2] = tmp4_2;
/* inst#5 op:0x01 */
let tmp5_3 = C[25];
R[3] = tmp5_3;
/* inst#6 op:0x04 */
let tmp6_0 = R[2] * R[3] + C[8];
R[0] = tmp6_0;
/* inst#7 op:0x01 */
let tmp7_3 = C[22];
R[3] = tmp7_3;
/* inst#8 op:0x04 */
let tmp8_0 = R[2] * R[3] + C[0];
R[4] = tmp8_0;
/* inst#9 op:0x06 */
let tmp9_2 = 1 / T[2];
R[2] = tmp9_2;
/* inst#10 op:0x05 */
let tmp10_1 = R[2] * T[1];
R[9] = tmp10_1;
/* inst#11 op:0x01 */
let tmp11_1 = C[4];
R[5] = tmp11_1;
/* inst#12 op:0x01 */
let tmp12_0 = T[0];
R[8] = tmp12_0;
/* inst#13 op:0x42 */
SAM[0](R[0], R[1], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#14 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#15 op:0x42 */
SAM[1](R[8], R[9], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#16 op:0x05 */
let tmp16_0 = R[12] * R[12];
R[0] = tmp16_0;
/* inst#17 op:0x05 */
let tmp17_0 = R[12] * R[0];
R[0] = tmp17_0;
/* inst#18 op:0x04 */
let tmp18_0 = R[0] * (-C[26]) + C[27];
R[0] = sat(tmp18_0);
/* inst#19 op:0x04 */
let tmp19_1 = T[1] * R[2] + C[28];
R[1] = tmp19_1;
/* inst#20 op:0x12 */
let tmp20_1 = R[1] * C[23] + (1 - R[1]) * R[0];
R[5] = tmp20_1;
/* inst#21 op:0x02 */
let tmp21_0 = (-R[5]) + C[23];
R[0] = tmp21_0;
/* inst#22 op:0x04 */
let tmp22_0 = C[17] * R[0] + R[5];
R[0] = tmp22_0;
/* inst#23 op:0x05 */
let tmp23_1 = R[9] * C[17];
R[1] = tmp23_1;
/* inst#24 op:0x12 */
let tmp24_1 = R[1] * C[23] + (1 - R[1]) * R[0];
R[5] = tmp24_1;
/* inst#25 op:0x04 */
let tmp25_0 = R[5] * C[31] + C[28];
R[0] = tmp25_0;
/* inst#26 op:0x05 */
let tmp26_2 = R[4] * R[4];
R[2] = tmp26_2;
/* inst#27 op:0x04 */
let tmp27_2 = R[2] * (-R[2]) + C[23];
R[2] = tmp27_2;
/* inst#28 op:0x0b */
let tmp28_0 = Math.max(R[2], C[24]);
R[4] = tmp28_0;
/* inst#29 op:0x02 */
let tmp29_2 = (-R[4]) + C[23];
R[2] = tmp29_2;
/* inst#30 op:0x04 */
let tmp30_2 = C[17] * R[2] + R[4];
R[2] = tmp30_2;
/* inst#31 op:0x12 */
let tmp31_0 = R[1] * C[23] + (1 - R[1]) * R[2];
R[4] = tmp31_0;
/* inst#32 op:0x04 */
let tmp32_1 = R[4] * C[29] + C[30];
R[1] = tmp32_1;
/* inst#33 op:0x05 */
let tmp33_0 = R[0] * R[1];
R[0] = tmp33_0;
/* inst#34 op:0x05 */
let tmp34_1 = R[9] * C[21];
R[1] = sat(tmp34_1);
/* inst#35 op:0x20 */
R[2] = Math.pow(Math.abs(R[16]), C[20]);
/* inst#36 op:0x05 */
let tmp36_1 = R[1] * R[2];
R[1] = tmp36_1;
/* inst#37 op:0x05 */
let tmp37_0 = R[0] * R[1];
R[0] = tmp37_0;
/* inst#38 op:0x05 */
let tmp38_1 = V[2] * C[16];
let tmp38_2 = V[1] * C[16];
let tmp38_3 = V[0] * C[16];
R[1] = sat(tmp38_1);
R[2] = sat(tmp38_2);
R[3] = sat(tmp38_3);
/* inst#39 op:0x02 */
let tmp39_1 = R[1] + V[2];
let tmp39_2 = R[2] + V[1];
let tmp39_3 = R[3] + V[0];
R[1] = tmp39_1;
R[2] = tmp39_2;
R[3] = tmp39_3;
/* inst#40 op:0x05 */
let tmp40_0 = R[0] * R[3];
let tmp40_1 = R[0] * R[2];
let tmp40_2 = R[0] * R[1];
R[0] = tmp40_0;
R[1] = tmp40_1;
R[2] = tmp40_2;
/* inst#41 op:0x01 */
let tmp41_3 = C[24];
R[3] = tmp41_3;
/* inst#42 op:0x01 */
let tmp42_0 = R[0];
let tmp42_1 = R[1];
let tmp42_2 = R[2];
let tmp42_3 = R[3];
O[0] = tmp42_0;
O[1] = tmp42_1;
O[2] = tmp42_2;
O[3] = tmp42_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

