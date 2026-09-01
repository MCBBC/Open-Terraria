/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=257, 实指令=47,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorShiftingSands(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#7 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#8 op:0x01 */
let tmp8_0 = C[28];
let tmp8_1 = C[29];
R[4] = tmp8_0;
R[5] = tmp8_1;
/* inst#9 op:0x04 */
let tmp9_2 = T[1] * R[5] + (-C[25]);
R[6] = tmp9_2;
/* inst#10 op:0x05 */
let tmp10_2 = R[6] * C[0];
R[6] = tmp10_2;
/* inst#11 op:0x01 */
let tmp11_3 = C[32];
R[7] = tmp11_3;
/* inst#12 op:0x04 */
let tmp12_2 = R[6] * R[7] + C[4];
R[6] = tmp12_2;
/* inst#13 op:0x04 */
let tmp13_2 = R[6] * C[33] + C[34];
R[6] = tmp13_2;
/* inst#14 op:0x13 */
let tmp14_2 = R[6] - Math.floor(R[6]);
R[6] = tmp14_2;
/* inst#15 op:0x04 */
let tmp15_2 = R[6] * C[36] + C[37];
R[6] = tmp15_2;
/* inst#16 op:0x25 */
R[9] = Math.sin(R[6]);
/* inst#17 op:0x04 */
let tmp17_2 = R[9] * C[34] + C[34];
R[6] = tmp17_2;
/* inst#18 op:0x02 */
let tmp18_3 = R[1] + R[0];
R[7] = tmp18_3;
/* inst#19 op:0x02 */
let tmp19_3 = R[2] + R[7];
R[7] = tmp19_3;
/* inst#20 op:0x05 */
let tmp20_0 = R[7] * C[35];
R[0] = tmp20_0;
/* inst#21 op:0x04 */
let tmp21_0 = R[6] * C[40] + R[0];
R[0] = tmp21_0;
/* inst#22 op:0x04 */
let tmp22_1 = T[0] * R[4] + (-C[24]);
let tmp22_2 = T[1] * R[5] + (-C[25]);
R[1] = tmp22_1;
R[2] = tmp22_2;
/* inst#23 op:0x02 */
let tmp23_1 = R[1] + R[1];
let tmp23_2 = R[2] + R[2];
R[1] = tmp23_1;
R[2] = tmp23_2;
/* inst#24 op:0x04 */
let tmp24_0 = R[1] * C[8] + R[0];
R[0] = tmp24_0;
/* inst#25 op:0x01 */
let tmp25_1 = C[9];
R[5] = tmp25_1;
/* inst#26 op:0x04 */
let tmp26_1 = R[2] * R[5] + C[12];
R[1] = tmp26_1;
/* inst#27 op:0x42 */
SAM[1](R[0], R[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#28 op:0x05 */
let tmp28_0 = R[7] * C[41];
R[0] = tmp28_0;
/* inst#29 op:0x04 */
let tmp29_0 = R[8] * C[42] + R[0];
R[0] = tmp29_0;
/* inst#30 op:0x04 */
let tmp30_1 = R[7] * C[47] + R[8];
R[1] = tmp30_1;
/* inst#31 op:0x04 */
let tmp31_2 = R[7] * C[38] + C[39];
R[2] = tmp31_2;
/* inst#32 op:0x05 */
let tmp32_0 = R[2] * C[20];
let tmp32_1 = R[2] * C[21];
let tmp32_2 = R[2] * C[22];
R[4] = tmp32_0;
R[5] = tmp32_1;
R[6] = tmp32_2;
/* inst#33 op:0x05 */
let tmp33_0 = R[4] * V[0];
let tmp33_1 = R[5] * V[1];
let tmp33_2 = R[6] * V[2];
R[4] = tmp33_0;
R[5] = tmp33_1;
R[6] = tmp33_2;
/* inst#34 op:0x02 */
let tmp34_3 = R[1] + (-C[39]);
R[7] = tmp34_3;
/* inst#35 op:0x05 */
let tmp35_3 = R[7] * C[32];
R[7] = sat(tmp35_3);
/* inst#36 op:0x02 */
let tmp36_0 = R[0] + C[43];
R[0] = tmp36_0;
/* inst#37 op:0x05 */
let tmp37_0 = R[0] * C[44];
R[0] = sat(tmp37_0);
/* inst#38 op:0x04 */
let tmp38_1 = R[0] * C[45] + C[46];
R[1] = tmp38_1;
/* inst#39 op:0x05 */
let tmp39_0 = R[0] * R[0];
R[0] = tmp39_0;
/* inst#40 op:0x05 */
let tmp40_0 = R[1] * R[0];
R[0] = tmp40_0;
/* inst#41 op:0x05 */
let tmp41_0 = V[0] * C[48];
let tmp41_1 = V[1] * C[48];
let tmp41_2 = V[2] * C[48];
R[8] = tmp41_0;
R[9] = tmp41_1;
R[10] = tmp41_2;
/* inst#42 op:0x04 */
let tmp42_0 = V[3] * C[49] + R[8];
let tmp42_1 = V[3] * C[49] + R[9];
let tmp42_2 = V[3] * C[49] + R[10];
R[8] = tmp42_0;
R[9] = tmp42_1;
R[10] = tmp42_2;
/* inst#43 op:0x04 */
let tmp43_0 = C[16] * R[8] + (-R[4]);
let tmp43_1 = C[17] * R[9] + (-R[5]);
let tmp43_2 = C[18] * R[10] + (-R[6]);
R[8] = tmp43_0;
R[9] = tmp43_1;
R[10] = tmp43_2;
/* inst#44 op:0x04 */
let tmp44_0 = R[0] * R[8] + R[4];
let tmp44_1 = R[0] * R[9] + R[5];
let tmp44_2 = R[0] * R[10] + R[6];
R[0] = tmp44_0;
R[1] = tmp44_1;
R[2] = tmp44_2;
/* inst#45 op:0x04 */
let tmp45_0 = R[7] * C[45] + C[46];
R[4] = tmp45_0;
/* inst#46 op:0x05 */
let tmp46_1 = R[7] * R[7];
R[5] = tmp46_1;
/* inst#47 op:0x05 */
let tmp47_0 = R[4] * R[5];
R[4] = tmp47_0;
/* inst#48 op:0x05 */
let tmp48_1 = V[2] * C[50];
let tmp48_2 = V[1] * C[50];
let tmp48_3 = V[0] * C[50];
R[5] = tmp48_1;
R[6] = tmp48_2;
R[7] = tmp48_3;
/* inst#49 op:0x04 */
let tmp49_1 = V[3] * C[42] + R[5];
let tmp49_2 = V[3] * C[42] + R[6];
let tmp49_3 = V[3] * C[42] + R[7];
R[5] = tmp49_1;
R[6] = tmp49_2;
R[7] = tmp49_3;
/* inst#50 op:0x12 */
let tmp50_0 = R[4] * R[7] + (1 - R[4]) * R[0];
let tmp50_1 = R[4] * R[6] + (1 - R[4]) * R[1];
let tmp50_2 = R[4] * R[5] + (1 - R[4]) * R[2];
R[8] = tmp50_0;
R[9] = tmp50_1;
R[10] = tmp50_2;
/* inst#51 op:0x01 */
let tmp51_3 = V[3];
R[11] = tmp51_3;
/* inst#52 op:0x05 */
let tmp52_0 = R[3] * R[8];
let tmp52_1 = R[3] * R[9];
let tmp52_2 = R[3] * R[10];
let tmp52_3 = R[3] * R[11];
R[0] = tmp52_0;
R[1] = tmp52_1;
R[2] = tmp52_2;
R[3] = tmp52_3;
/* inst#53 op:0x01 */
let tmp53_0 = R[0];
let tmp53_1 = R[1];
let tmp53_2 = R[2];
let tmp53_3 = R[3];
O[0] = tmp53_0;
O[1] = tmp53_1;
O[2] = tmp53_2;
O[3] = tmp53_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

