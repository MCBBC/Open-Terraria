/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=137, 实指令=28,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorColoredAndSilverTrimGradient(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x0b */
let tmp3_3 = Math.max(R[1], R[2]);
R[7] = tmp3_3;
/* inst#4 op:0x0b */
let tmp4_3 = Math.max(R[0], R[7]);
R[11] = tmp4_3;
/* inst#5 op:0x0a */
let tmp5_0 = Math.min(R[2], R[1]);
R[4] = tmp5_0;
/* inst#6 op:0x0a */
let tmp6_0 = Math.min(R[4], R[0]);
R[8] = tmp6_0;
/* inst#7 op:0x02 */
let tmp7_0 = R[11] + R[8];
R[4] = tmp7_0;
/* inst#8 op:0x02 */
let tmp8_1 = R[11] + (-R[8]);
R[5] = tmp8_1;
/* inst#9 op:0x05 */
let tmp9_1 = R[5] * C[20];
R[5] = tmp9_1;
/* inst#10 op:0x01 */
let tmp10_0 = C[8];
R[8] = tmp10_0;
/* inst#11 op:0x04 */
let tmp11_1 = R[5] * R[8] + C[12];
R[5] = tmp11_1;
/* inst#12 op:0x05 */
let tmp12_0 = R[4] * C[36];
R[4] = tmp12_0;
/* inst#13 op:0x05 */
let tmp13_0 = R[5] * R[4];
R[4] = tmp13_0;
/* inst#14 op:0x05 */
let tmp14_0 = R[3] * R[4];
R[4] = tmp14_0;
/* inst#15 op:0x01 */
let tmp15_0 = C[28];
R[8] = tmp15_0;
/* inst#16 op:0x04 */
let tmp16_2 = T[0] * R[8] + (-C[24]);
R[6] = tmp16_2;
/* inst#17 op:0x05 */
let tmp17_2 = R[6] * C[0];
R[6] = sat(tmp17_2);
/* inst#18 op:0x04 */
let tmp18_3 = R[6] * C[32] + C[33];
R[7] = tmp18_3;
/* inst#19 op:0x05 */
let tmp19_2 = R[6] * R[6];
R[6] = tmp19_2;
/* inst#20 op:0x05 */
let tmp20_2 = R[7] * R[6];
R[6] = tmp20_2;
/* inst#21 op:0x04 */
let tmp21_2 = R[6] * C[34] + C[35];
R[6] = tmp21_2;
/* inst#22 op:0x01 */
let tmp22_0 = C[4];
let tmp22_1 = C[5];
let tmp22_2 = C[6];
R[8] = tmp22_0;
R[9] = tmp22_1;
R[10] = tmp22_2;
/* inst#23 op:0x04 */
let tmp23_0 = R[6] * R[8] + C[16];
let tmp23_1 = R[6] * R[9] + C[17];
let tmp23_2 = R[6] * R[10] + C[18];
R[8] = tmp23_0;
R[9] = tmp23_1;
R[10] = tmp23_2;
/* inst#24 op:0x05 */
let tmp24_0 = R[0] * R[8];
let tmp24_1 = R[1] * R[9];
let tmp24_2 = R[2] * R[10];
R[8] = tmp24_0;
R[9] = tmp24_1;
R[10] = tmp24_2;
/* inst#25 op:0x04 */
let tmp25_0 = R[4] * C[37] + (-R[8]);
let tmp25_1 = R[4] * C[37] + (-R[9]);
let tmp25_2 = R[4] * C[37] + (-R[10]);
R[12] = tmp25_0;
R[13] = tmp25_1;
R[14] = tmp25_2;
/* inst#26 op:0x04 */
let tmp26_0 = R[5] * R[12] + R[8];
let tmp26_1 = R[5] * R[13] + R[9];
let tmp26_2 = R[5] * R[14] + R[10];
R[0] = tmp26_0;
R[1] = tmp26_1;
R[2] = tmp26_2;
/* inst#27 op:0x0a */
let tmp27_0 = Math.min(R[0], C[38]);
let tmp27_1 = Math.min(R[1], C[38]);
let tmp27_2 = Math.min(R[2], C[38]);
let tmp27_3 = Math.min(R[3], C[38]);
R[4] = tmp27_0;
R[5] = tmp27_1;
R[6] = tmp27_2;
R[7] = tmp27_3;
/* inst#28 op:0x05 */
let tmp28_0 = R[4] * V[0];
let tmp28_1 = R[5] * V[1];
let tmp28_2 = R[6] * V[2];
let tmp28_3 = R[7] * V[3];
R[0] = tmp28_0;
R[1] = tmp28_1;
R[2] = tmp28_2;
R[3] = tmp28_3;
/* inst#29 op:0x01 */
let tmp29_0 = R[0];
let tmp29_1 = R[1];
let tmp29_2 = R[2];
let tmp29_3 = R[3];
O[0] = tmp29_0;
O[1] = tmp29_1;
O[2] = tmp29_2;
O[3] = tmp29_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

