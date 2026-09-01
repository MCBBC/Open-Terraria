/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=194, 实指令=38,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorTwilight(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#4 op:0x01 */
let tmp4_0 = C[20];
let tmp4_1 = C[21];
R[0] = tmp4_0;
R[1] = tmp4_1;
/* inst#5 op:0x04 */
let tmp5_0 = T[0] * R[0] + (-C[16]);
let tmp5_1 = T[1] * R[1] + (-C[17]);
R[0] = tmp5_0;
R[1] = tmp5_1;
/* inst#6 op:0x05 */
let tmp6_2 = R[1] * C[1];
let tmp6_3 = R[0] * C[0];
R[2] = tmp6_2;
R[3] = tmp6_3;
/* inst#7 op:0x01 */
let tmp7_0 = C[0];
let tmp7_1 = C[1];
R[4] = tmp7_0;
R[5] = tmp7_1;
/* inst#8 op:0x04 */
let tmp8_0 = R[0] * R[4] + C[8];
let tmp8_1 = R[1] * R[5] + C[9];
R[0] = tmp8_0;
R[1] = tmp8_1;
/* inst#9 op:0x01 */
let tmp9_0 = C[24];
R[4] = tmp9_0;
/* inst#10 op:0x04 */
let tmp10_0 = R[3] * R[4] + C[4];
let tmp10_1 = R[2] * R[4] + C[5];
R[4] = tmp10_0;
R[5] = tmp10_1;
/* inst#11 op:0x42 */
SAM[1](R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#12 op:0x42 */
SAM[1](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#13 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#14 op:0x02 */
let tmp14_0 = R[0] + C[25];
R[0] = tmp14_0;
/* inst#15 op:0x05 */
let tmp15_0 = R[0] * C[26];
R[0] = sat(tmp15_0);
/* inst#16 op:0x04 */
let tmp16_3 = R[0] * C[32] + C[33];
R[3] = tmp16_3;
/* inst#17 op:0x05 */
let tmp17_0 = R[0] * R[0];
R[0] = tmp17_0;
/* inst#18 op:0x05 */
let tmp18_0 = R[3] * R[0];
R[0] = tmp18_0;
/* inst#19 op:0x05 */
let tmp19_0 = R[0] * C[27];
R[0] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_0 = R[4] * C[30] + R[0];
R[0] = tmp20_0;
/* inst#21 op:0x02 */
let tmp21_0 = R[0] + C[31];
R[0] = tmp21_0;
/* inst#22 op:0x02 */
let tmp22_1 = R[1] + C[34];
R[1] = tmp22_1;
/* inst#23 op:0x02 */
let tmp23_2 = R[2] + C[29];
R[2] = tmp23_2;
/* inst#24 op:0x05 */
let tmp24_2 = R[2] * C[26];
R[2] = sat(tmp24_2);
/* inst#25 op:0x05 */
let tmp25_1 = R[1] * C[35];
R[1] = sat(tmp25_1);
/* inst#26 op:0x04 */
let tmp26_3 = R[1] * C[32] + C[33];
R[3] = tmp26_3;
/* inst#27 op:0x05 */
let tmp27_1 = R[1] * R[1];
R[1] = tmp27_1;
/* inst#28 op:0x05 */
let tmp28_1 = R[3] * R[1];
R[1] = tmp28_1;
/* inst#29 op:0x05 */
let tmp29_1 = R[1] * C[28];
R[1] = tmp29_1;
/* inst#30 op:0x04 */
let tmp30_0 = R[0] * C[12] + R[1];
let tmp30_1 = R[0] * C[13] + R[1];
let tmp30_2 = R[0] * C[14] + R[1];
R[4] = tmp30_0;
R[5] = tmp30_1;
R[6] = tmp30_2;
/* inst#31 op:0x04 */
let tmp31_3 = R[2] * C[32] + C[33];
R[7] = tmp31_3;
/* inst#32 op:0x05 */
let tmp32_0 = R[2] * R[2];
R[0] = tmp32_0;
/* inst#33 op:0x05 */
let tmp33_3 = R[7] * R[0];
R[7] = tmp33_3;
/* inst#34 op:0x04 */
let tmp34_0 = R[7] * (-C[32]) + R[4];
let tmp34_1 = R[7] * (-C[32]) + R[5];
let tmp34_2 = R[7] * (-C[32]) + R[6];
R[0] = tmp34_0;
R[1] = tmp34_1;
R[2] = tmp34_2;
/* inst#35 op:0x02 */
let tmp35_3 = R[9] + R[8];
R[3] = tmp35_3;
/* inst#36 op:0x02 */
let tmp36_3 = R[10] + R[3];
R[3] = tmp36_3;
/* inst#37 op:0x04 */
let tmp37_0 = R[3] * C[36] + R[0];
let tmp37_1 = R[3] * C[36] + R[1];
let tmp37_2 = R[3] * C[36] + R[2];
R[0] = tmp37_0;
R[1] = tmp37_1;
R[2] = tmp37_2;
/* inst#38 op:0x01 */
let tmp38_3 = C[37];
R[3] = tmp38_3;
/* inst#39 op:0x05 */
let tmp39_0 = R[11] * R[0];
let tmp39_1 = R[11] * R[1];
let tmp39_2 = R[11] * R[2];
let tmp39_3 = R[11] * R[3];
R[0] = tmp39_0;
R[1] = tmp39_1;
R[2] = tmp39_2;
R[3] = tmp39_3;
/* inst#40 op:0x05 */
let tmp40_0 = R[0] * V[3];
let tmp40_1 = R[1] * V[3];
let tmp40_2 = R[2] * V[3];
let tmp40_3 = R[3] * V[3];
R[0] = tmp40_0;
R[1] = tmp40_1;
R[2] = tmp40_2;
R[3] = tmp40_3;
/* inst#41 op:0x01 */
let tmp41_0 = R[0];
let tmp41_1 = R[1];
let tmp41_2 = R[2];
let tmp41_3 = R[3];
O[0] = tmp41_0;
O[1] = tmp41_1;
O[2] = tmp41_2;
O[3] = tmp41_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

