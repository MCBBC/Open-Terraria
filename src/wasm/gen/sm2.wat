(module
 (type $0 (func (result i32)))
 (type $1 (func (param f64) (result f64)))
 (type $2 (func (param i32) (result i32)))
 (type $3 (func (param i32 i32)))
 (type $4 (func (param i32 i32) (result i32)))
 (type $5 (func (param f64 f64) (result f64)))
 (type $6 (func (param f64 f64 f64 f64 i32 i32)))
 (type $7 (func (param i32 i32 i32 i32 i32)))
 (type $8 (func (param i32 i32 i64)))
 (type $9 (func (param i64) (result i32)))
 (type $10 (func (param i32 i32 i32 f64 f64 f64 f64) (result i32)))
 (type $11 (func (param i32 i32 i32) (result i32)))
 (type $12 (func (result i64)))
 (type $13 (func (param i32 f64 f64) (result i32)))
 (global $src/wasm/sm2.as/tokBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/constBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/outBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/rBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/vBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/oBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/sampOutBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilA (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilB (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilC (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilD (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/nanCell (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texW (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texH (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tokCap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texCap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/outCap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/inited (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/progTable (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/curReadSet (mut i32) (i32.const 0))
 (global $~lib/rt/tlsf/ROOT (mut i32) (i32.const 0))
 (global $~lib/util/math/log_tail (mut f64) (f64.const 0))
 (global $~lib/math/rempio2_y0 (mut f64) (f64.const 0))
 (global $~lib/math/rempio2_y1 (mut f64) (f64.const 0))
 (global $~lib/math/res128_hi (mut i64) (i64.const 0))
 (memory $0 1)
 (data $0 (i32.const 1029) "\a0\f6?")
 (data $0.1 (i32.const 1041) "\c8\b9\f2\82,\d6\bf\80V7($\b4\fa<\00\00\00\00\00\80\f6?")
 (data $0.2 (i32.const 1073) "\08X\bf\bd\d1\d5\bf \f7\e0\d8\08\a5\1c\bd\00\00\00\00\00`\f6?")
 (data $0.3 (i32.const 1105) "XE\17wv\d5\bfmP\b6\d5\a4b#\bd\00\00\00\00\00@\f6?")
 (data $0.4 (i32.const 1137) "\f8-\87\ad\1a\d5\bf\d5g\b0\9e\e4\84\e6\bc\00\00\00\00\00 \f6?")
 (data $0.5 (i32.const 1169) "xw\95_\be\d4\bf\e0>)\93i\1b\04\bd\00\00\00\00\00\00\f6?")
 (data $0.6 (i32.const 1201) "`\1c\c2\8ba\d4\bf\cc\84LH/\d8\13=\00\00\00\00\00\e0\f5?")
 (data $0.7 (i32.const 1233) "\a8\86\860\04\d4\bf:\0b\82\ed\f3B\dc<\00\00\00\00\00\c0\f5?")
 (data $0.8 (i32.const 1265) "HiUL\a6\d3\bf`\94Q\86\c6\b1 =\00\00\00\00\00\a0\f5?")
 (data $0.9 (i32.const 1297) "\80\98\9a\ddG\d3\bf\92\80\c5\d4MY%=\00\00\00\00\00\80\f5?")
 (data $0.10 (i32.const 1329) " \e1\ba\e2\e8\d2\bf\d8+\b7\99\1e{&=\00\00\00\00\00`\f5?")
 (data $0.11 (i32.const 1361) "\88\de\13Z\89\d2\bf?\b0\cf\b6\14\ca\15=\00\00\00\00\00`\f5?")
 (data $0.12 (i32.const 1393) "\88\de\13Z\89\d2\bf?\b0\cf\b6\14\ca\15=\00\00\00\00\00@\f5?")
 (data $0.13 (i32.const 1425) "x\cf\fbA)\d2\bfv\daS($Z\16\bd\00\00\00\00\00 \f5?")
 (data $0.14 (i32.const 1457) "\98i\c1\98\c8\d1\bf\04T\e7h\bc\af\1f\bd\00\00\00\00\00\00\f5?")
 (data $0.15 (i32.const 1489) "\a8\ab\ab\\g\d1\bf\f0\a8\823\c6\1f\1f=\00\00\00\00\00\e0\f4?")
 (data $0.16 (i32.const 1521) "H\ae\f9\8b\05\d1\bffZ\05\fd\c4\a8&\bd\00\00\00\00\00\c0\f4?")
 (data $0.17 (i32.const 1553) "\90s\e2$\a3\d0\bf\0e\03\f4~\eek\0c\bd\00\00\00\00\00\a0\f4?")
 (data $0.18 (i32.const 1585) "\d0\b4\94%@\d0\bf\7f-\f4\9e\b86\f0\bc\00\00\00\00\00\a0\f4?")
 (data $0.19 (i32.const 1617) "\d0\b4\94%@\d0\bf\7f-\f4\9e\b86\f0\bc\00\00\00\00\00\80\f4?")
 (data $0.20 (i32.const 1649) "@^m\18\b9\cf\bf\87<\99\ab*W\r=\00\00\00\00\00`\f4?")
 (data $0.21 (i32.const 1681) "`\dc\cb\ad\f0\ce\bf$\af\86\9c\b7&+=\00\00\00\00\00@\f4?")
 (data $0.22 (i32.const 1713) "\f0*n\07\'\ce\bf\10\ff?TO/\17\bd\00\00\00\00\00 \f4?")
 (data $0.23 (i32.const 1745) "\c0Ok!\\\cd\bf\1bh\ca\bb\91\ba!=\00\00\00\00\00\00\f4?")
 (data $0.24 (i32.const 1777) "\a0\9a\c7\f7\8f\cc\bf4\84\9fhOy\'=\00\00\00\00\00\00\f4?")
 (data $0.25 (i32.const 1809) "\a0\9a\c7\f7\8f\cc\bf4\84\9fhOy\'=\00\00\00\00\00\e0\f3?")
 (data $0.26 (i32.const 1841) "\90-t\86\c2\cb\bf\8f\b7\8b1\b0N\19=\00\00\00\00\00\c0\f3?")
 (data $0.27 (i32.const 1873) "\c0\80N\c9\f3\ca\bff\90\cd?cN\ba<\00\00\00\00\00\a0\f3?")
 (data $0.28 (i32.const 1905) "\b0\e2\1f\bc#\ca\bf\ea\c1F\dcd\8c%\bd\00\00\00\00\00\a0\f3?")
 (data $0.29 (i32.const 1937) "\b0\e2\1f\bc#\ca\bf\ea\c1F\dcd\8c%\bd\00\00\00\00\00\80\f3?")
 (data $0.30 (i32.const 1969) "P\f4\9cZR\c9\bf\e3\d4\c1\04\d9\d1*\bd\00\00\00\00\00`\f3?")
 (data $0.31 (i32.const 2001) "\d0 e\a0\7f\c8\bf\t\fa\db\7f\bf\bd+=\00\00\00\00\00@\f3?")
 (data $0.32 (i32.const 2033) "\e0\10\02\89\ab\c7\bfXJSr\90\db+=\00\00\00\00\00@\f3?")
 (data $0.33 (i32.const 2065) "\e0\10\02\89\ab\c7\bfXJSr\90\db+=\00\00\00\00\00 \f3?")
 (data $0.34 (i32.const 2097) "\d0\19\e7\0f\d6\c6\bff\e2\b2\a3j\e4\10\bd\00\00\00\00\00\00\f3?")
 (data $0.35 (i32.const 2129) "\90\a7p0\ff\c5\bf9P\10\9fC\9e\1e\bd\00\00\00\00\00\00\f3?")
 (data $0.36 (i32.const 2161) "\90\a7p0\ff\c5\bf9P\10\9fC\9e\1e\bd\00\00\00\00\00\e0\f2?")
 (data $0.37 (i32.const 2193) "\b0\a1\e3\e5&\c5\bf\8f[\07\90\8b\de \bd\00\00\00\00\00\c0\f2?")
 (data $0.38 (i32.const 2225) "\80\cbl+M\c4\bf<x5a\c1\0c\17=\00\00\00\00\00\c0\f2?")
 (data $0.39 (i32.const 2257) "\80\cbl+M\c4\bf<x5a\c1\0c\17=\00\00\00\00\00\a0\f2?")
 (data $0.40 (i32.const 2289) "\90\1e \fcq\c3\bf:T\'M\86x\f1<\00\00\00\00\00\80\f2?")
 (data $0.41 (i32.const 2321) "\f0\1f\f8R\95\c2\bf\08\c4q\170\8d$\bd\00\00\00\00\00`\f2?")
 (data $0.42 (i32.const 2353) "`/\d5*\b7\c1\bf\96\a3\11\18\a4\80.\bd\00\00\00\00\00`\f2?")
 (data $0.43 (i32.const 2385) "`/\d5*\b7\c1\bf\96\a3\11\18\a4\80.\bd\00\00\00\00\00@\f2?")
 (data $0.44 (i32.const 2417) "\90\d0|~\d7\c0\bf\f4[\e8\88\96i\n=\00\00\00\00\00@\f2?")
 (data $0.45 (i32.const 2449) "\90\d0|~\d7\c0\bf\f4[\e8\88\96i\n=\00\00\00\00\00 \f2?")
 (data $0.46 (i32.const 2481) "\e0\db1\91\ec\bf\bf\f23\a3\\Tu%\bd\00\00\00\00\00\00\f2?")
 (data $0.47 (i32.const 2514) "+n\07\'\be\bf<\00\f0*,4*=\00\00\00\00\00\00\f2?")
 (data $0.48 (i32.const 2546) "+n\07\'\be\bf<\00\f0*,4*=\00\00\00\00\00\e0\f1?")
 (data $0.49 (i32.const 2577) "\c0[\8fT^\bc\bf\06\be_XW\0c\1d\bd\00\00\00\00\00\c0\f1?")
 (data $0.50 (i32.const 2609) "\e0J:m\92\ba\bf\c8\aa[\e859%=\00\00\00\00\00\c0\f1?")
 (data $0.51 (i32.const 2641) "\e0J:m\92\ba\bf\c8\aa[\e859%=\00\00\00\00\00\a0\f1?")
 (data $0.52 (i32.const 2673) "\a01\d6E\c3\b8\bfhV/M)|\13=\00\00\00\00\00\a0\f1?")
 (data $0.53 (i32.const 2705) "\a01\d6E\c3\b8\bfhV/M)|\13=\00\00\00\00\00\80\f1?")
 (data $0.54 (i32.const 2737) "`\e5\8a\d2\f0\b6\bf\das3\c97\97&\bd\00\00\00\00\00`\f1?")
 (data $0.55 (i32.const 2769) " \06?\07\1b\b5\bfW^\c6a[\02\1f=\00\00\00\00\00`\f1?")
 (data $0.56 (i32.const 2801) " \06?\07\1b\b5\bfW^\c6a[\02\1f=\00\00\00\00\00@\f1?")
 (data $0.57 (i32.const 2833) "\e0\1b\96\d7A\b3\bf\df\13\f9\cc\da^,=\00\00\00\00\00@\f1?")
 (data $0.58 (i32.const 2865) "\e0\1b\96\d7A\b3\bf\df\13\f9\cc\da^,=\00\00\00\00\00 \f1?")
 (data $0.59 (i32.const 2897) "\80\a3\ee6e\b1\bf\t\a3\8fv^|\14=\00\00\00\00\00\00\f1?")
 (data $0.60 (i32.const 2929) "\80\11\c00\n\af\bf\91\8e6\83\9eY-=\00\00\00\00\00\00\f1?")
 (data $0.61 (i32.const 2961) "\80\11\c00\n\af\bf\91\8e6\83\9eY-=\00\00\00\00\00\e0\f0?")
 (data $0.62 (i32.const 2993) "\80\19q\ddB\ab\bfLp\d6\e5z\82\1c=\00\00\00\00\00\e0\f0?")
 (data $0.63 (i32.const 3025) "\80\19q\ddB\ab\bfLp\d6\e5z\82\1c=\00\00\00\00\00\c0\f0?")
 (data $0.64 (i32.const 3057) "\c02\f6Xt\a7\bf\ee\a1\f24F\fc,\bd\00\00\00\00\00\c0\f0?")
 (data $0.65 (i32.const 3089) "\c02\f6Xt\a7\bf\ee\a1\f24F\fc,\bd\00\00\00\00\00\a0\f0?")
 (data $0.66 (i32.const 3121) "\c0\fe\b9\87\9e\a3\bf\aa\fe&\f5\b7\02\f5<\00\00\00\00\00\a0\f0?")
 (data $0.67 (i32.const 3153) "\c0\fe\b9\87\9e\a3\bf\aa\fe&\f5\b7\02\f5<\00\00\00\00\00\80\f0?")
 (data $0.68 (i32.const 3186) "x\0e\9b\82\9f\bf\e4\t~|&\80)\bd\00\00\00\00\00\80\f0?")
 (data $0.69 (i32.const 3218) "x\0e\9b\82\9f\bf\e4\t~|&\80)\bd\00\00\00\00\00`\f0?")
 (data $0.70 (i32.const 3249) "\80\d5\07\1b\b9\97\bf9\a6\fa\93T\8d(\bd\00\00\00\00\00@\f0?")
 (data $0.71 (i32.const 3282) "\fc\b0\a8\c0\8f\bf\9c\a6\d3\f6|\1e\df\bc\00\00\00\00\00@\f0?")
 (data $0.72 (i32.const 3314) "\fc\b0\a8\c0\8f\bf\9c\a6\d3\f6|\1e\df\bc\00\00\00\00\00 \f0?")
 (data $0.73 (i32.const 3346) "\10k*\e0\7f\bf\e4@\da\r?\e2\19\bd\00\00\00\00\00 \f0?")
 (data $0.74 (i32.const 3378) "\10k*\e0\7f\bf\e4@\da\r?\e2\19\bd\00\00\00\00\00\00\f0?")
 (data $0.75 (i32.const 3430) "\f0?")
 (data $0.76 (i32.const 3461) "\c0\ef?")
 (data $0.77 (i32.const 3474) "\89u\15\10\80?\e8+\9d\99k\c7\10\bd\00\00\00\00\00\80\ef?")
 (data $0.78 (i32.const 3505) "\80\93XV \90?\d2\f7\e2\06[\dc#\bd\00\00\00\00\00@\ef?")
 (data $0.79 (i32.const 3538) "\c9(%I\98?4\0cZ2\ba\a0*\bd\00\00\00\00\00\00\ef?")
 (data $0.80 (i32.const 3569) "@\e7\89]A\a0?S\d7\f1\\\c0\11\01=\00\00\00\00\00\c0\ee?")
 (data $0.81 (i32.const 3602) ".\d4\aef\a4?(\fd\bdus\16,\bd\00\00\00\00\00\80\ee?")
 (data $0.82 (i32.const 3633) "\c0\9f\14\aa\94\a8?}&Z\d0\95y\19\bd\00\00\00\00\00@\ee?")
 (data $0.83 (i32.const 3665) "\c0\dd\cds\cb\ac?\07(\d8G\f2h\1a\bd\00\00\00\00\00 \ee?")
 (data $0.84 (i32.const 3697) "\c0\06\c01\ea\ae?{;\c9O>\11\0e\bd\00\00\00\00\00\e0\ed?")
 (data $0.85 (i32.const 3729) "`F\d1;\97\b1?\9b\9e\rV]2%\bd\00\00\00\00\00\a0\ed?")
 (data $0.86 (i32.const 3761) "\e0\d1\a7\f5\bd\b3?\d7N\db\a5^\c8,=\00\00\00\00\00`\ed?")
 (data $0.87 (i32.const 3793) "\a0\97MZ\e9\b5?\1e\1d]<\06i,\bd\00\00\00\00\00@\ed?")
 (data $0.88 (i32.const 3825) "\c0\ea\n\d3\00\b7?2\ed\9d\a9\8d\1e\ec<\00\00\00\00\00\00\ed?")
 (data $0.89 (i32.const 3857) "@Y]^3\b9?\daG\bd:\\\11#=\00\00\00\00\00\c0\ec?")
 (data $0.90 (i32.const 3889) "`\ad\8d\c8j\bb?\e5h\f7+\80\90\13\bd\00\00\00\00\00\a0\ec?")
 (data $0.91 (i32.const 3921) "@\bc\01X\88\bc?\d3\acZ\c6\d1F&=\00\00\00\00\00`\ec?")
 (data $0.92 (i32.const 3953) " \n\839\c7\be?\e0E\e6\afh\c0-\bd\00\00\00\00\00@\ec?")
 (data $0.93 (i32.const 3985) "\e0\db9\91\e8\bf?\fd\n\a1O\d64%\bd\00\00\00\00\00\00\ec?")
 (data $0.94 (i32.const 4017) "\e0\'\82\8e\17\c1?\f2\07-\cex\ef!=\00\00\00\00\00\e0\eb?")
 (data $0.95 (i32.const 4049) "\f0#~+\aa\c1?4\998D\8e\a7,=\00\00\00\00\00\a0\eb?")
 (data $0.96 (i32.const 4081) "\80\86\0ca\d1\c2?\a1\b4\81\cbl\9d\03=\00\00\00\00\00\80\eb?")
 (data $0.97 (i32.const 4113) "\90\15\b0\fce\c3?\89rK#\a8/\c6<\00\00\00\00\00@\eb?")
 (data $0.98 (i32.const 4145) "\b03\83=\91\c4?x\b6\fdTy\83%=\00\00\00\00\00 \eb?")
 (data $0.99 (i32.const 4177) "\b0\a1\e4\e5\'\c5?\c7}i\e5\e83&=\00\00\00\00\00\e0\ea?")
 (data $0.100 (i32.const 4209) "\10\8c\beNW\c6?x.<,\8b\cf\19=\00\00\00\00\00\c0\ea?")
 (data $0.101 (i32.const 4241) "pu\8b\12\f0\c6?\e1!\9c\e5\8d\11%\bd\00\00\00\00\00\a0\ea?")
 (data $0.102 (i32.const 4273) "PD\85\8d\89\c7?\05C\91p\10f\1c\bd\00\00\00\00\00`\ea?")
 (data $0.103 (i32.const 4306) "9\eb\af\be\c8?\d1,\e9\aaT=\07\bd\00\00\00\00\00@\ea?")
 (data $0.104 (i32.const 4338) "\f7\dcZZ\c9?o\ff\a0X(\f2\07=\00\00\00\00\00\00\ea?")
 (data $0.105 (i32.const 4369) "\e0\8a<\ed\93\ca?i!VPCr(\bd\00\00\00\00\00\e0\e9?")
 (data $0.106 (i32.const 4401) "\d0[W\d81\cb?\aa\e1\acN\8d5\0c\bd\00\00\00\00\00\c0\e9?")
 (data $0.107 (i32.const 4433) "\e0;8\87\d0\cb?\b6\12TY\c4K-\bd\00\00\00\00\00\a0\e9?")
 (data $0.108 (i32.const 4465) "\10\f0\c6\fbo\cc?\d2+\96\c5r\ec\f1\bc\00\00\00\00\00`\e9?")
 (data $0.109 (i32.const 4497) "\90\d4\b0=\b1\cd?5\b0\15\f7*\ff*\bd\00\00\00\00\00@\e9?")
 (data $0.110 (i32.const 4529) "\10\e7\ff\0eS\ce?0\f4A`\'\12\c2<\00\00\00\00\00 \e9?")
 (data $0.111 (i32.const 4562) "\dd\e4\ad\f5\ce?\11\8e\bbe\15!\ca\bc\00\00\00\00\00\00\e9?")
 (data $0.112 (i32.const 4593) "\b0\b3l\1c\99\cf?0\df\0c\ca\ec\cb\1b=\00\00\00\00\00\c0\e8?")
 (data $0.113 (i32.const 4625) "XM`8q\d0?\91N\ed\16\db\9c\f8<\00\00\00\00\00\a0\e8?")
 (data $0.114 (i32.const 4657) "`ag-\c4\d0?\e9\ea<\16\8b\18\'=\00\00\00\00\00\80\e8?")
 (data $0.115 (i32.const 4689) "\e8\'\82\8e\17\d1?\1c\f0\a5c\0e!,\bd\00\00\00\00\00`\e8?")
 (data $0.116 (i32.const 4721) "\f8\ac\cb\\k\d1?\81\16\a5\f7\cd\9a+=\00\00\00\00\00@\e8?")
 (data $0.117 (i32.const 4753) "hZc\99\bf\d1?\b7\bdGQ\ed\a6,=\00\00\00\00\00 \e8?")
 (data $0.118 (i32.const 4785) "\b8\0emE\14\d2?\ea\baF\ba\de\87\n=\00\00\00\00\00\e0\e7?")
 (data $0.119 (i32.const 4817) "\90\dc|\f0\be\d2?\f4\04PJ\fa\9c*=\00\00\00\00\00\c0\e7?")
 (data $0.120 (i32.const 4849) "`\d3\e1\f1\14\d3?\b8<!\d3z\e2(\bd\00\00\00\00\00\a0\e7?")
 (data $0.121 (i32.const 4881) "\10\bevgk\d3?\c8w\f1\b0\cdn\11=\00\00\00\00\00\80\e7?")
 (data $0.122 (i32.const 4913) "03wR\c2\d3?\\\bd\06\b6T;\18=\00\00\00\00\00`\e7?")
 (data $0.123 (i32.const 4945) "\e8\d5#\b4\19\d4?\9d\e0\90\ec6\e4\08=\00\00\00\00\00@\e7?")
 (data $0.124 (i32.const 4977) "\c8q\c2\8dq\d4?u\d6g\t\ce\'/\bd\00\00\00\00\00 \e7?")
 (data $0.125 (i32.const 5009) "0\17\9e\e0\c9\d4?\a4\d8\n\1b\89 .\bd\00\00\00\00\00\00\e7?")
 (data $0.126 (i32.const 5041) "\a08\07\ae\"\d5?Y\c7d\81p\be.=\00\00\00\00\00\e0\e6?")
 (data $0.127 (i32.const 5073) "\d0\c8S\f7{\d5?\ef@]\ee\ed\ad\1f=\00\00\00\00\00\c0\e6?")
 (data $0.128 (i32.const 5105) "`Y\df\bd\d5\d5?\dce\a4\08*\0b\n\bd")
 (data $1 (i32.const 5134) "\f0?n\bf\88\1aO;\9b<53\fb\a9=\f6\ef?]\dc\d8\9c\13`q\bca\80w>\9a\ec\ef?\d1f\87\10z^\90\bc\85\7fn\e8\15\e3\ef?\13\f6g5R\d2\8c<t\85\15\d3\b0\d9\ef?\fa\8e\f9#\80\ce\8b\bc\de\f6\dd)k\d0\ef?a\c8\e6aN\f7`<\c8\9bu\18E\c7\ef?\99\d33[\e4\a3\90<\83\f3\c6\ca>\be\ef?m{\83]\a6\9a\97<\0f\89\f9lX\b5\ef?\fc\ef\fd\92\1a\b5\8e<\f7Gr+\92\ac\ef?\d1\9c/p=\be><\a2\d1\d32\ec\a3\ef?\0bn\90\894\03j\bc\1b\d3\fe\aff\9b\ef?\0e\bd/*RV\95\bcQ[\12\d0\01\93\ef?U\eaN\8c\ef\80P\bc\cc1l\c0\bd\8a\ef?\16\f4\d5\b9#\c9\91\bc\e0-\a9\ae\9a\82\ef?\afU\\\e9\e3\d3\80<Q\8e\a5\c8\98z\ef?H\93\a5\ea\15\1b\80\bc{Q}<\b8r\ef?=2\deU\f0\1f\8f\bc\ea\8d\8c8\f9j\ef?\bfS\13?\8c\89\8b<u\cbo\eb[c\ef?&\eb\11v\9c\d9\96\bc\d4\\\04\84\e0[\ef?`/:>\f7\ec\9a<\aa\b9h1\87T\ef?\9d8\86\cb\82\e7\8f\bc\1d\d9\fc\"PM\ef?\8d\c3\a6DAo\8a<\d6\8cb\88;F\ef?}\04\e4\b0\05z\80<\96\dc}\91I?\ef?\94\a8\a8\e3\fd\8e\96<8bunz8\ef?}Ht\f2\18^\87<?\a6\b2O\ce1\ef?\f2\e7\1f\98+G\80<\dd|\e2eE+\ef?^\08q?{\b8\96\bc\81c\f5\e1\df$\ef?1\ab\tm\e1\f7\82<\e1\de\1f\f5\9d\1e\ef?\fa\bfo\1a\9b!=\bc\90\d9\da\d0\7f\18\ef?\b4\n\0cr\827\8b<\0b\03\e4\a6\85\12\ef?\8f\cb\ce\89\92\14n<V/>\a9\af\0c\ef?\b6\ab\b0MuM\83<\15\b71\n\fe\06\ef?Lt\ac\e2\01B\86<1\d8L\fcp\01\ef?J\f8\d3]9\dd\8f<\ff\16d\b2\08\fc\ee?\04[\8e;\80\a3\86\bc\f1\9f\92_\c5\f6\ee?hPK\cc\edJ\92\bc\cb\a9:7\a7\f1\ee?\8e-Q\1b\f8\07\99\bcf\d8\05m\ae\ec\ee?\d26\94>\e8\d1q\bc\f7\9f\e54\db\e7\ee?\15\1b\ce\b3\19\19\99\bc\e5\a8\13\c3-\e3\ee?mL*\a7H\9f\85<\"4\12L\a6\de\ee?\8ai(z`\12\93\bc\1c\80\ac\04E\da\ee?[\89\17H\8f\a7X\bc*.\f7!\n\d6\ee?\1b\9aIg\9b,|\bc\97\a8P\d9\f5\d1\ee?\11\ac\c2`\edcC<-\89a`\08\ce\ee?\efd\06;\tf\96<W\00\1d\edA\ca\ee?y\03\a1\da\e1\ccn<\d0<\c1\b5\a2\c6\ee?0\12\0f?\8e\ff\93<\de\d3\d7\f0*\c3\ee?\b0\afz\bb\ce\90v<\'*6\d5\da\bf\ee?w\e0T\eb\bd\1d\93<\r\dd\fd\99\b2\bc\ee?\8e\a3q\004\94\8f\bc\a7,\9dv\b2\b9\ee?I\a3\93\dc\cc\de\87\bcBf\cf\a2\da\b6\ee?_8\0f\bd\c6\dex\bc\82O\9dV+\b4\ee?\f6\\{\ecF\12\86\bc\0f\92]\ca\a4\b1\ee?\8e\d7\fd\18\055\93<\da\'\b56G\af\ee?\05\9b\8a/\b7\98{<\fd\c7\97\d4\12\ad\ee?\tT\1c\e2\e1c\90<)TH\dd\07\ab\ee?\ea\c6\19P\85\c74<\b7FY\8a&\a9\ee?5\c0d+\e62\94<H!\ad\15o\a7\ee?\9fv\99aJ\e4\8c\bc\t\dcv\b9\e1\a5\ee?\a8M\ef;\c53\8c\bc\85U:\b0~\a4\ee?\ae\e9+\89xS\84\bc \c3\cc4F\a3\ee?XXVx\dd\ce\93\bc%\"U\828\a2\ee?d\19~\80\aa\10W<s\a9L\d4U\a1\ee?(\"^\bf\ef\b3\93\bc\cd;\7ff\9e\a0\ee?\82\b94\87\ad\12j\bc\bf\da\0bu\12\a0\ee?\ee\a9m\b8\efgc\bc/\1ae<\b2\9f\ee?Q\88\e0T=\dc\80\bc\84\94Q\f9}\9f\ee?\cf>Z~d\1fx\bct_\ec\e8u\9f\ee?\b0}\8b\c0J\ee\86\bct\81\a5H\9a\9f\ee?\8a\e6U\1e2\19\86\bc\c9gBV\eb\9f\ee?\d3\d4\t^\cb\9c\90<?]\deOi\a0\ee?\1d\a5M\b9\dc2{\bc\87\01\ebs\14\a1\ee?k\c0gT\fd\ec\94<2\c10\01\ed\a1\ee?Ul\d6\ab\e1\ebe<bN\cf6\f3\a2\ee?B\cf\b3/\c5\a1\88\bc\12\1a>T\'\a4\ee?47;\f1\b6i\93\bc\13\ceL\99\89\a5\ee?\1e\ff\19:\84^\80\bc\ad\c7#F\1a\a7\ee?nWr\d8P\d4\94\bc\ed\92D\9b\d9\a8\ee?\00\8a\0e[g\ad\90<\99f\8a\d9\c7\aa\ee?\b4\ea\f0\c1/\b7\8d<\db\a0*B\e5\ac\ee?\ff\e7\c5\9c`\b6e\bc\8cD\b5\162\af\ee?D_\f3Y\83\f6{<6w\15\99\ae\b1\ee?\83=\1e\a7\1f\t\93\bc\c6\ff\91\0b[\b4\ee?)\1el\8b\b8\a9]\bc\e5\c5\cd\b07\b7\ee?Y\b9\90|\f9#l\bc\0fR\c8\cbD\ba\ee?\aa\f9\f4\"CC\92\bcPN\de\9f\82\bd\ee?K\8ef\d7l\ca\85\bc\ba\07\cap\f1\c0\ee?\'\ce\91+\fc\afq<\90\f0\a3\82\91\c4\ee?\bbs\n\e15\d2m<##\e3\19c\c8\ee?c\"b\"\04\c5\87\bce\e5]{f\cc\ee?\d51\e2\e3\86\1c\8b<3-J\ec\9b\d0\ee?\15\bb\bc\d3\d1\bb\91\bc]%>\b2\03\d5\ee?\d21\ee\9c1\cc\90<X\b30\13\9e\d9\ee?\b3Zsn\84i\84<\bf\fdyUk\de\ee?\b4\9d\8e\97\cd\df\82\bcz\f3\d3\bfk\e3\ee?\873\cb\92w\1a\8c<\ad\d3Z\99\9f\e8\ee?\fa\d9\d1J\8f{\90\bcf\b6\8d)\07\ee\ee?\ba\ae\dcV\d9\c3U\bc\fb\15O\b8\a2\f3\ee?@\f6\a6=\0e\a4\90\bc:Y\e5\8dr\f9\ee?4\93\ad8\f4\d6h\bcG^\fb\f2v\ff\ee?5\8aXk\e2\ee\91\bcJ\06\a10\b0\05\ef?\cd\dd_\n\d7\fft<\d2\c1K\90\1e\0c\ef?\ac\98\92\fa\fb\bd\91\bc\t\1e\d7[\c2\12\ef?\b3\0c\af0\aens<\9cR\85\dd\9b\19\ef?\94\fd\9f\\2\e3\8e<z\d0\ff_\ab \ef?\acY\t\d1\8f\e0\84<K\d1W.\f1\'\ef?g\1aN8\af\cdc<\b5\e7\06\94m/\ef?h\19\92l,kg<i\90\ef\dc 7\ef?\d2\b5\cc\83\18\8a\80\bc\fa\c3]U\0b?\ef?o\fa\ff?]\ad\8f\bc|\89\07J-G\ef?I\a9u8\ae\r\90\bc\f2\89\r\08\87O\ef?\a7\07=\a6\85\a3t<\87\a4\fb\dc\18X\ef?\0f\"@ \9e\91\82\bc\98\83\c9\16\e3`\ef?\ac\92\c1\d5PZ\8e<\852\db\03\e6i\ef?Kk\01\acY:\84<`\b4\01\f3!s\ef?\1f>\b4\07!\d5\82\bc_\9b{3\97|\ef?\c9\rG;\b9*\89\bc)\a1\f5\14F\86\ef?\d3\88:`\04\b6t<\f6?\8b\e7.\90\ef?qr\9dQ\ec\c5\83<\83L\c7\fbQ\9a\ef?\f0\91\d3\8f\12\f7\8f\bc\da\90\a4\a2\af\a4\ef?}t#\e2\98\ae\8d\bc\f1g\8e-H\af\ef?\08 \aaA\bc\c3\8e<\'Za\ee\1b\ba\ef?2\eb\a9\c3\94+\84<\97\bak7+\c5\ef?\ee\85\d11\a9d\8a<@En[v\d0\ef?\ed\e3;\e4\ba7\8e\bc\14\be\9c\ad\fd\db\ef?\9d\cd\91M;\89w<\d8\90\9e\81\c1\e7\ef?\89\cc`A\c1\05S<\f1q\8f+\c2\f3\ef?")
 (data $2 (i32.const 7168) "\f8\ac\b1k($\f7?\00\b0\cd\ee_\t\e1\bf\a1\cc\d2f\f7\e1\f6?\00\d0v\bd\94\84\e0\bf\8a\d40\0e=\a1\f6?\00\f8\e8\aeC\01\e0\bf\85l\d02\eca\f6?\00@\0b6\c5\fe\de\bf\f8\98\11\95\fa#\f6?\00\e0\b7\1a\d9\fd\dd\bfl\02\cf\a4[\e7\f5?\00\90\c7\0c\ae\ff\dc\bf\b8O!Z\05\ac\f5?\00\a0\fd\118\04\dc\bf\1en\16\0f\edq\f5?\00\e0:2g\0b\db\bf5\f8\0bY\t9\f5?\00\b0-Z/\15\da\bf\dd\ada\edO\01\f5?\00`\f8Z\7f!\d9\bf\d0{H\8e\b8\ca\f4?\00\90q\b0M0\d8\bf\eeO3\b49\95\f4?\00\e0\a9\f9\89A\d7\bfi\d5\af\df\cb`\f4?\00\90\19\b5+U\d6\bfS\b9\e4Nf-\f4?\00\10\9b\a2#k\d5\bf\a6\d8\1d\11\01\fb\f3?\00\a0_\0fe\83\d4\bf6X\0c\b7\95\c9\f3?\00\a0\f67\e9\9d\d3\bfJ\fd\b6J\1c\99\f3?\00`\8dS\a1\ba\d2\bf\b5\99\e0\0c\8ei\f3?\00@\ca@\83\d9\d1\bf\b2\e7\13\82\e4:\f3?\00\e0@:\85\fa\d0\bf\b1\bd\85\19\19\r\f3?\000\e72\9c\1d\d0\bf\d7q\b2\ca%\e0\f2?\00`\fa\a2}\85\ce\bf\82\cd\13\cf\04\b4\f2?\00\80=c\c8\d3\cc\bfP\cb|,\b0\88\f2?\00\a0\14L\03&\cb\bf\e5M\94c\"^\f2?\00\e0O/\1c|\c9\bf\b1\15\86=V4\f2?\00\00\80?\02\d6\c7\bf8\af>\e3F\0b\f2?\00\e0\05\1a\a73\c6\bf\dd\a3\cd\fd\ee\e2\f1?\00\00W\e9\f5\94\c4\bf09\0bXJ\bb\f1?\00\a0\e0$\e4\f9\c2\bf\00\"\7f\84S\94\f1?\00\c0\fdZYb\c1\bf<\d7\d5\c0\06n\f1?\00\80\bdu\9a\9c\bf\bf\c2\e4\b7G_H\f1?\00\c0\f9[W{\bc\bf\d1\85\00\adX#\f1?\00\80\f4\0f\c6`\b9\bf\'\"S\0f\f0\fe\f0?\00\00\b6G\e2L\b6\bf\8f:\d0w \db\f0?\00@\01\b2x?\b3\bf\d9\80Y\d6\e6\b7\f0?\00\c0B\1a}8\b0\bf\8d@{\fe>\95\f0?\00\00\b5\08\92o\aa\bf\83;\c5\ca%s\f0?\00\00wO\95z\a4\bf\\\1b\r\e4\97Q\f0?\00\00\0c\c5\a8#\9d\bf\a2\8e \c1\910\f0?\00\00x)&j\91\bf!~\b3%\10\10\f0?\00\00\e8\d8\f8 w\bfk\a7\ca\f9~\c0\ef?\00\00P\b1S\fe\86?\84\f1\f6\d3eD\ef?\00\80\0f\e1\cc\1c\a1?\7f\10\84\9f\07\cc\ee?\00\80\8b\8c\fcM\ac?\e8Z\97\99:W\ee?\00@W\1e2\aa\b3?\e6=\bd\f0\d6\e5\ed?\00\80\8b\d0\a0\18\b9?\b38\ff\81\b6w\ed?\00@\04\da\e9r\be?C\e9Mr\b5\0c\ed?\00`\7fP\d2\dc\c1?cu\0e\dc\b2\a4\ec?\00\a0\de\03\abv\c4?Q\cb\d6\e8\8e?\ec?\00 \e2wC\07\c7?L\0c\02O+\dd\eb?\00@\a9\8b\de\8e\c9?\ca\15`\00l}\eb?\00\e0\d2j\b8\r\cc?\8f3.n6 \eb?\00\e0\ce\af\n\84\ce?9P)&p\c5\ea?\00\80g\b4\ny\d0?\dd1\'\bc\01m\ea?\00\c0\01h\05\ac\d1?\8b\f1?\bc\d3\16\ea?\00\e0\fe\d4\11\db\d2?\ad\fegI\d1\c2\e9?\00\80\c5NF\06\d4?\02\99|\f4\e4p\e9?\00\f0:\t\be-\d5?\f2\bc\829\fb \e9?\00\d0P \90Q\d6?\f1Y\f7\87\01\d3\e8?\00\f0\ea\cd\d2q\d7?m\f6\b9\eb\e5\86\e8?\00\90}\85\9c\8e\d8?\94\b9X\b6\97<\e8?\00`\e1U\01\a8\d9?\"\10\c6\ff\05\f4\e7?\00\d0\d3n\18\be\da?\ca\15\14\18\"\ad\e7?\00\e0\a0\ae\f2\d0\db?\8c\ff\9e\f9\dcg\e7?\00@\bf=\a4\e0\dc?")
 (data $3 (i32.const 8192) "\8e\n\b9\12\00 \e6?\05\b6D\06\ab\04\89<\a64W\04\00`\e6?\a9\f7b\ea\9b\ffa<\c5\f2%\c3\ff\9f\e6?\ba\90<\cb\cf~\82<\04Z\b98\00\e0\e6?&\93sV\88\ff\88<\e3\94\99\e0\ff\1f\e7?\b1\82_\'@\fd\8a<\10\0eY\15\00`\e7?A\83#\b4u\fdr\bc\d5[e\12\00\a0\e7?v+$|\e6\08x<\a6\e9Y2\00\e0\e7?\b7\"\f6&\e4\08b\bc\d2\b2\b4\ed\ff\1f\e8?/\c9\a5\1eF\02\84\bc\c3\fc\fa-\00`\e8?\1f\9a\f2\a2\f4\f7m<Pk\8c\f7\ff\9f\e8?\fd\95I\tS\04\8e\bcf\15g9\00\e0\e8?E{\c7\be\f3\04\8a\bcE\17\bf\e2\ff\1f\e9?< \0e@4\faw\bc\d1\9f\\\cc\ff_\e9?]i\a0\05\80\ffv\bcgG\ba;\00\a0\e9?\03~\ec\c4\c4\f8p<\a5-\b9\e7\ff\df\e9?\02F\8cG\d9\7f\8e<\af\fd.\d7\ff\1f\ea?~\ae\cdMU\0cj\bc\95\ff\04\de\ff_\ea?k\b2\e9\8c\a9}\86<+\8d^\ca\ff\9f\ea?\de\13L\b5\c9\84\82\bc\ea\03\ad\dd\ff\df\ea?<.`\ea\c8\12X<M=\r\f1\ff\1f\eb?\9cx\'\ad\dd\fa\8e\bcZ\16!\ce\ff_\eb?7\12\c6\19\17\cbS<t\e6P\d9\ff\9f\eb?\00\ce\94A\d9\f7s<\af\a8\9c\13\00\e0\eb?\c0\9b]!\c4\nu<\99\dfF[\00 \ec?\c9\c1\e9S\a6\eek<\ae\f7\b9@\00`\ec?\d6pJ\'\9f\07|\bc\8a\fdUb\00\a0\ec?\1fL\e8v@\0bz\bc]\tL\d9\ff\df\ec?\d7\b5\9a\f93\f9\88<\cf\d6u\f9\ff\1f\ed?\be\e1_f\08,X\bc\93\1cV\a2\ff_\ed?\f3\95\d2\9b(\04{\bc\0c\8b\"\9d\ff\9f\ed?6\a2\0f4Q\02\87<\16~\bce\00\e0\ed?\0c\d8\a4\16\1e\01u\bc\91G\f6\02\00 \ee?\e0b\ef\t/\80\89<\d8\a6\d7W\00`\ee?\fa\f7\0cXu\0b~\bc\0c\c0\ed\'\00\a0\ee?\11\98E\t\83\84\8c\bc|\cb\f5l\00\e0\ee?\f4v\15\95\'\80\8f\bc\cc}+x\00 \ef?\8fStr\d9\81\8f\bc\nE\0c&\00`\ef?\dc\ff\'\'\00q@\bc3\d5\8c\e8\ff\9f\ef?\b0\a8\fd\e1\dc\1bX\bc\89\86\0f\d5\ff\df\ef?n\8e\91\cb\1a\f9\87<g#)\04\00 \f0?\81F2e\f3\7f\9b<h\d6\e3\e3\ff_\f0?{\95\ae\dd\08\fa\86<W\a7\85\n\00\a0\f0?\91\fb\d3\80\de\e2W\bc\cc?_\1a\00\e0\f0?\14\f0\c5\053\82\91\bc\f5\ba\af\f8\ff\1f\f1?\c2\ba\80f\bb\fa\8b\bc\ad\91M\e5\ff_\f1?\ef\e77\17\12\7f\9d\bc\e16\ac\11\00\a0\f1?\ff\f5\16\05\n\00\9c<HB\c8\19\00\e0\f1?\a0]\da\e4\fb\82\90\bcn^\fe\0f\00 \f2?C\fb\9cL\d0\fd\88\bc\91\d8\9f&\00`\f2?\82\d1\94y*\fe\8c<\da\e6\a6)\00\a0\f2?\c5\8b^qs\02p\bc9>)\e0\ff\df\f2?\f9\a6\b2\da9|\9b<\82\f0\dc\f7\ff\1f\f3?TR\dcn3\f1}<`\8bZ\f0\ff_\f3?\eb1\cdLV\03\9e\bc\cc\ae\0e.\00\a0\f3?w\a4\d3K\e7\f0u<6\b2;\04\00\e0\f3?3\88\9d\14\cb}\9c<\ff\87\d1\02\00 \f4?(=-\cf\af\08~<\b1|8\r\00`\f4?\a6\99e\857\08\82<\89\9fV\04\00\a0\f4?\d2\bcO\90\\\fa\89\bc\f3C5\04\00\e0\f4?)S\17\ed%\11x\bc\0f\7f\02\cc\ff\1f\f5?\dcTw\84\d8\83\98<o\b3\87\fd\ff_\f5?\07(\d01\e7\t\87\bc\ba\f7\1d\f2\ff\9f\f5?\02{rh\9f\f7\87<\814\fc\eb\ff\df\f5?>\e90.\90\80\91\bc")
 (data $4 (i32.const 9216) "n\83\f9\a2\00\00\00\00\d1W\'\fc)\15DN\99\95b\db\c0\dd4\f5\abcQ\feA\90C<:n$\b7a\c5\bb\de\ea.I\06\e0\d2MB\1c\eb\1d\fe\1c\92\d1\t\f55\82\e8>\a7)\b1&p\9c\e9\84D\bb.9\d6\919A~_\b4\8b_\84\9c\f49S\83\ff\97\f8\1f;(\f9\bd\8b\11/\ef\0f\98\05\de\cf~6m\1fm\nZf?FO\b7\t\cb\'\c7\ba\'u-\ea_\9e\f79\07={\f1\e5\eb\b1_\fbk\ea\92R\8aF0\03V\08]\8d\1f \bc\cf\f0\abk{\fca\91\e3\a9\1d6\f4\9a_\85\99e\08\1b\e6^\80\d8\ff\8d@h\a0\14W\15\06\061\'sM")
 (export "sm2Version" (func $src/wasm/sm2.as/sm2Version))
 (export "sm2Init" (func $src/wasm/sm2.as/sm2Init))
 (export "sm2TokenBuf" (func $src/wasm/sm2.as/sm2TokenBuf))
 (export "sm2ConstBuf" (func $src/wasm/sm2.as/sm2ConstBuf))
 (export "sm2TexBuf" (func $src/wasm/sm2.as/sm2TexBuf))
 (export "sm2OutBuf" (func $src/wasm/sm2.as/sm2OutBuf))
 (export "sm2Caps" (func $src/wasm/sm2.as/sm2Caps))
 (export "sm2UploadProgram" (func $src/wasm/sm2.as/sm2UploadProgram))
 (export "sm2RunImage" (func $src/wasm/sm2.as/sm2RunImage))
 (export "memory" (memory $0))
 (func $~lib/memory/heap.alloc (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  global.get $~lib/rt/tlsf/ROOT
  i32.eqz
  if
   memory.size
   local.tee $2
   i32.const 0
   i32.le_s
   if (result i32)
    i32.const 1
    local.get $2
    i32.sub
    memory.grow
    i32.const 0
    i32.lt_s
   else
    i32.const 0
   end
   if
    unreachable
   end
   i32.const 9408
   i32.const 0
   i32.store
   i32.const 10976
   i32.const 0
   i32.store
   loop $for-loop|0
    local.get $1
    i32.const 23
    i32.lt_u
    if
     local.get $1
     i32.const 2
     i32.shl
     i32.const 9408
     i32.add
     i32.const 0
     i32.store offset=4
     i32.const 0
     local.set $2
     loop $for-loop|1
      local.get $2
      i32.const 16
      i32.lt_u
      if
       local.get $1
       i32.const 4
       i32.shl
       local.get $2
       i32.add
       i32.const 2
       i32.shl
       i32.const 9408
       i32.add
       i32.const 0
       i32.store offset=96
       local.get $2
       i32.const 1
       i32.add
       local.set $2
       br $for-loop|1
      end
     end
     local.get $1
     i32.const 1
     i32.add
     local.set $1
     br $for-loop|0
    end
   end
   i32.const 9408
   i32.const 10980
   memory.size
   i64.extend_i32_s
   i64.const 16
   i64.shl
   call $~lib/rt/tlsf/addMemory
   i32.const 9408
   global.set $~lib/rt/tlsf/ROOT
  end
  local.get $0
  i32.const 1073741820
  i32.gt_u
  if
   unreachable
  end
  global.get $~lib/rt/tlsf/ROOT
  local.tee $1
  local.get $0
  i32.const 12
  i32.le_u
  if (result i32)
   i32.const 12
  else
   local.get $0
   i32.const 19
   i32.add
   i32.const -16
   i32.and
   i32.const 4
   i32.sub
  end
  local.tee $3
  call $~lib/rt/tlsf/searchBlock
  local.tee $0
  i32.eqz
  if
   local.get $3
   i32.const 256
   i32.ge_u
   if (result i32)
    local.get $3
    i32.const 536870910
    i32.lt_u
    if (result i32)
     local.get $3
     i32.const 1
     i32.const 27
     local.get $3
     i32.clz
     i32.sub
     i32.shl
     i32.add
     i32.const 1
     i32.sub
    else
     local.get $3
    end
   else
    local.get $3
   end
   i32.const 4
   local.get $1
   i32.load offset=1568
   memory.size
   local.tee $0
   i32.const 16
   i32.shl
   i32.const 4
   i32.sub
   i32.ne
   i32.shl
   i32.add
   i32.const 65535
   i32.add
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.set $2
   local.get $0
   local.get $2
   local.get $0
   local.get $2
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $2
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
   local.get $1
   local.get $0
   i32.const 16
   i32.shl
   memory.size
   i64.extend_i32_s
   i64.const 16
   i64.shl
   call $~lib/rt/tlsf/addMemory
   local.get $1
   local.get $3
   call $~lib/rt/tlsf/searchBlock
   local.set $0
  end
  local.get $0
  i32.load
  drop
  local.get $1
  local.get $0
  call $~lib/rt/tlsf/removeBlock
  local.get $0
  i32.load
  local.tee $2
  i32.const -4
  i32.and
  local.get $3
  i32.sub
  local.tee $4
  i32.const 16
  i32.ge_u
  if
   local.get $0
   local.get $3
   local.get $2
   i32.const 2
   i32.and
   i32.or
   i32.store
   local.get $0
   i32.const 4
   i32.add
   local.get $3
   i32.add
   local.tee $2
   local.get $4
   i32.const 4
   i32.sub
   i32.const 1
   i32.or
   i32.store
   local.get $1
   local.get $2
   call $~lib/rt/tlsf/insertBlock
  else
   local.get $0
   local.get $2
   i32.const -2
   i32.and
   i32.store
   local.get $0
   i32.const 4
   i32.add
   local.get $0
   i32.load
   i32.const -4
   i32.and
   i32.add
   local.tee $1
   local.get $1
   i32.load
   i32.const -3
   i32.and
   i32.store
  end
  local.get $0
  i32.const 4
  i32.add
 )
 (func $~lib/math/NativeMath.pow (param $0 f64) (param $1 f64) (result f64)
  (local $2 i64)
  (local $3 i32)
  (local $4 i32)
  (local $5 i64)
  (local $6 i64)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  (local $10 f64)
  (local $11 i64)
  (local $12 i64)
  (local $13 f64)
  (local $14 f64)
  (local $15 f64)
  (local $16 f64)
  (local $17 f64)
  (local $18 i32)
  local.get $1
  f64.abs
  f64.const 2
  f64.le
  if
   local.get $1
   f64.const 2
   f64.eq
   if
    local.get $0
    local.get $0
    f64.mul
    return
   end
   local.get $1
   f64.const 0.5
   f64.eq
   if
    local.get $0
    f64.sqrt
    f64.abs
    f64.const inf
    local.get $0
    f64.const -inf
    f64.ne
    select
    return
   end
   local.get $1
   f64.const -1
   f64.eq
   if
    f64.const 1
    local.get $0
    f64.div
    return
   end
   local.get $1
   f64.const 1
   f64.eq
   if
    local.get $0
    return
   end
   local.get $1
   f64.const 0
   f64.eq
   if
    f64.const 1
    return
   end
  end
  local.get $1
  i64.reinterpret_f64
  local.tee $11
  i64.const 52
  i64.shr_u
  local.set $6
  block $~lib/util/math/pow_lut|inlined.0 (result f64)
   local.get $0
   i64.reinterpret_f64
   local.tee $2
   i64.const 52
   i64.shr_u
   local.tee $5
   i64.const 1
   i64.sub
   i64.const 2046
   i64.ge_u
   if (result i32)
    i32.const 1
   else
    local.get $6
    i64.const 2047
    i64.and
    i64.const 958
    i64.sub
    i64.const 128
    i64.ge_u
   end
   if
    local.get $11
    i64.const 1
    i64.shl
    local.tee $12
    i64.const 1
    i64.sub
    i64.const -9007199254740993
    i64.ge_u
    if
     f64.const 1
     local.get $12
     i64.eqz
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     f64.const nan:0x8000000000000
     local.get $2
     i64.const 4607182418800017408
     i64.eq
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     local.get $0
     local.get $1
     f64.add
     local.get $12
     i64.const -9007199254740992
     i64.gt_u
     local.get $2
     i64.const 1
     i64.shl
     local.tee $2
     i64.const -9007199254740992
     i64.gt_u
     i32.or
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     f64.const nan:0x8000000000000
     local.get $2
     i64.const 9214364837600034816
     i64.eq
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     f64.const 0
     local.get $11
     i64.const 63
     i64.shr_u
     i64.eqz
     local.get $2
     i64.const 9214364837600034816
     i64.lt_u
     i32.eq
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     local.get $1
     local.get $1
     f64.mul
     br $~lib/util/math/pow_lut|inlined.0
    end
    local.get $2
    i64.const 1
    i64.shl
    i64.const 1
    i64.sub
    i64.const -9007199254740993
    i64.ge_u
    if
     f64.const 1
     local.get $0
     local.get $0
     f64.mul
     local.tee $0
     f64.neg
     local.get $0
     local.get $2
     i64.const 63
     i64.shr_u
     i32.wrap_i64
     if (result i32)
      block $~lib/util/math/checkint|inlined.0 (result i32)
       i32.const 0
       local.get $11
       i64.const 52
       i64.shr_u
       i64.const 2047
       i64.and
       local.tee $2
       i64.const 1023
       i64.lt_u
       br_if $~lib/util/math/checkint|inlined.0
       drop
       i32.const 2
       local.get $2
       i64.const 1075
       i64.gt_u
       br_if $~lib/util/math/checkint|inlined.0
       drop
       i32.const 0
       local.get $11
       i64.const 1
       i64.const 1075
       local.get $2
       i64.sub
       i64.shl
       local.tee $2
       i64.const 1
       i64.sub
       i64.and
       i64.const 0
       i64.ne
       br_if $~lib/util/math/checkint|inlined.0
       drop
       i32.const 1
       local.get $2
       local.get $11
       i64.and
       i64.const 0
       i64.ne
       br_if $~lib/util/math/checkint|inlined.0
       drop
       i32.const 2
      end
      i32.const 1
      i32.eq
     else
      i32.const 0
     end
     select
     local.tee $0
     f64.div
     local.get $0
     local.get $11
     i64.const 0
     i64.lt_s
     select
     br $~lib/util/math/pow_lut|inlined.0
    end
    local.get $2
    i64.const 0
    i64.lt_s
    if
     block $~lib/util/math/checkint|inlined.1 (result i32)
      i32.const 0
      local.get $11
      i64.const 52
      i64.shr_u
      i64.const 2047
      i64.and
      local.tee $12
      i64.const 1023
      i64.lt_u
      br_if $~lib/util/math/checkint|inlined.1
      drop
      i32.const 2
      local.get $12
      i64.const 1075
      i64.gt_u
      br_if $~lib/util/math/checkint|inlined.1
      drop
      i32.const 0
      local.get $11
      i64.const 1
      i64.const 1075
      local.get $12
      i64.sub
      i64.shl
      local.tee $12
      i64.const 1
      i64.sub
      i64.and
      i64.const 0
      i64.ne
      br_if $~lib/util/math/checkint|inlined.1
      drop
      i32.const 1
      local.get $11
      local.get $12
      i64.and
      i64.const 0
      i64.ne
      br_if $~lib/util/math/checkint|inlined.1
      drop
      i32.const 2
     end
     local.tee $3
     i32.eqz
     if
      local.get $0
      local.get $0
      f64.sub
      local.tee $0
      local.get $0
      f64.div
      br $~lib/util/math/pow_lut|inlined.0
     end
     local.get $5
     i64.const 2047
     i64.and
     local.set $5
     i32.const 262144
     i32.const 0
     local.get $3
     i32.const 1
     i32.eq
     select
     local.set $4
     local.get $2
     i64.const 9223372036854775807
     i64.and
     local.set $2
    end
    local.get $6
    i64.const 2047
    i64.and
    local.tee $12
    i64.const 958
    i64.sub
    i64.const 128
    i64.ge_u
    if
     f64.const 1
     local.get $2
     i64.const 4607182418800017408
     i64.eq
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     f64.const 1
     local.get $12
     i64.const 958
     i64.lt_u
     br_if $~lib/util/math/pow_lut|inlined.0
     drop
     f64.const inf
     f64.const 0
     local.get $6
     i64.const 2048
     i64.lt_u
     local.get $2
     i64.const 4607182418800017408
     i64.gt_u
     i32.eq
     select
     br $~lib/util/math/pow_lut|inlined.0
    end
    local.get $5
    i64.eqz
    if
     local.get $0
     f64.const 4503599627370496
     f64.mul
     i64.reinterpret_f64
     i64.const 9223372036854775807
     i64.and
     i64.const 234187180623265792
     i64.sub
     local.set $2
    end
   end
   local.get $2
   local.get $2
   i64.const 4604531861337669632
   i64.sub
   local.tee $2
   i64.const -4503599627370496
   i64.and
   i64.sub
   local.tee $5
   i64.const 2147483648
   i64.add
   i64.const -4294967296
   i64.and
   f64.reinterpret_i64
   local.tee $7
   local.get $2
   i64.const 45
   i64.shr_u
   i64.const 127
   i64.and
   i32.wrap_i64
   i32.const 5
   i32.shl
   i32.const 1024
   i32.add
   local.tee $3
   f64.load
   local.tee $8
   f64.mul
   f64.const -1
   f64.add
   local.set $9
   local.get $2
   i64.const 52
   i64.shr_s
   f64.convert_i64_s
   local.tee $13
   f64.const 0.6931471805598903
   f64.mul
   local.get $3
   f64.load offset=16
   f64.add
   local.tee $0
   local.get $9
   local.get $5
   f64.reinterpret_i64
   local.get $7
   f64.sub
   local.get $8
   f64.mul
   local.tee $7
   f64.add
   local.tee $14
   f64.add
   local.set $15
   local.get $14
   local.get $14
   f64.const -0.5
   f64.mul
   local.tee $8
   f64.mul
   local.set $16
   local.get $15
   local.get $9
   local.get $9
   f64.const -0.5
   f64.mul
   local.tee $17
   f64.mul
   local.tee $9
   f64.add
   local.tee $10
   local.get $10
   local.get $13
   f64.const 5.497923018708371e-14
   f64.mul
   local.get $3
   f64.load offset=24
   f64.add
   local.get $0
   local.get $15
   f64.sub
   local.get $14
   f64.add
   f64.add
   local.get $7
   local.get $8
   local.get $17
   f64.add
   f64.mul
   f64.add
   local.get $15
   local.get $10
   f64.sub
   local.get $9
   f64.add
   f64.add
   local.get $14
   local.get $16
   f64.mul
   local.get $14
   f64.const 0.5000000000000007
   f64.mul
   f64.const -0.6666666666666679
   f64.add
   local.get $16
   local.get $14
   f64.const -0.6666666663487739
   f64.mul
   f64.const 0.7999999995323976
   f64.add
   local.get $16
   local.get $14
   f64.const 1.0000415263675542
   f64.mul
   f64.const -1.142909628459501
   f64.add
   f64.mul
   f64.add
   f64.mul
   f64.add
   f64.mul
   f64.add
   local.tee $0
   f64.add
   local.tee $7
   f64.sub
   local.get $0
   f64.add
   global.set $~lib/util/math/log_tail
   local.get $11
   i64.const -134217728
   i64.and
   f64.reinterpret_i64
   local.tee $0
   local.get $7
   i64.reinterpret_f64
   i64.const -134217728
   i64.and
   f64.reinterpret_i64
   local.tee $8
   f64.mul
   local.set $9
   local.get $1
   local.get $0
   f64.sub
   local.get $8
   f64.mul
   local.get $1
   local.get $7
   local.get $8
   f64.sub
   global.get $~lib/util/math/log_tail
   f64.add
   f64.mul
   f64.add
   local.set $0
   block $~lib/util/math/exp_inline|inlined.0 (result f64)
    local.get $9
    i64.reinterpret_f64
    local.tee $2
    i64.const 52
    i64.shr_u
    i32.wrap_i64
    i32.const 2047
    i32.and
    local.tee $3
    i32.const 969
    i32.sub
    local.tee $18
    i32.const 63
    i32.ge_u
    if
     f64.const -1
     f64.const 1
     local.get $4
     select
     local.get $18
     i32.const -2147483648
     i32.ge_u
     br_if $~lib/util/math/exp_inline|inlined.0
     drop
     f64.const -0
     f64.const 0
     local.get $4
     select
     f64.const -inf
     f64.const inf
     local.get $4
     select
     local.get $2
     i64.const 0
     i64.lt_s
     select
     local.get $3
     i32.const 1033
     i32.ge_u
     br_if $~lib/util/math/exp_inline|inlined.0
     drop
     i32.const 0
     local.set $3
    end
    local.get $9
    f64.const 184.6649652337873
    f64.mul
    f64.const 6755399441055744
    f64.add
    local.tee $1
    i64.reinterpret_f64
    local.tee $2
    i64.const 127
    i64.and
    i64.const 1
    i64.shl
    i32.wrap_i64
    i32.const 3
    i32.shl
    i32.const 5120
    i32.add
    local.tee $18
    i64.load offset=8
    local.get $2
    local.get $4
    i64.extend_i32_u
    i64.add
    i64.const 45
    i64.shl
    i64.add
    local.set $5
    local.get $9
    local.get $1
    f64.const -6755399441055744
    f64.add
    local.tee $1
    f64.const -0.005415212348111709
    f64.mul
    f64.add
    local.get $1
    f64.const -1.2864023111638346e-14
    f64.mul
    f64.add
    local.get $0
    f64.add
    local.tee $0
    local.get $0
    f64.mul
    local.set $1
    local.get $18
    f64.load
    local.get $0
    f64.add
    local.get $1
    local.get $0
    f64.const 0.16666666666665886
    f64.mul
    f64.const 0.49999999999996786
    f64.add
    f64.mul
    f64.add
    local.get $1
    local.get $1
    f64.mul
    local.get $0
    f64.const 0.008333335853059549
    f64.mul
    f64.const 0.0416666808410674
    f64.add
    f64.mul
    f64.add
    local.set $0
    local.get $3
    i32.eqz
    if
     block $~lib/util/math/specialcase|inlined.0 (result f64)
      local.get $2
      i64.const 2147483648
      i64.and
      i64.eqz
      if
       local.get $5
       i64.const 4544132024016830464
       i64.sub
       f64.reinterpret_i64
       local.tee $1
       local.get $1
       local.get $0
       f64.mul
       f64.add
       f64.const 5486124068793688683255936e279
       f64.mul
       br $~lib/util/math/specialcase|inlined.0
      end
      local.get $5
      i64.const 4602678819172646912
      i64.add
      local.tee $2
      f64.reinterpret_i64
      local.tee $1
      local.get $0
      f64.mul
      local.set $0
      local.get $1
      local.get $0
      f64.add
      local.tee $7
      f64.abs
      f64.const 1
      f64.lt
      if (result f64)
       f64.const 1
       local.get $7
       f64.copysign
       local.tee $8
       local.get $7
       f64.add
       local.tee $9
       local.get $8
       local.get $9
       f64.sub
       local.get $7
       f64.add
       local.get $1
       local.get $7
       f64.sub
       local.get $0
       f64.add
       f64.add
       f64.add
       local.get $8
       f64.sub
       local.tee $0
       f64.const 0
       f64.eq
       if (result f64)
        local.get $2
        i64.const -9223372036854775808
        i64.and
        f64.reinterpret_i64
       else
        local.get $0
       end
      else
       local.get $7
      end
      f64.const 2.2250738585072014e-308
      f64.mul
     end
     br $~lib/util/math/exp_inline|inlined.0
    end
    local.get $5
    f64.reinterpret_i64
    local.tee $1
    local.get $1
    local.get $0
    f64.mul
    f64.add
   end
  end
 )
 (func $~lib/math/NativeMath.log2 (param $0 f64) (result f64)
  (local $1 i64)
  (local $2 i32)
  (local $3 i64)
  (local $4 f64)
  (local $5 f64)
  (local $6 f64)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  (local $10 i32)
  block $~lib/util/math/log2_lut|inlined.0 (result f64)
   local.get $0
   i64.reinterpret_f64
   local.tee $1
   i64.const 4606800540372828160
   i64.sub
   i64.const 581272283906048
   i64.lt_u
   if
    local.get $0
    f64.const -1
    f64.add
    local.tee $5
    i64.reinterpret_f64
    i64.const -4294967296
    i64.and
    f64.reinterpret_i64
    local.tee $6
    f64.const 1.4426950407214463
    f64.mul
    local.set $7
    local.get $5
    local.get $5
    f64.mul
    local.tee $8
    local.get $8
    f64.mul
    local.set $0
    local.get $7
    local.get $8
    local.get $5
    f64.const 0.48089834696298744
    f64.mul
    f64.const -0.7213475204444817
    f64.add
    f64.mul
    local.tee $4
    f64.add
    local.tee $9
    local.get $5
    local.get $6
    f64.sub
    f64.const 1.4426950407214463
    f64.mul
    local.get $5
    f64.const 1.6751713164886512e-10
    f64.mul
    f64.add
    local.get $7
    local.get $9
    f64.sub
    local.get $4
    f64.add
    f64.add
    local.get $0
    local.get $5
    f64.const 0.2885390081805197
    f64.mul
    f64.const -0.360673760222145
    f64.add
    local.get $8
    local.get $5
    f64.const 0.2060992861022954
    f64.mul
    f64.const -0.24044917405728863
    f64.add
    f64.mul
    f64.add
    local.get $0
    local.get $5
    f64.const 0.1603032746063156
    f64.mul
    f64.const -0.18033596705327856
    f64.add
    local.get $8
    local.get $5
    f64.const 0.13046826811283835
    f64.mul
    f64.const -0.14483316576701266
    f64.add
    f64.mul
    f64.add
    f64.mul
    f64.add
    f64.mul
    f64.add
    f64.add
    br $~lib/util/math/log2_lut|inlined.0
   end
   local.get $1
   i64.const 48
   i64.shr_u
   i32.wrap_i64
   local.tee $2
   i32.const 16
   i32.sub
   i32.const 32736
   i32.ge_u
   if
    f64.const -1
    local.get $0
    local.get $0
    f64.mul
    f64.div
    local.get $1
    i64.const 1
    i64.shl
    i64.eqz
    br_if $~lib/util/math/log2_lut|inlined.0
    drop
    local.get $0
    local.get $1
    i64.const 9218868437227405312
    i64.eq
    br_if $~lib/util/math/log2_lut|inlined.0
    drop
    i32.const 1
    local.get $2
    i32.const 32752
    i32.and
    i32.const 32752
    i32.eq
    local.get $2
    i32.const 32768
    i32.and
    select
    if
     local.get $0
     local.get $0
     f64.sub
     local.tee $0
     local.get $0
     f64.div
     br $~lib/util/math/log2_lut|inlined.0
    end
    local.get $0
    f64.const 4503599627370496
    f64.mul
    i64.reinterpret_f64
    i64.const 234187180623265792
    i64.sub
    local.set $1
   end
   local.get $1
   i64.const 4604367669032910848
   i64.sub
   local.tee $3
   i64.const 46
   i64.shr_u
   i64.const 63
   i64.and
   i32.wrap_i64
   i32.const 4
   i32.shl
   local.tee $2
   i32.const 7168
   i32.add
   local.set $10
   local.get $3
   i64.const 52
   i64.shr_s
   f64.convert_i64_s
   local.get $10
   f64.load offset=8
   f64.add
   local.tee $0
   local.get $1
   local.get $3
   i64.const -4503599627370496
   i64.and
   i64.sub
   f64.reinterpret_i64
   local.get $2
   i32.const -8192
   i32.sub
   local.tee $2
   f64.load
   f64.sub
   local.get $2
   f64.load offset=8
   f64.sub
   local.get $10
   f64.load
   f64.mul
   local.tee $4
   i64.reinterpret_f64
   i64.const -4294967296
   i64.and
   f64.reinterpret_i64
   local.tee $5
   f64.const 1.4426950407214463
   f64.mul
   local.tee $6
   f64.add
   local.set $7
   local.get $0
   local.get $7
   f64.sub
   local.get $6
   f64.add
   local.get $4
   local.get $5
   f64.sub
   f64.const 1.4426950407214463
   f64.mul
   local.get $4
   f64.const 1.6751713164886512e-10
   f64.mul
   f64.add
   f64.add
   local.get $4
   local.get $4
   f64.mul
   local.tee $0
   local.get $4
   f64.const 0.4808983469629985
   f64.mul
   f64.const -0.7213475204444882
   f64.add
   local.get $0
   local.get $4
   f64.const 0.2885390073180969
   f64.mul
   f64.const -0.36067375954075914
   f64.add
   f64.mul
   f64.add
   local.get $0
   local.get $0
   f64.mul
   local.get $4
   f64.const 0.2061202382173603
   f64.mul
   f64.const -0.2404693555628422
   f64.add
   f64.mul
   f64.add
   f64.mul
   f64.add
   local.get $7
   f64.add
  end
 )
 (func $src/wasm/sm2.as/bilCorner (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64) (param $4 i32) (param $5 i32)
  local.get $5
  global.get $src/wasm/sm2.as/texBuf
  block $__inlined_func$src/wasm/sm2.as/truncI32$63 (result i32)
   i32.const 0
   f64.const 0
   local.get $2
   f64.const -1
   f64.add
   local.get $0
   local.get $0
   local.get $2
   f64.ge
   select
   local.get $0
   f64.const 0
   f64.lt
   select
   local.tee $0
   local.get $0
   f64.ne
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$63
   drop
   i32.const 2147483647
   local.get $0
   f64.const 2147483647
   f64.ge
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$63
   drop
   i32.const -2147483648
   local.get $0
   f64.const -2147483648
   f64.le
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$63
   drop
   local.get $0
   i32.trunc_sat_f64_s
  end
  block $__inlined_func$src/wasm/sm2.as/truncI32$62 (result i32)
   i32.const 0
   f64.const 0
   local.get $3
   f64.const -1
   f64.add
   local.get $1
   local.get $1
   local.get $3
   f64.ge
   select
   local.get $1
   f64.const 0
   f64.lt
   select
   local.tee $0
   local.get $0
   f64.ne
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$62
   drop
   i32.const 2147483647
   local.get $0
   f64.const 2147483647
   f64.ge
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$62
   drop
   i32.const -2147483648
   local.get $0
   f64.const -2147483648
   f64.le
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$62
   drop
   local.get $0
   i32.trunc_sat_f64_s
  end
  local.get $4
  i32.mul
  i32.add
  i32.const 2
  i32.shl
  i32.add
  local.tee $4
  i32.load8_u
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store
  local.get $5
  local.get $4
  i32.load8_u offset=1
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store offset=8
  local.get $5
  local.get $4
  i32.load8_u offset=2
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store offset=16
  local.get $5
  local.get $4
  i32.load8_u offset=3
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store offset=24
 )
 (func $~lib/rt/tlsf/removeBlock (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  local.get $1
  i32.load
  i32.const -4
  i32.and
  local.tee $3
  i32.const 256
  i32.lt_u
  if (result i32)
   local.get $3
   i32.const 4
   i32.shr_u
  else
   i32.const 31
   i32.const 1073741820
   local.get $3
   local.get $3
   i32.const 1073741820
   i32.ge_u
   select
   local.tee $3
   i32.clz
   i32.sub
   local.tee $4
   i32.const 7
   i32.sub
   local.set $2
   local.get $3
   local.get $4
   i32.const 4
   i32.sub
   i32.shr_u
   i32.const 16
   i32.xor
  end
  local.set $3
  local.get $1
  i32.load offset=8
  local.set $5
  local.get $1
  i32.load offset=4
  local.tee $4
  if
   local.get $4
   local.get $5
   i32.store offset=8
  end
  local.get $5
  if
   local.get $5
   local.get $4
   i32.store offset=4
  end
  local.get $1
  local.get $0
  local.get $2
  i32.const 4
  i32.shl
  local.get $3
  i32.add
  i32.const 2
  i32.shl
  i32.add
  local.tee $1
  i32.load offset=96
  i32.eq
  if
   local.get $1
   local.get $5
   i32.store offset=96
   local.get $5
   i32.eqz
   if
    local.get $0
    local.get $2
    i32.const 2
    i32.shl
    i32.add
    local.tee $1
    i32.load offset=4
    i32.const -2
    local.get $3
    i32.rotl
    i32.and
    local.set $3
    local.get $1
    local.get $3
    i32.store offset=4
    local.get $3
    i32.eqz
    if
     local.get $0
     local.get $0
     i32.load
     i32.const -2
     local.get $2
     i32.rotl
     i32.and
     i32.store
    end
   end
  end
 )
 (func $src/wasm/sm2.as/decodeSrc (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  local.get $4
  i32.const 16
  i32.shr_u
  i32.const 3
  i32.and
  local.get $4
  i32.const 18
  i32.shr_u
  i32.const 3
  i32.and
  i32.const 2
  i32.shl
  i32.or
  local.get $4
  i32.const 20
  i32.shr_u
  i32.const 3
  i32.and
  i32.const 4
  i32.shl
  i32.or
  local.get $4
  i32.const 22
  i32.shr_u
  i32.const 3
  i32.and
  i32.const 6
  i32.shl
  i32.or
  local.set $5
  local.get $0
  local.get $1
  i32.add
  block $__inlined_func$src/wasm/sm2.as/bindPtrDec$43 (result i32)
   local.get $4
   i32.const 2047
   i32.and
   local.tee $1
   i32.const 5
   i32.shl
   local.tee $6
   global.get $src/wasm/sm2.as/constBuf
   i32.add
   global.get $src/wasm/sm2.as/nanCell
   local.get $1
   i32.const 64
   i32.lt_u
   select
   local.get $4
   i32.const 28
   i32.shr_u
   i32.const 7
   i32.and
   local.get $4
   i32.const 8
   i32.shr_u
   i32.const 24
   i32.and
   i32.or
   local.tee $7
   i32.const 2
   i32.eq
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   local.get $7
   i32.eqz
   if
    local.get $1
    i32.const 32
    i32.lt_u
    if
     global.get $src/wasm/sm2.as/curReadSet
     i32.const 1
     local.get $1
     i32.shl
     i32.or
     global.set $src/wasm/sm2.as/curReadSet
     global.get $src/wasm/sm2.as/rBase
     local.get $6
     i32.add
     br $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
    end
    global.get $src/wasm/sm2.as/nanCell
    br $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   end
   local.get $1
   i32.const 5
   i32.shl
   local.tee $6
   global.get $src/wasm/sm2.as/vBase
   i32.add
   global.get $src/wasm/sm2.as/nanCell
   local.get $1
   i32.const 2
   i32.lt_u
   select
   local.get $7
   i32.const 1
   i32.eq
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   global.get $src/wasm/sm2.as/tBase
   local.get $6
   i32.add
   global.get $src/wasm/sm2.as/nanCell
   local.get $1
   i32.const 8
   i32.lt_u
   select
   local.get $7
   i32.const 3
   i32.eq
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   global.get $src/wasm/sm2.as/oBase
   local.get $7
   i32.const 8
   i32.eq
   local.get $7
   i32.const 7
   i32.eq
   i32.or
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   local.get $1
   i32.const 32
   i32.lt_u
   if
    global.get $src/wasm/sm2.as/curReadSet
    i32.const 1
    local.get $1
    i32.shl
    i32.or
    global.set $src/wasm/sm2.as/curReadSet
    global.get $src/wasm/sm2.as/rBase
    local.get $6
    i32.add
    br $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   end
   global.get $src/wasm/sm2.as/nanCell
  end
  i32.store
  local.get $0
  local.get $2
  i32.add
  local.get $5
  i32.store
  local.get $4
  i32.const 24
  i32.shr_u
  i32.const 15
  i32.and
  i32.const 1
  i32.eq
  if
   local.get $0
   i32.const -64
   i32.sub
   local.tee $0
   local.get $0
   i32.load
   i32.const 1
   local.get $3
   i32.shl
   i32.or
   i32.store
  end
 )
 (func $~lib/rt/tlsf/searchBlock (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  local.get $1
  i32.const 256
  i32.lt_u
  if
   local.get $1
   i32.const 4
   i32.shr_u
   local.set $1
  else
   local.get $1
   i32.const 536870910
   i32.lt_u
   if
    local.get $1
    i32.const 1
    i32.const 27
    local.get $1
    i32.clz
    i32.sub
    i32.shl
    i32.add
    i32.const 1
    i32.sub
    local.set $1
   end
   local.get $1
   i32.const 31
   local.get $1
   i32.clz
   i32.sub
   local.tee $2
   i32.const 4
   i32.sub
   i32.shr_u
   i32.const 16
   i32.xor
   local.set $1
   local.get $2
   i32.const 7
   i32.sub
   local.set $2
  end
  local.get $0
  local.get $2
  i32.const 2
  i32.shl
  i32.add
  i32.load offset=4
  i32.const -1
  local.get $1
  i32.shl
  i32.and
  local.tee $1
  if (result i32)
   local.get $0
   local.get $1
   i32.ctz
   local.get $2
   i32.const 4
   i32.shl
   i32.add
   i32.const 2
   i32.shl
   i32.add
   i32.load offset=96
  else
   local.get $0
   i32.load
   i32.const -1
   local.get $2
   i32.const 1
   i32.add
   i32.shl
   i32.and
   local.tee $1
   if (result i32)
    local.get $0
    local.get $0
    local.get $1
    i32.ctz
    local.tee $0
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=4
    i32.ctz
    local.get $0
    i32.const 4
    i32.shl
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=96
   else
    i32.const 0
   end
  end
 )
 (func $~lib/rt/tlsf/insertBlock (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  local.get $1
  i32.const 4
  i32.add
  local.tee $6
  local.get $1
  i32.load
  local.tee $3
  i32.const -4
  i32.and
  i32.add
  local.tee $4
  i32.load
  local.tee $2
  i32.const 1
  i32.and
  if
   local.get $0
   local.get $4
   call $~lib/rt/tlsf/removeBlock
   local.get $1
   local.get $3
   i32.const 4
   i32.add
   local.get $2
   i32.const -4
   i32.and
   i32.add
   local.tee $3
   i32.store
   local.get $1
   i32.load
   i32.const -4
   i32.and
   local.get $6
   i32.add
   local.tee $4
   i32.load
   local.set $2
  end
  local.get $3
  i32.const 2
  i32.and
  if
   local.get $1
   i32.const 4
   i32.sub
   i32.load
   local.tee $1
   i32.load
   local.set $6
   local.get $0
   local.get $1
   call $~lib/rt/tlsf/removeBlock
   local.get $1
   local.get $6
   i32.const 4
   i32.add
   local.get $3
   i32.const -4
   i32.and
   i32.add
   local.tee $3
   i32.store
  end
  local.get $4
  local.get $2
  i32.const 2
  i32.or
  i32.store
  local.get $4
  i32.const 4
  i32.sub
  local.get $1
  i32.store
  local.get $0
  local.get $3
  i32.const -4
  i32.and
  local.tee $2
  i32.const 256
  i32.lt_u
  if (result i32)
   local.get $2
   i32.const 4
   i32.shr_u
  else
   i32.const 31
   i32.const 1073741820
   local.get $2
   local.get $2
   i32.const 1073741820
   i32.ge_u
   select
   local.tee $2
   i32.clz
   i32.sub
   local.tee $3
   i32.const 7
   i32.sub
   local.set $5
   local.get $2
   local.get $3
   i32.const 4
   i32.sub
   i32.shr_u
   i32.const 16
   i32.xor
  end
  local.tee $2
  local.get $5
  i32.const 4
  i32.shl
  i32.add
  i32.const 2
  i32.shl
  i32.add
  i32.load offset=96
  local.set $3
  local.get $1
  i32.const 0
  i32.store offset=4
  local.get $1
  local.get $3
  i32.store offset=8
  local.get $3
  if
   local.get $3
   local.get $1
   i32.store offset=4
  end
  local.get $0
  local.get $5
  i32.const 4
  i32.shl
  local.get $2
  i32.add
  i32.const 2
  i32.shl
  i32.add
  local.get $1
  i32.store offset=96
  local.get $0
  local.get $0
  i32.load
  i32.const 1
  local.get $5
  i32.shl
  i32.or
  i32.store
  local.get $0
  local.get $5
  i32.const 2
  i32.shl
  i32.add
  local.tee $0
  local.get $0
  i32.load offset=4
  i32.const 1
  local.get $2
  i32.shl
  i32.or
  i32.store offset=4
 )
 (func $~lib/rt/tlsf/addMemory (param $0 i32) (param $1 i32) (param $2 i64)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  local.get $1
  i32.const 19
  i32.add
  i32.const -16
  i32.and
  i32.const 4
  i32.sub
  local.set $1
  local.get $0
  i32.load offset=1568
  local.tee $3
  if
   local.get $3
   local.get $1
   i32.const 16
   i32.sub
   local.tee $5
   i32.eq
   if
    local.get $3
    i32.load
    local.set $4
    local.get $5
    local.set $1
   end
  end
  local.get $2
  i32.wrap_i64
  i32.const -16
  i32.and
  local.get $1
  i32.sub
  local.tee $3
  i32.const 20
  i32.lt_u
  if
   return
  end
  local.get $1
  local.get $4
  i32.const 2
  i32.and
  local.get $3
  i32.const 8
  i32.sub
  local.tee $3
  i32.const 1
  i32.or
  i32.or
  i32.store
  local.get $1
  i32.const 0
  i32.store offset=4
  local.get $1
  i32.const 0
  i32.store offset=8
  local.get $1
  i32.const 4
  i32.add
  local.get $3
  i32.add
  local.tee $3
  i32.const 2
  i32.store
  local.get $0
  local.get $3
  i32.store offset=1568
  local.get $0
  local.get $1
  call $~lib/rt/tlsf/insertBlock
 )
 (func $~lib/math/pio2_large_quot (param $0 i64) (result i32)
  (local $1 i64)
  (local $2 i64)
  (local $3 i64)
  (local $4 i32)
  (local $5 f64)
  (local $6 i64)
  (local $7 i64)
  (local $8 i64)
  (local $9 i64)
  (local $10 i64)
  (local $11 i64)
  (local $12 i64)
  local.get $0
  i64.const 9223372036854775807
  i64.and
  i64.const 52
  i64.shr_u
  i64.const 1045
  i64.sub
  local.tee $1
  i64.const 63
  i64.and
  local.set $6
  local.get $1
  i64.const 6
  i64.shr_s
  i32.wrap_i64
  i32.const 3
  i32.shl
  i32.const 9216
  i32.add
  local.tee $4
  i64.load
  local.set $3
  local.get $4
  i64.load offset=8
  local.set $2
  local.get $4
  i64.load offset=16
  local.set $1
  local.get $6
  i64.const 0
  i64.ne
  if
   local.get $3
   local.get $6
   i64.shl
   local.get $2
   i64.const 64
   local.get $6
   i64.sub
   local.tee $7
   i64.shr_u
   i64.or
   local.set $3
   local.get $2
   local.get $6
   i64.shl
   local.get $1
   local.get $7
   i64.shr_u
   i64.or
   local.set $2
   local.get $1
   local.get $6
   i64.shl
   local.get $4
   i64.load offset=24
   local.get $7
   i64.shr_u
   i64.or
   local.set $1
  end
  local.get $0
  i64.const 4503599627370495
  i64.and
  i64.const 4503599627370496
  i64.or
  local.tee $6
  i64.const 4294967295
  i64.and
  local.set $7
  local.get $2
  i64.const 4294967295
  i64.and
  local.tee $8
  local.get $6
  i64.const 32
  i64.shr_u
  local.tee $9
  i64.mul
  local.get $2
  i64.const 32
  i64.shr_u
  local.tee $2
  local.get $7
  i64.mul
  local.get $7
  local.get $8
  i64.mul
  local.tee $7
  i64.const 32
  i64.shr_u
  i64.add
  local.tee $8
  i64.const 4294967295
  i64.and
  i64.add
  local.set $10
  local.get $2
  local.get $9
  i64.mul
  local.get $8
  i64.const 32
  i64.shr_u
  i64.add
  local.get $10
  i64.const 32
  i64.shr_u
  i64.add
  global.set $~lib/math/res128_hi
  local.get $9
  local.get $1
  i64.const 32
  i64.shr_u
  i64.mul
  local.tee $1
  local.get $7
  i64.const 4294967295
  i64.and
  local.get $10
  i64.const 32
  i64.shl
  i64.add
  i64.add
  local.tee $2
  local.get $1
  i64.lt_u
  i64.extend_i32_u
  global.get $~lib/math/res128_hi
  local.get $3
  local.get $6
  i64.mul
  i64.add
  i64.add
  local.tee $3
  i64.const 2
  i64.shl
  local.get $2
  i64.const 62
  i64.shr_u
  i64.or
  local.tee $6
  i64.const 63
  i64.shr_s
  local.tee $7
  local.get $2
  i64.const 2
  i64.shl
  i64.xor
  local.set $2
  local.get $6
  local.get $7
  i64.const 1
  i64.shr_s
  i64.xor
  local.tee $1
  i64.clz
  local.set $8
  local.get $1
  local.get $8
  i64.shl
  local.get $2
  i64.const 64
  local.get $8
  i64.sub
  i64.shr_u
  i64.or
  local.tee $9
  i64.const 4294967295
  i64.and
  local.set $1
  local.get $9
  i64.const 32
  i64.shr_u
  local.tee $10
  i64.const 560513588
  i64.mul
  local.get $1
  i64.const 3373259426
  i64.mul
  local.get $1
  i64.const 560513588
  i64.mul
  local.tee $11
  i64.const 32
  i64.shr_u
  i64.add
  local.tee $12
  i64.const 4294967295
  i64.and
  i64.add
  local.set $1
  local.get $10
  i64.const 3373259426
  i64.mul
  local.get $12
  i64.const 32
  i64.shr_u
  i64.add
  local.get $1
  i64.const 32
  i64.shr_u
  i64.add
  global.set $~lib/math/res128_hi
  local.get $9
  f64.convert_i64_u
  f64.const 3.753184150245214e-04
  f64.mul
  local.get $2
  local.get $8
  i64.shl
  f64.convert_i64_u
  f64.const 3.834951969714103e-04
  f64.mul
  f64.add
  i64.trunc_sat_f64_u
  local.tee $2
  local.get $11
  i64.const 4294967295
  i64.and
  local.get $1
  i64.const 32
  i64.shl
  i64.add
  local.tee $1
  i64.gt_u
  i64.extend_i32_u
  global.get $~lib/math/res128_hi
  local.tee $9
  i64.const 11
  i64.shr_u
  i64.add
  f64.convert_i64_u
  global.set $~lib/math/rempio2_y0
  local.get $9
  i64.const 53
  i64.shl
  local.get $1
  i64.const 11
  i64.shr_u
  i64.or
  local.get $2
  i64.add
  f64.convert_i64_u
  f64.const 5.421010862427522e-20
  f64.mul
  global.set $~lib/math/rempio2_y1
  global.get $~lib/math/rempio2_y0
  i64.const 4372995238176751616
  local.get $8
  i64.const 52
  i64.shl
  i64.sub
  local.get $0
  local.get $6
  i64.xor
  i64.const -9223372036854775808
  i64.and
  i64.or
  f64.reinterpret_i64
  local.tee $5
  f64.mul
  global.set $~lib/math/rempio2_y0
  global.get $~lib/math/rempio2_y1
  local.get $5
  f64.mul
  global.set $~lib/math/rempio2_y1
  local.get $3
  i64.const 62
  i64.shr_s
  local.get $7
  i64.sub
  i32.wrap_i64
 )
 (func $src/wasm/sm2.as/opNops (param $0 i32) (result i32)
  local.get $0
  i32.eqz
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 6
  i32.eq
  local.get $0
  i32.const 1
  i32.eq
  i32.or
  local.get $0
  i32.const 7
  i32.eq
  i32.or
  local.get $0
  i32.const 14
  i32.eq
  i32.or
  local.get $0
  i32.const 15
  i32.eq
  i32.or
  local.get $0
  i32.const 19
  i32.eq
  i32.or
  local.get $0
  i32.const 35
  i32.eq
  i32.or
  local.get $0
  i32.const 36
  i32.eq
  i32.or
  if
   i32.const 2
   return
  end
  local.get $0
  i32.const 3
  i32.eq
  local.get $0
  i32.const 2
  i32.eq
  i32.or
  local.get $0
  i32.const 5
  i32.eq
  i32.or
  local.get $0
  i32.const 8
  i32.eq
  i32.or
  local.get $0
  i32.const 9
  i32.eq
  i32.or
  local.get $0
  i32.const 10
  i32.eq
  i32.or
  local.get $0
  i32.const 11
  i32.eq
  i32.or
  local.get $0
  i32.const 12
  i32.eq
  i32.or
  local.get $0
  i32.const 13
  i32.eq
  i32.or
  local.get $0
  i32.const 32
  i32.eq
  i32.or
  local.get $0
  i32.const 33
  i32.eq
  i32.or
  if
   i32.const 3
   return
  end
  local.get $0
  i32.const 18
  i32.eq
  local.get $0
  i32.const 4
  i32.eq
  i32.or
  local.get $0
  i32.const 37
  i32.eq
  i32.or
  local.get $0
  i32.const 88
  i32.eq
  i32.or
  local.get $0
  i32.const 90
  i32.eq
  i32.or
  if
   i32.const 4
   return
  end
  local.get $0
  i32.const 31
  i32.eq
  if
   i32.const 2
   return
  end
  local.get $0
  i32.const 65
  i32.eq
  if
   i32.const 1
   return
  end
  local.get $0
  i32.const 66
  i32.eq
  if
   i32.const 3
   return
  end
  local.get $0
  i32.const 81
  i32.eq
  if
   i32.const 5
   return
  end
  i32.const -1
 )
 (func $~lib/math/NativeMath.sin (param $0 f64) (result f64)
  (local $1 f64)
  (local $2 f64)
  (local $3 i32)
  (local $4 i32)
  (local $5 i64)
  (local $6 i32)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  local.get $0
  i64.reinterpret_f64
  local.tee $5
  i64.const 32
  i64.shr_u
  i32.wrap_i64
  local.tee $3
  i32.const 31
  i32.shr_u
  local.set $6
  local.get $3
  i32.const 2147483647
  i32.and
  local.tee $3
  i32.const 1072243195
  i32.le_u
  if
   local.get $3
   i32.const 1045430272
   i32.lt_u
   if
    local.get $0
    return
   end
   local.get $0
   local.get $0
   local.get $0
   f64.mul
   local.tee $1
   local.get $0
   f64.mul
   local.get $1
   local.get $1
   local.get $1
   f64.const 2.7557313707070068e-06
   f64.mul
   f64.const -1.984126982985795e-04
   f64.add
   f64.mul
   f64.const 0.00833333333332249
   f64.add
   local.get $1
   local.get $1
   local.get $1
   f64.mul
   f64.mul
   local.get $1
   f64.const 1.58969099521155e-10
   f64.mul
   f64.const -2.5050760253406863e-08
   f64.add
   f64.mul
   f64.add
   f64.mul
   f64.const -0.16666666666666632
   f64.add
   f64.mul
   f64.add
   return
  end
  local.get $3
  i32.const 2146435072
  i32.ge_u
  if
   local.get $0
   local.get $0
   f64.sub
   return
  end
  block $~lib/math/rempio2|inlined.1 (result i32)
   local.get $5
   i64.const 32
   i64.shr_u
   i32.wrap_i64
   i32.const 2147483647
   i32.and
   local.tee $4
   i32.const 1073928572
   i32.lt_u
   if
    i32.const 1
    local.set $3
    local.get $6
    if (result f64)
     local.get $0
     f64.const 1.5707963267341256
     f64.add
     local.set $0
     i32.const -1
     local.set $3
     local.get $4
     i32.const 1073291771
     i32.ne
     if (result f64)
      local.get $0
      local.get $0
      f64.const 6.077100506506192e-11
      f64.add
      local.tee $0
      f64.sub
      f64.const 6.077100506506192e-11
      f64.add
     else
      local.get $0
      f64.const 6.077100506303966e-11
      f64.add
      local.tee $1
      f64.const 2.0222662487959506e-21
      f64.add
      local.set $0
      local.get $1
      local.get $0
      f64.sub
      f64.const 2.0222662487959506e-21
      f64.add
     end
    else
     local.get $0
     f64.const -1.5707963267341256
     f64.add
     local.set $0
     local.get $4
     i32.const 1073291771
     i32.ne
     if (result f64)
      local.get $0
      local.get $0
      f64.const -6.077100506506192e-11
      f64.add
      local.tee $0
      f64.sub
      f64.const -6.077100506506192e-11
      f64.add
     else
      local.get $0
      f64.const -6.077100506303966e-11
      f64.add
      local.tee $1
      f64.const -2.0222662487959506e-21
      f64.add
      local.set $0
      local.get $1
      local.get $0
      f64.sub
      f64.const -2.0222662487959506e-21
      f64.add
     end
    end
    local.get $0
    global.set $~lib/math/rempio2_y0
    global.set $~lib/math/rempio2_y1
    local.get $3
    br $~lib/math/rempio2|inlined.1
   end
   local.get $4
   i32.const 1094263291
   i32.lt_u
   if
    local.get $4
    i32.const 20
    i32.shr_u
    local.tee $3
    local.get $0
    local.get $0
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.tee $7
    f64.const 1.5707963267341256
    f64.mul
    f64.sub
    local.tee $0
    local.get $7
    f64.const 6.077100506506192e-11
    f64.mul
    local.tee $2
    f64.sub
    local.tee $1
    i64.reinterpret_f64
    i64.const 32
    i64.shr_u
    i32.wrap_i64
    i32.const 20
    i32.shr_u
    i32.const 2047
    i32.and
    i32.sub
    i32.const 16
    i32.gt_u
    if
     local.get $7
     f64.const 2.0222662487959506e-21
     f64.mul
     local.get $0
     local.get $0
     local.get $7
     f64.const 6.077100506303966e-11
     f64.mul
     local.tee $1
     f64.sub
     local.tee $0
     f64.sub
     local.get $1
     f64.sub
     f64.sub
     local.set $2
     local.get $3
     local.get $0
     local.get $2
     f64.sub
     local.tee $1
     i64.reinterpret_f64
     i64.const 32
     i64.shr_u
     i32.wrap_i64
     i32.const 20
     i32.shr_u
     i32.const 2047
     i32.and
     i32.sub
     i32.const 49
     i32.gt_u
     if
      local.get $7
      f64.const 8.4784276603689e-32
      f64.mul
      local.get $0
      local.get $0
      local.get $7
      f64.const 2.0222662487111665e-21
      f64.mul
      local.tee $1
      f64.sub
      local.tee $0
      f64.sub
      local.get $1
      f64.sub
      f64.sub
      local.set $2
      local.get $0
      local.get $2
      f64.sub
      local.set $1
     end
    end
    local.get $1
    global.set $~lib/math/rempio2_y0
    local.get $0
    local.get $1
    f64.sub
    local.get $2
    f64.sub
    global.set $~lib/math/rempio2_y1
    local.get $7
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2|inlined.1
   end
   i32.const 0
   local.get $5
   call $~lib/math/pio2_large_quot
   local.tee $3
   i32.sub
   local.get $3
   local.get $6
   select
  end
  local.set $3
  global.get $~lib/math/rempio2_y0
  local.set $2
  global.get $~lib/math/rempio2_y1
  local.set $7
  local.get $3
  i32.const 1
  i32.and
  if (result f64)
   local.get $2
   local.get $2
   f64.mul
   local.tee $0
   local.get $0
   f64.mul
   local.set $1
   f64.const 1
   local.get $0
   f64.const 0.5
   f64.mul
   local.tee $8
   f64.sub
   local.tee $9
   f64.const 1
   local.get $9
   f64.sub
   local.get $8
   f64.sub
   local.get $0
   local.get $0
   local.get $0
   local.get $0
   f64.const 2.480158728947673e-05
   f64.mul
   f64.const -0.001388888888887411
   f64.add
   f64.mul
   f64.const 0.0416666666666666
   f64.add
   f64.mul
   local.get $1
   local.get $1
   f64.mul
   local.get $0
   local.get $0
   f64.const -1.1359647557788195e-11
   f64.mul
   f64.const 2.087572321298175e-09
   f64.add
   f64.mul
   f64.const -2.7557314351390663e-07
   f64.add
   f64.mul
   f64.add
   f64.mul
   local.get $2
   local.get $7
   f64.mul
   f64.sub
   f64.add
   f64.add
  else
   local.get $2
   local.get $2
   f64.mul
   local.tee $0
   local.get $2
   f64.mul
   local.set $1
   local.get $2
   local.get $0
   local.get $7
   f64.const 0.5
   f64.mul
   local.get $1
   local.get $0
   local.get $0
   f64.const 2.7557313707070068e-06
   f64.mul
   f64.const -1.984126982985795e-04
   f64.add
   f64.mul
   f64.const 0.00833333333332249
   f64.add
   local.get $0
   local.get $0
   local.get $0
   f64.mul
   f64.mul
   local.get $0
   f64.const 1.58969099521155e-10
   f64.mul
   f64.const -2.5050760253406863e-08
   f64.add
   f64.mul
   f64.add
   f64.mul
   f64.sub
   f64.mul
   local.get $7
   f64.sub
   local.get $1
   f64.const -0.16666666666666632
   f64.mul
   f64.sub
   f64.sub
  end
  local.tee $0
  f64.neg
  local.get $0
  local.get $3
  i32.const 2
  i32.and
  select
 )
 (func $~lib/math/NativeMath.cos (param $0 f64) (result f64)
  (local $1 f64)
  (local $2 f64)
  (local $3 i32)
  (local $4 i32)
  (local $5 i64)
  (local $6 i32)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  local.get $0
  i64.reinterpret_f64
  local.tee $5
  i64.const 32
  i64.shr_u
  i32.wrap_i64
  local.tee $3
  i32.const 31
  i32.shr_u
  local.set $6
  local.get $3
  i32.const 2147483647
  i32.and
  local.tee $3
  i32.const 1072243195
  i32.le_u
  if
   local.get $3
   i32.const 1044816030
   i32.lt_u
   if
    f64.const 1
    return
   end
   local.get $0
   local.get $0
   f64.mul
   local.tee $1
   local.get $1
   f64.mul
   local.set $2
   f64.const 1
   local.get $1
   f64.const 0.5
   f64.mul
   local.tee $7
   f64.sub
   local.tee $8
   f64.const 1
   local.get $8
   f64.sub
   local.get $7
   f64.sub
   local.get $1
   local.get $1
   local.get $1
   local.get $1
   f64.const 2.480158728947673e-05
   f64.mul
   f64.const -0.001388888888887411
   f64.add
   f64.mul
   f64.const 0.0416666666666666
   f64.add
   f64.mul
   local.get $2
   local.get $2
   f64.mul
   local.get $1
   local.get $1
   f64.const -1.1359647557788195e-11
   f64.mul
   f64.const 2.087572321298175e-09
   f64.add
   f64.mul
   f64.const -2.7557314351390663e-07
   f64.add
   f64.mul
   f64.add
   f64.mul
   local.get $0
   f64.const 0
   f64.mul
   f64.sub
   f64.add
   f64.add
   return
  end
  local.get $3
  i32.const 2146435072
  i32.ge_u
  if
   local.get $0
   local.get $0
   f64.sub
   return
  end
  block $~lib/math/rempio2|inlined.0 (result i32)
   local.get $5
   i64.const 32
   i64.shr_u
   i32.wrap_i64
   i32.const 2147483647
   i32.and
   local.tee $4
   i32.const 1073928572
   i32.lt_u
   if
    i32.const 1
    local.set $3
    local.get $6
    if (result f64)
     local.get $0
     f64.const 1.5707963267341256
     f64.add
     local.set $0
     i32.const -1
     local.set $3
     local.get $4
     i32.const 1073291771
     i32.ne
     if (result f64)
      local.get $0
      local.get $0
      f64.const 6.077100506506192e-11
      f64.add
      local.tee $0
      f64.sub
      f64.const 6.077100506506192e-11
      f64.add
     else
      local.get $0
      f64.const 6.077100506303966e-11
      f64.add
      local.tee $1
      f64.const 2.0222662487959506e-21
      f64.add
      local.set $0
      local.get $1
      local.get $0
      f64.sub
      f64.const 2.0222662487959506e-21
      f64.add
     end
    else
     local.get $0
     f64.const -1.5707963267341256
     f64.add
     local.set $0
     local.get $4
     i32.const 1073291771
     i32.ne
     if (result f64)
      local.get $0
      local.get $0
      f64.const -6.077100506506192e-11
      f64.add
      local.tee $0
      f64.sub
      f64.const -6.077100506506192e-11
      f64.add
     else
      local.get $0
      f64.const -6.077100506303966e-11
      f64.add
      local.tee $1
      f64.const -2.0222662487959506e-21
      f64.add
      local.set $0
      local.get $1
      local.get $0
      f64.sub
      f64.const -2.0222662487959506e-21
      f64.add
     end
    end
    local.get $0
    global.set $~lib/math/rempio2_y0
    global.set $~lib/math/rempio2_y1
    local.get $3
    br $~lib/math/rempio2|inlined.0
   end
   local.get $4
   i32.const 1094263291
   i32.lt_u
   if
    local.get $4
    i32.const 20
    i32.shr_u
    local.tee $3
    local.get $0
    local.get $0
    f64.const 0.6366197723675814
    f64.mul
    f64.nearest
    local.tee $7
    f64.const 1.5707963267341256
    f64.mul
    f64.sub
    local.tee $0
    local.get $7
    f64.const 6.077100506506192e-11
    f64.mul
    local.tee $2
    f64.sub
    local.tee $1
    i64.reinterpret_f64
    i64.const 32
    i64.shr_u
    i32.wrap_i64
    i32.const 20
    i32.shr_u
    i32.const 2047
    i32.and
    i32.sub
    i32.const 16
    i32.gt_u
    if
     local.get $7
     f64.const 2.0222662487959506e-21
     f64.mul
     local.get $0
     local.get $0
     local.get $7
     f64.const 6.077100506303966e-11
     f64.mul
     local.tee $1
     f64.sub
     local.tee $0
     f64.sub
     local.get $1
     f64.sub
     f64.sub
     local.set $2
     local.get $3
     local.get $0
     local.get $2
     f64.sub
     local.tee $1
     i64.reinterpret_f64
     i64.const 32
     i64.shr_u
     i32.wrap_i64
     i32.const 20
     i32.shr_u
     i32.const 2047
     i32.and
     i32.sub
     i32.const 49
     i32.gt_u
     if
      local.get $7
      f64.const 8.4784276603689e-32
      f64.mul
      local.get $0
      local.get $0
      local.get $7
      f64.const 2.0222662487111665e-21
      f64.mul
      local.tee $1
      f64.sub
      local.tee $0
      f64.sub
      local.get $1
      f64.sub
      f64.sub
      local.set $2
      local.get $0
      local.get $2
      f64.sub
      local.set $1
     end
    end
    local.get $1
    global.set $~lib/math/rempio2_y0
    local.get $0
    local.get $1
    f64.sub
    local.get $2
    f64.sub
    global.set $~lib/math/rempio2_y1
    local.get $7
    i32.trunc_sat_f64_s
    br $~lib/math/rempio2|inlined.0
   end
   i32.const 0
   local.get $5
   call $~lib/math/pio2_large_quot
   local.tee $3
   i32.sub
   local.get $3
   local.get $6
   select
  end
  local.set $3
  global.get $~lib/math/rempio2_y0
  local.set $1
  global.get $~lib/math/rempio2_y1
  local.set $2
  local.get $3
  i32.const 1
  i32.and
  if (result f64)
   local.get $1
   local.get $1
   f64.mul
   local.tee $0
   local.get $1
   f64.mul
   local.set $7
   local.get $1
   local.get $0
   local.get $2
   f64.const 0.5
   f64.mul
   local.get $7
   local.get $0
   local.get $0
   f64.const 2.7557313707070068e-06
   f64.mul
   f64.const -1.984126982985795e-04
   f64.add
   f64.mul
   f64.const 0.00833333333332249
   f64.add
   local.get $0
   local.get $0
   local.get $0
   f64.mul
   f64.mul
   local.get $0
   f64.const 1.58969099521155e-10
   f64.mul
   f64.const -2.5050760253406863e-08
   f64.add
   f64.mul
   f64.add
   f64.mul
   f64.sub
   f64.mul
   local.get $2
   f64.sub
   local.get $7
   f64.const -0.16666666666666632
   f64.mul
   f64.sub
   f64.sub
  else
   local.get $1
   local.get $1
   f64.mul
   local.tee $7
   local.get $7
   f64.mul
   local.set $8
   f64.const 1
   local.get $7
   f64.const 0.5
   f64.mul
   local.tee $0
   f64.sub
   local.tee $9
   f64.const 1
   local.get $9
   f64.sub
   local.get $0
   f64.sub
   local.get $7
   local.get $7
   local.get $7
   local.get $7
   f64.const 2.480158728947673e-05
   f64.mul
   f64.const -0.001388888888887411
   f64.add
   f64.mul
   f64.const 0.0416666666666666
   f64.add
   f64.mul
   local.get $8
   local.get $8
   f64.mul
   local.get $7
   local.get $7
   f64.const -1.1359647557788195e-11
   f64.mul
   f64.const 2.087572321298175e-09
   f64.add
   f64.mul
   f64.const -2.7557314351390663e-07
   f64.add
   f64.mul
   f64.add
   f64.mul
   local.get $1
   local.get $2
   f64.mul
   f64.sub
   f64.add
   f64.add
  end
  local.tee $0
  f64.neg
  local.get $0
  local.get $3
  i32.const 1
  i32.add
  i32.const 2
  i32.and
  select
 )
 (func $src/wasm/sm2.as/sm2Version (result i32)
  i32.const 1
 )
 (func $src/wasm/sm2.as/sm2UploadProgram (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  global.get $src/wasm/sm2.as/inited
  i32.eqz
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 0
  i32.le_s
  local.get $0
  global.get $src/wasm/sm2.as/tokCap
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  loop $while-continue|0
   local.get $0
   local.get $2
   i32.gt_s
   if
    block $while-break|0
     global.get $src/wasm/sm2.as/tokBuf
     local.set $5
     local.get $0
     local.get $2
     i32.le_s
     if (result i32)
      i32.const 0
     else
      local.get $5
      local.get $2
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     i32.const 65535
     i32.and
     local.tee $5
     i32.const 65535
     i32.eq
     br_if $while-break|0
     local.get $5
     call $src/wasm/sm2.as/opNops
     local.tee $6
     i32.const 0
     i32.lt_s
     br_if $while-break|0
     local.get $6
     local.get $2
     i32.const 1
     i32.add
     i32.add
     local.set $2
     local.get $5
     i32.const 31
     i32.eq
     br_if $while-continue|0
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $while-continue|0
    end
   end
  end
  local.get $3
  i32.const 96
  i32.mul
  local.tee $2
  i32.const 48
  i32.add
  local.get $3
  i32.const 5
  i32.shl
  i32.add
  call $~lib/memory/heap.alloc
  local.set $10
  local.get $2
  local.get $10
  i32.const 48
  i32.add
  local.tee $2
  i32.add
  local.set $11
  i32.const 0
  global.set $src/wasm/sm2.as/curReadSet
  local.get $10
  local.get $3
  i32.store
  local.get $10
  local.get $1
  i32.store offset=4
  local.get $2
  local.set $1
  i32.const 0
  local.set $2
  loop $while-continue|1
   local.get $0
   local.get $2
   i32.gt_s
   if
    block $while-break|1
     global.get $src/wasm/sm2.as/tokBuf
     local.set $3
     local.get $0
     local.get $2
     i32.le_s
     if (result i32)
      i32.const 0
     else
      local.get $3
      local.get $2
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     i32.const 65535
     i32.and
     local.tee $12
     i32.const 65535
     i32.eq
     br_if $while-break|1
     local.get $12
     call $src/wasm/sm2.as/opNops
     local.tee $13
     i32.const 0
     i32.lt_s
     br_if $while-break|1
     global.get $src/wasm/sm2.as/tokBuf
     local.set $3
     local.get $0
     local.get $2
     i32.const 1
     i32.add
     local.tee $2
     i32.le_s
     if (result i32)
      i32.const 0
     else
      local.get $3
      local.get $2
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $3
     global.get $src/wasm/sm2.as/tokBuf
     local.set $5
     local.get $2
     i32.const 1
     i32.add
     local.tee $6
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $5
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $5
     global.get $src/wasm/sm2.as/tokBuf
     local.set $6
     local.get $2
     i32.const 2
     i32.add
     local.tee $7
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $6
      local.get $7
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $6
     global.get $src/wasm/sm2.as/tokBuf
     local.set $7
     local.get $2
     i32.const 3
     i32.add
     local.tee $8
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $7
      local.get $8
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $7
     global.get $src/wasm/sm2.as/tokBuf
     local.set $8
     local.get $2
     i32.const 4
     i32.add
     local.tee $9
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $8
      local.get $9
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $8
     local.get $2
     local.get $13
     i32.add
     local.set $2
     local.get $12
     i32.const 31
     i32.eq
     br_if $while-continue|1
     local.get $12
     i32.const 81
     i32.eq
     if
      local.get $1
      i32.const 1
      i32.store
      local.get $1
      i32.const 15
      i32.store offset=4
      local.get $3
      i32.const 2047
      i32.and
      local.set $9
      local.get $1
      block $__inlined_func$src/wasm/sm2.as/bindDstDec$53 (result i32)
       global.get $src/wasm/sm2.as/oBase
       local.get $3
       i32.const 28
       i32.shr_u
       i32.const 7
       i32.and
       local.get $3
       i32.const 8
       i32.shr_u
       i32.const 24
       i32.and
       i32.or
       local.tee $3
       i32.const 8
       i32.eq
       local.get $3
       i32.const 7
       i32.eq
       i32.or
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$53
       drop
       local.get $9
       i32.const 5
       i32.shl
       local.tee $12
       global.get $src/wasm/sm2.as/constBuf
       i32.add
       i32.const 0
       local.get $9
       i32.const 64
       i32.lt_u
       select
       local.get $3
       i32.const 2
       i32.eq
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$53
       drop
       global.get $src/wasm/sm2.as/rBase
       local.get $12
       i32.add
       i32.const 0
       local.get $9
       i32.const 32
       i32.lt_u
       select
      end
      i32.store offset=8
      local.get $11
      local.get $4
      i32.const 5
      i32.shl
      i32.add
      local.tee $3
      local.get $5
      f32.reinterpret_i32
      f64.promote_f32
      f64.store
      local.get $3
      local.get $6
      f32.reinterpret_i32
      f64.promote_f32
      f64.store offset=8
      local.get $3
      local.get $7
      f32.reinterpret_i32
      f64.promote_f32
      f64.store offset=16
      local.get $3
      local.get $8
      f32.reinterpret_i32
      f64.promote_f32
      f64.store offset=24
      local.get $1
      local.get $3
      i32.store offset=16
      local.get $1
      i32.const 228
      i32.store offset=24
      local.get $1
      global.get $src/wasm/sm2.as/nanCell
      i32.store offset=32
      local.get $1
      i32.const 0
      i32.store offset=40
      local.get $1
      global.get $src/wasm/sm2.as/nanCell
      i32.store offset=48
      local.get $1
      i32.const 0
      i32.store offset=56
      local.get $1
      i32.const -64
      i32.sub
      i32.const 0
      i32.store
      local.get $1
      i32.const 255
      i32.store offset=68
     else
      local.get $3
      i32.const 16
      i32.shr_u
      i32.const 15
      i32.and
      local.set $14
      local.get $3
      i32.const 2047
      i32.and
      local.set $8
      local.get $1
      i32.const 0
      local.get $12
      block $__inlined_func$src/wasm/sm2.as/bindDstDec$60 (result i32)
       global.get $src/wasm/sm2.as/oBase
       local.get $3
       i32.const 28
       i32.shr_u
       i32.const 7
       i32.and
       local.get $3
       i32.const 8
       i32.shr_u
       i32.const 24
       i32.and
       i32.or
       local.tee $9
       i32.const 8
       i32.eq
       local.get $9
       i32.const 7
       i32.eq
       i32.or
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$60
       drop
       local.get $8
       i32.const 5
       i32.shl
       local.tee $15
       global.get $src/wasm/sm2.as/constBuf
       i32.add
       i32.const 0
       local.get $8
       i32.const 64
       i32.lt_u
       select
       local.get $9
       i32.const 2
       i32.eq
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$60
       drop
       global.get $src/wasm/sm2.as/rBase
       local.get $15
       i32.add
       i32.const 0
       local.get $8
       i32.const 32
       i32.lt_u
       select
      end
      local.tee $8
      i32.eqz
      local.get $14
      i32.eqz
      i32.or
      select
      i32.store
      local.get $1
      local.get $14
      i32.const 16
      i32.const 0
      local.get $3
      i32.const 20
      i32.shr_u
      i32.const 15
      i32.and
      i32.const 1
      i32.eq
      select
      i32.or
      i32.store offset=4
      local.get $1
      local.get $8
      i32.store offset=8
      local.get $1
      i32.const -64
      i32.sub
      i32.const 0
      i32.store
      local.get $1
      i32.const 16
      i32.const 24
      i32.const 0
      local.get $5
      call $src/wasm/sm2.as/decodeSrc
      local.get $13
      i32.const 3
      i32.ge_s
      if
       local.get $1
       i32.const 32
       i32.const 40
       i32.const 1
       local.get $6
       call $src/wasm/sm2.as/decodeSrc
      else
       local.get $1
       global.get $src/wasm/sm2.as/nanCell
       i32.store offset=32
       local.get $1
       i32.const 0
       i32.store offset=40
      end
      local.get $13
      i32.const 4
      i32.ge_s
      if
       local.get $1
       i32.const 48
       i32.const 56
       i32.const 2
       local.get $7
       call $src/wasm/sm2.as/decodeSrc
      else
       local.get $1
       global.get $src/wasm/sm2.as/nanCell
       i32.store offset=48
       local.get $1
       i32.const 0
       i32.store offset=56
      end
      local.get $1
      i32.const 255
      local.get $6
      i32.const 2047
      i32.and
      local.get $12
      i32.const 66
      i32.ne
      select
      i32.store offset=68
     end
     local.get $1
     i32.const 96
     i32.add
     local.set $1
     local.get $4
     i32.const 1
     i32.add
     local.set $4
     br $while-continue|1
    end
   end
  end
  i32.const 0
  local.set $1
  i32.const 0
  local.set $0
  loop $for-loop|2
   local.get $0
   i32.const 32
   i32.lt_s
   if
    global.get $src/wasm/sm2.as/curReadSet
    i32.const 1
    local.get $0
    i32.shl
    i32.and
    if
     local.get $10
     i32.const 16
     i32.add
     local.get $1
     i32.add
     local.get $0
     i32.store8
     local.get $1
     i32.const 1
     i32.add
     local.set $1
    end
    local.get $0
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|2
   end
  end
  local.get $10
  global.get $src/wasm/sm2.as/curReadSet
  i32.store offset=8
  local.get $10
  local.get $1
  i32.store offset=12
  i32.const 0
  local.set $0
  loop $for-loop|3
   local.get $0
   i32.const 256
   i32.lt_s
   if
    global.get $src/wasm/sm2.as/progTable
    local.get $0
    i32.const 3
    i32.shl
    i32.add
    local.tee $1
    i32.load
    i32.eqz
    if
     local.get $1
     local.get $10
     i32.store
     local.get $0
     i32.const 1
     i32.add
     return
    end
    local.get $0
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|3
   end
  end
  i32.const 0
 )
 (func $src/wasm/sm2.as/sm2TokenBuf (result i32)
  global.get $src/wasm/sm2.as/tokBuf
 )
 (func $src/wasm/sm2.as/sm2TexBuf (result i32)
  global.get $src/wasm/sm2.as/texBuf
 )
 (func $src/wasm/sm2.as/sm2RunImage (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 f64) (result i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i64)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  block $folding-inner0
   global.get $src/wasm/sm2.as/inited
   i32.eqz
   br_if $folding-inner0
   local.get $0
   i32.eqz
   local.get $0
   i32.const 256
   i32.gt_u
   i32.or
   br_if $folding-inner0
   global.get $src/wasm/sm2.as/progTable
   local.get $0
   i32.const 1
   i32.sub
   i32.const 3
   i32.shl
   i32.add
   i32.load
   local.tee $8
   i32.eqz
   br_if $folding-inner0
   local.get $2
   i32.const 0
   i32.le_s
   local.get $1
   i32.const 0
   i32.le_s
   i32.or
   br_if $folding-inner0
   local.get $1
   i64.extend_i32_s
   local.get $2
   i64.extend_i32_s
   i64.mul
   i64.const 2
   i64.shl
   local.tee $9
   global.get $src/wasm/sm2.as/texCap
   i64.extend_i32_s
   i64.gt_u
   br_if $folding-inner0
   global.get $src/wasm/sm2.as/outCap
   i64.extend_i32_s
   local.get $9
   i64.lt_u
   br_if $folding-inner0
   local.get $1
   global.set $src/wasm/sm2.as/texW
   local.get $2
   global.set $src/wasm/sm2.as/texH
   global.get $src/wasm/sm2.as/vBase
   i32.const 0
   i32.const 64
   memory.fill
   global.get $src/wasm/sm2.as/vBase
   f64.const 0
   f64.const 1
   local.get $3
   local.get $3
   f64.const 1
   f64.gt
   select
   local.get $3
   f64.const 0
   f64.lt
   select
   f64.store
   global.get $src/wasm/sm2.as/vBase
   f64.const 0
   f64.const 1
   local.get $4
   local.get $4
   f64.const 1
   f64.gt
   select
   local.get $4
   f64.const 0
   f64.lt
   select
   f64.store offset=8
   global.get $src/wasm/sm2.as/vBase
   f64.const 0
   f64.const 1
   local.get $5
   local.get $5
   f64.const 1
   f64.gt
   select
   local.get $5
   f64.const 0
   f64.lt
   select
   f64.store offset=16
   global.get $src/wasm/sm2.as/vBase
   f64.const 1
   f64.store offset=24
   global.get $src/wasm/sm2.as/tBase
   i32.const 0
   i32.const 256
   memory.fill
   local.get $1
   f64.convert_i32_s
   local.set $3
   local.get $2
   f64.convert_i32_s
   local.set $6
   loop $for-loop|0
    local.get $2
    local.get $7
    i32.gt_s
    if
     i32.const 0
     local.set $0
     loop $for-loop|1
      local.get $0
      local.get $1
      i32.lt_s
      if
       local.get $1
       local.get $7
       i32.mul
       local.get $0
       i32.add
       i32.const 2
       i32.shl
       local.set $10
       local.get $8
       local.get $0
       f64.convert_i32_s
       f64.const 0.5
       f64.add
       local.get $3
       f64.div
       local.get $7
       f64.convert_i32_s
       f64.const 0.5
       f64.add
       local.get $6
       f64.div
       call $src/wasm/sm2.as/execPixel
       if
        global.get $src/wasm/sm2.as/outBuf
        local.get $10
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$173 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load
         local.tee $4
         local.get $4
         f64.const 1
         f64.gt
         select
         local.get $4
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $4
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$173
         drop
         i32.const 255
         local.get $4
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$173
         drop
         local.get $4
         local.get $4
         f64.floor
         local.tee $4
         f64.sub
         local.set $5
         local.get $4
         i32.trunc_sat_f64_u
         local.tee $11
         local.get $5
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$173
         drop
         local.get $11
         i32.const 1
         i32.add
         local.tee $12
         local.get $5
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$173
         drop
         local.get $12
         local.get $11
         local.get $11
         i32.const 1
         i32.and
         select
        end
        i32.store8
        global.get $src/wasm/sm2.as/outBuf
        local.get $10
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$175 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load offset=8
         local.tee $4
         local.get $4
         f64.const 1
         f64.gt
         select
         local.get $4
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $4
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$175
         drop
         i32.const 255
         local.get $4
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$175
         drop
         local.get $4
         local.get $4
         f64.floor
         local.tee $4
         f64.sub
         local.set $5
         local.get $4
         i32.trunc_sat_f64_u
         local.tee $11
         local.get $5
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$175
         drop
         local.get $11
         i32.const 1
         i32.add
         local.tee $12
         local.get $5
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$175
         drop
         local.get $12
         local.get $11
         local.get $11
         i32.const 1
         i32.and
         select
        end
        i32.store8 offset=1
        global.get $src/wasm/sm2.as/outBuf
        local.get $10
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$177 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load offset=16
         local.tee $4
         local.get $4
         f64.const 1
         f64.gt
         select
         local.get $4
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $4
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$177
         drop
         i32.const 255
         local.get $4
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$177
         drop
         local.get $4
         local.get $4
         f64.floor
         local.tee $4
         f64.sub
         local.set $5
         local.get $4
         i32.trunc_sat_f64_u
         local.tee $11
         local.get $5
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$177
         drop
         local.get $11
         i32.const 1
         i32.add
         local.tee $12
         local.get $5
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$177
         drop
         local.get $12
         local.get $11
         local.get $11
         i32.const 1
         i32.and
         select
        end
        i32.store8 offset=2
        global.get $src/wasm/sm2.as/outBuf
        local.get $10
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$179 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load offset=24
         local.tee $4
         local.get $4
         f64.const 1
         f64.gt
         select
         local.get $4
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $4
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$179
         drop
         i32.const 255
         local.get $4
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$179
         drop
         local.get $4
         local.get $4
         f64.floor
         local.tee $4
         f64.sub
         local.set $5
         local.get $4
         i32.trunc_sat_f64_u
         local.tee $10
         local.get $5
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$179
         drop
         local.get $10
         i32.const 1
         i32.add
         local.tee $11
         local.get $5
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$179
         drop
         local.get $11
         local.get $10
         local.get $10
         i32.const 1
         i32.and
         select
        end
        i32.store8 offset=3
       else
        global.get $src/wasm/sm2.as/outBuf
        local.get $10
        i32.add
        local.tee $10
        i32.const 0
        i32.store8
        local.get $10
        i32.const 0
        i32.store8 offset=1
        local.get $10
        i32.const 0
        i32.store8 offset=2
        local.get $10
        i32.const 0
        i32.store8 offset=3
       end
       local.get $0
       i32.const 1
       i32.add
       local.set $0
       br $for-loop|1
      end
     end
     local.get $7
     i32.const 1
     i32.add
     local.set $7
     br $for-loop|0
    end
   end
   i32.const 1
   return
  end
  i32.const 0
 )
 (func $src/wasm/sm2.as/sm2OutBuf (result i32)
  global.get $src/wasm/sm2.as/outBuf
 )
 (func $src/wasm/sm2.as/sm2Init (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  global.get $src/wasm/sm2.as/inited
  if
   i32.const 1
   return
  end
  local.get $1
  i32.const 0
  i32.le_s
  local.get $0
  i32.const 0
  i32.le_s
  i32.or
  local.get $2
  i32.const 0
  i32.le_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/tokBuf
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/constBuf
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/texBuf
  local.get $2
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/outBuf
  i32.const 1024
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/rBase
  i32.const 256
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/tBase
  i32.const 64
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/vBase
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/oBase
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/sampOutBuf
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilA
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilB
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilC
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilD
  i32.const 8
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/nanCell
  global.get $src/wasm/sm2.as/nanCell
  f64.const nan:0x8000000000000
  f64.store
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/progTable
  global.get $src/wasm/sm2.as/progTable
  i32.const 0
  i32.const 2048
  memory.fill
  local.get $0
  global.set $src/wasm/sm2.as/tokCap
  local.get $1
  global.set $src/wasm/sm2.as/texCap
  local.get $2
  global.set $src/wasm/sm2.as/outCap
  i32.const 1
  global.set $src/wasm/sm2.as/inited
  i32.const 1
 )
 (func $src/wasm/sm2.as/sm2ConstBuf (result i32)
  global.get $src/wasm/sm2.as/constBuf
 )
 (func $src/wasm/sm2.as/sm2Caps (result i64)
  global.get $src/wasm/sm2.as/outCap
  i64.extend_i32_s
  global.get $src/wasm/sm2.as/tokCap
  i64.extend_i32_s
  i64.const 40
  i64.shl
  global.get $src/wasm/sm2.as/texCap
  i64.extend_i32_s
  i64.const 20
  i64.shl
  i64.or
  i64.or
 )
 (func $src/wasm/sm2.as/execPixel (param $0 i32) (param $1 f64) (param $2 f64) (result i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  (local $16 i32)
  (local $17 f64)
  (local $18 f64)
  (local $19 f64)
  (local $20 f64)
  (local $21 f64)
  global.get $src/wasm/sm2.as/rBase
  i32.const 0
  i32.const 1024
  memory.fill
  global.get $src/wasm/sm2.as/oBase
  i32.const 0
  i32.const 32
  memory.fill
  global.get $src/wasm/sm2.as/tBase
  local.get $1
  f64.store
  global.get $src/wasm/sm2.as/tBase
  local.get $2
  f64.store offset=8
  local.get $0
  i32.load
  local.set $5
  local.get $0
  i32.load offset=12
  local.set $6
  loop $for-loop|0
   local.get $3
   local.get $6
   i32.lt_s
   if
    global.get $src/wasm/sm2.as/rBase
    local.get $0
    i32.const 16
    i32.add
    local.get $3
    i32.add
    i32.load8_u
    i32.const 5
    i32.shl
    i32.add
    local.tee $7
    f64.const 0
    f64.store
    local.get $7
    f64.const 0
    f64.store offset=8
    local.get $7
    f64.const 0
    f64.store offset=16
    local.get $7
    f64.const 0
    f64.store offset=24
    local.get $3
    i32.const 1
    i32.add
    local.set $3
    br $for-loop|0
   end
  end
  local.get $0
  i32.const 48
  i32.add
  local.set $3
  loop $for-loop|1
   local.get $4
   local.get $5
   i32.lt_s
   if
    block $for-continue|1
     local.get $3
     i32.load
     local.tee $0
     i32.const 65
     i32.eq
     if
      local.get $3
      i32.load offset=16
      local.tee $0
      local.get $3
      i32.load offset=24
      local.tee $6
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $3
      i32.const -64
      i32.sub
      i32.load
      i32.const 1
      i32.and
      local.tee $7
      select
      f64.const 0
      f64.lt
      if (result i32)
       i32.const 1
      else
       local.get $0
       local.get $6
       i32.const 2
       i32.shr_u
       i32.const 3
       i32.and
       i32.const 3
       i32.shl
       i32.add
       f64.load
       local.tee $1
       f64.neg
       local.get $1
       local.get $7
       select
       f64.const 0
       f64.lt
      end
      if (result i32)
       i32.const 1
      else
       local.get $0
       local.get $6
       i32.const 4
       i32.shr_u
       i32.const 3
       i32.and
       i32.const 3
       i32.shl
       i32.add
       f64.load
       local.tee $1
       f64.neg
       local.get $1
       local.get $7
       select
       f64.const 0
       f64.lt
      end
      if
       i32.const 0
       return
      end
      br $for-continue|1
     end
     local.get $3
     i32.load offset=4
     local.tee $7
     i32.const 15
     i32.and
     local.tee $8
     i32.eqz
     br_if $for-continue|1
     local.get $3
     i32.load offset=8
     local.tee $6
     i32.eqz
     br_if $for-continue|1
     local.get $7
     i32.const 16
     i32.and
     i32.const 0
     i32.ne
     local.set $7
     local.get $3
     i32.const -64
     i32.sub
     i32.load
     local.set $9
     block $break|2
      block $case24|2
       block $case23|2
        block $case22|2
         block $case21|2
          block $case20|2
           block $case19|2
            block $case18|2
             block $case17|2
              block $case16|2
               block $case15|2
                block $case14|2
                 block $case13|2
                  block $case12|2
                   block $case11|2
                    block $case10|2
                     block $case9|2
                      block $case8|2
                       block $case7|2
                        block $case6|2
                         block $case5|2
                          block $case4|2
                           block $case3|2
                            block $case2|2
                             block $case1|2
                              local.get $0
                              i32.const 1
                              i32.ne
                              if
                               local.get $0
                               i32.const 2
                               i32.eq
                               br_if $case1|2
                               local.get $0
                               i32.const 3
                               i32.eq
                               br_if $case2|2
                               local.get $0
                               i32.const 4
                               i32.eq
                               br_if $case3|2
                               local.get $0
                               i32.const 5
                               i32.eq
                               br_if $case4|2
                               local.get $0
                               i32.const 6
                               i32.eq
                               br_if $case5|2
                               local.get $0
                               i32.const 7
                               i32.eq
                               br_if $case6|2
                               local.get $0
                               i32.const 8
                               i32.eq
                               br_if $case7|2
                               local.get $0
                               i32.const 9
                               i32.eq
                               br_if $case8|2
                               local.get $0
                               i32.const 10
                               i32.eq
                               br_if $case9|2
                               local.get $0
                               i32.const 11
                               i32.eq
                               br_if $case10|2
                               local.get $0
                               i32.const 12
                               i32.eq
                               br_if $case11|2
                               local.get $0
                               i32.const 13
                               i32.eq
                               br_if $case12|2
                               local.get $0
                               i32.const 14
                               i32.eq
                               br_if $case13|2
                               local.get $0
                               i32.const 15
                               i32.eq
                               br_if $case14|2
                               local.get $0
                               i32.const 18
                               i32.eq
                               br_if $case15|2
                               local.get $0
                               i32.const 19
                               i32.eq
                               br_if $case16|2
                               local.get $0
                               i32.const 32
                               i32.eq
                               br_if $case17|2
                               local.get $0
                               i32.const 33
                               i32.eq
                               br_if $case18|2
                               local.get $0
                               i32.const 35
                               i32.eq
                               br_if $case19|2
                               local.get $0
                               i32.const 36
                               i32.eq
                               br_if $case20|2
                               local.get $0
                               i32.const 37
                               i32.eq
                               br_if $case21|2
                               local.get $0
                               i32.const 66
                               i32.eq
                               br_if $case22|2
                               local.get $0
                               i32.const 88
                               i32.eq
                               br_if $case23|2
                               local.get $0
                               i32.const 90
                               i32.eq
                               br_if $case24|2
                               br $break|2
                              end
                              local.get $3
                              i32.load offset=16
                              local.set $0
                              local.get $3
                              i32.load offset=24
                              local.set $10
                              local.get $9
                              i32.const 1
                              i32.and
                              local.set $9
                              local.get $8
                              i32.const 1
                              i32.and
                              if
                               local.get $0
                               local.get $10
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $6
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store
                              end
                              local.get $8
                              i32.const 2
                              i32.and
                              if
                               local.get $0
                               local.get $10
                               i32.const 2
                               i32.shr_u
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $6
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store offset=8
                              end
                              local.get $8
                              i32.const 4
                              i32.and
                              if
                               local.get $0
                               local.get $10
                               i32.const 4
                               i32.shr_u
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $6
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store offset=16
                              end
                              local.get $8
                              i32.const 8
                              i32.and
                              if
                               local.get $0
                               local.get $10
                               i32.const 6
                               i32.shr_u
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $6
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store offset=24
                              end
                              br $break|2
                             end
                             local.get $3
                             i32.load offset=16
                             local.set $0
                             local.get $3
                             i32.load offset=24
                             local.set $10
                             local.get $9
                             i32.const 1
                             i32.and
                             local.set $11
                             local.get $3
                             i32.load offset=32
                             local.set $12
                             local.get $3
                             i32.load offset=40
                             local.set $13
                             local.get $9
                             i32.const 2
                             i32.and
                             i32.const 0
                             i32.ne
                             local.set $9
                             local.get $8
                             i32.const 1
                             i32.and
                             if
                              local.get $0
                              local.get $10
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $6
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store
                             end
                             local.get $8
                             i32.const 2
                             i32.and
                             if
                              local.get $0
                              local.get $10
                              i32.const 2
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 2
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $6
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store offset=8
                             end
                             local.get $8
                             i32.const 4
                             i32.and
                             if
                              local.get $0
                              local.get $10
                              i32.const 4
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 4
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $6
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store offset=16
                             end
                             local.get $8
                             i32.const 8
                             i32.and
                             if
                              local.get $0
                              local.get $10
                              i32.const 6
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 6
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $6
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store offset=24
                             end
                             br $break|2
                            end
                            local.get $3
                            i32.load offset=16
                            local.set $0
                            local.get $3
                            i32.load offset=24
                            local.set $10
                            local.get $9
                            i32.const 1
                            i32.and
                            local.set $11
                            local.get $3
                            i32.load offset=32
                            local.set $12
                            local.get $3
                            i32.load offset=40
                            local.set $13
                            local.get $9
                            i32.const 2
                            i32.and
                            i32.const 0
                            i32.ne
                            local.set $9
                            local.get $8
                            i32.const 1
                            i32.and
                            if
                             local.get $0
                             local.get $10
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $6
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store
                            end
                            local.get $8
                            i32.const 2
                            i32.and
                            if
                             local.get $0
                             local.get $10
                             i32.const 2
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 2
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $6
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store offset=8
                            end
                            local.get $8
                            i32.const 4
                            i32.and
                            if
                             local.get $0
                             local.get $10
                             i32.const 4
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 4
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $6
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store offset=16
                            end
                            local.get $8
                            i32.const 8
                            i32.and
                            if
                             local.get $0
                             local.get $10
                             i32.const 6
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 6
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $6
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store offset=24
                            end
                            br $break|2
                           end
                           local.get $3
                           i32.load offset=16
                           local.set $0
                           local.get $3
                           i32.load offset=24
                           local.set $10
                           local.get $9
                           i32.const 1
                           i32.and
                           local.set $11
                           local.get $3
                           i32.load offset=32
                           local.set $12
                           local.get $3
                           i32.load offset=40
                           local.set $13
                           local.get $9
                           i32.const 2
                           i32.and
                           i32.const 0
                           i32.ne
                           local.set $14
                           local.get $3
                           i32.load offset=48
                           local.set $15
                           local.get $3
                           i32.load offset=56
                           local.set $16
                           local.get $9
                           i32.const 4
                           i32.and
                           i32.const 0
                           i32.ne
                           local.set $9
                           local.get $8
                           i32.const 1
                           i32.and
                           if
                            local.get $0
                            local.get $10
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $6
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store
                           end
                           local.get $8
                           i32.const 2
                           i32.and
                           if
                            local.get $0
                            local.get $10
                            i32.const 2
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 2
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 2
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $6
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store offset=8
                           end
                           local.get $8
                           i32.const 4
                           i32.and
                           if
                            local.get $0
                            local.get $10
                            i32.const 4
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 4
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 4
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $6
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store offset=16
                           end
                           local.get $8
                           i32.const 8
                           i32.and
                           if
                            local.get $0
                            local.get $10
                            i32.const 6
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 6
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 6
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $6
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store offset=24
                           end
                           br $break|2
                          end
                          local.get $3
                          i32.load offset=16
                          local.set $0
                          local.get $3
                          i32.load offset=24
                          local.set $10
                          local.get $9
                          i32.const 1
                          i32.and
                          local.set $11
                          local.get $3
                          i32.load offset=32
                          local.set $12
                          local.get $3
                          i32.load offset=40
                          local.set $13
                          local.get $9
                          i32.const 2
                          i32.and
                          i32.const 0
                          i32.ne
                          local.set $9
                          local.get $8
                          i32.const 1
                          i32.and
                          if
                           local.get $0
                           local.get $10
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $6
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store
                          end
                          local.get $8
                          i32.const 2
                          i32.and
                          if
                           local.get $0
                           local.get $10
                           i32.const 2
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 2
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $6
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store offset=8
                          end
                          local.get $8
                          i32.const 4
                          i32.and
                          if
                           local.get $0
                           local.get $10
                           i32.const 4
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 4
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $6
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store offset=16
                          end
                          local.get $8
                          i32.const 8
                          i32.and
                          if
                           local.get $0
                           local.get $10
                           i32.const 6
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 6
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $6
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store offset=24
                          end
                          br $break|2
                         end
                         local.get $3
                         i32.load offset=16
                         local.set $0
                         local.get $3
                         i32.load offset=24
                         local.set $10
                         local.get $9
                         i32.const 1
                         i32.and
                         local.set $9
                         local.get $8
                         i32.const 1
                         i32.and
                         if
                          f64.const 1
                          local.get $0
                          local.get $10
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $6
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store
                         end
                         local.get $8
                         i32.const 2
                         i32.and
                         if
                          f64.const 1
                          local.get $0
                          local.get $10
                          i32.const 2
                          i32.shr_u
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $6
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store offset=8
                         end
                         local.get $8
                         i32.const 4
                         i32.and
                         if
                          f64.const 1
                          local.get $0
                          local.get $10
                          i32.const 4
                          i32.shr_u
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $6
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store offset=16
                         end
                         local.get $8
                         i32.const 8
                         i32.and
                         if
                          f64.const 1
                          local.get $0
                          local.get $10
                          i32.const 6
                          i32.shr_u
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $6
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store offset=24
                         end
                         br $break|2
                        end
                        local.get $3
                        i32.load offset=16
                        local.set $0
                        local.get $3
                        i32.load offset=24
                        local.set $10
                        local.get $9
                        i32.const 1
                        i32.and
                        local.set $9
                        local.get $8
                        i32.const 1
                        i32.and
                        if
                         f64.const 1
                         local.get $0
                         local.get $10
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $6
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store
                        end
                        local.get $8
                        i32.const 2
                        i32.and
                        if
                         f64.const 1
                         local.get $0
                         local.get $10
                         i32.const 2
                         i32.shr_u
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $6
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store offset=8
                        end
                        local.get $8
                        i32.const 4
                        i32.and
                        if
                         f64.const 1
                         local.get $0
                         local.get $10
                         i32.const 4
                         i32.shr_u
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $6
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store offset=16
                        end
                        local.get $8
                        i32.const 8
                        i32.and
                        if
                         f64.const 1
                         local.get $0
                         local.get $10
                         i32.const 6
                         i32.shr_u
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $6
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store offset=24
                        end
                        br $break|2
                       end
                       local.get $3
                       i32.load offset=16
                       local.tee $0
                       local.get $3
                       i32.load offset=24
                       local.tee $10
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       i32.const 1
                       i32.and
                       local.tee $11
                       select
                       local.get $3
                       i32.load offset=32
                       local.tee $12
                       local.get $3
                       i32.load offset=40
                       local.tee $13
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       i32.const 2
                       i32.and
                       i32.const 0
                       i32.ne
                       local.tee $9
                       select
                       f64.mul
                       local.get $0
                       local.get $10
                       i32.const 2
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $11
                       select
                       local.get $12
                       local.get $13
                       i32.const 2
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       select
                       f64.mul
                       f64.add
                       local.get $0
                       local.get $10
                       i32.const 4
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $11
                       select
                       local.get $12
                       local.get $13
                       i32.const 4
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       select
                       f64.mul
                       f64.add
                       local.set $1
                       local.get $8
                       i32.const 1
                       i32.and
                       if
                        local.get $6
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store
                       end
                       local.get $8
                       i32.const 2
                       i32.and
                       if
                        local.get $6
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store offset=8
                       end
                       local.get $8
                       i32.const 4
                       i32.and
                       if
                        local.get $6
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store offset=16
                       end
                       local.get $8
                       i32.const 8
                       i32.and
                       if
                        local.get $6
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store offset=24
                       end
                       br $break|2
                      end
                      local.get $3
                      i32.load offset=16
                      local.tee $0
                      local.get $3
                      i32.load offset=24
                      local.tee $10
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      i32.const 1
                      i32.and
                      local.tee $11
                      select
                      local.get $3
                      i32.load offset=32
                      local.tee $12
                      local.get $3
                      i32.load offset=40
                      local.tee $13
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      i32.const 2
                      i32.and
                      i32.const 0
                      i32.ne
                      local.tee $9
                      select
                      f64.mul
                      local.get $0
                      local.get $10
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.mul
                      f64.add
                      local.get $0
                      local.get $10
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.mul
                      f64.add
                      local.get $0
                      local.get $10
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.mul
                      f64.add
                      local.set $1
                      local.get $8
                      i32.const 1
                      i32.and
                      if
                       local.get $6
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store
                      end
                      local.get $8
                      i32.const 2
                      i32.and
                      if
                       local.get $6
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store offset=8
                      end
                      local.get $8
                      i32.const 4
                      i32.and
                      if
                       local.get $6
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store offset=16
                      end
                      local.get $8
                      i32.const 8
                      i32.and
                      if
                       local.get $6
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store offset=24
                      end
                      br $break|2
                     end
                     local.get $3
                     i32.load offset=16
                     local.set $0
                     local.get $3
                     i32.load offset=24
                     local.set $10
                     local.get $9
                     i32.const 1
                     i32.and
                     local.set $11
                     local.get $3
                     i32.load offset=32
                     local.set $12
                     local.get $3
                     i32.load offset=40
                     local.set $13
                     local.get $9
                     i32.const 2
                     i32.and
                     i32.const 0
                     i32.ne
                     local.set $9
                     local.get $8
                     i32.const 1
                     i32.and
                     if
                      local.get $0
                      local.get $10
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $6
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store
                     end
                     local.get $8
                     i32.const 2
                     i32.and
                     if
                      local.get $0
                      local.get $10
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $6
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store offset=8
                     end
                     local.get $8
                     i32.const 4
                     i32.and
                     if
                      local.get $0
                      local.get $10
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $6
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store offset=16
                     end
                     local.get $8
                     i32.const 8
                     i32.and
                     if
                      local.get $0
                      local.get $10
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $6
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store offset=24
                     end
                     br $break|2
                    end
                    local.get $3
                    i32.load offset=16
                    local.set $0
                    local.get $3
                    i32.load offset=24
                    local.set $10
                    local.get $9
                    i32.const 1
                    i32.and
                    local.set $11
                    local.get $3
                    i32.load offset=32
                    local.set $12
                    local.get $3
                    i32.load offset=40
                    local.set $13
                    local.get $9
                    i32.const 2
                    i32.and
                    i32.const 0
                    i32.ne
                    local.set $9
                    local.get $8
                    i32.const 1
                    i32.and
                    if
                     local.get $0
                     local.get $10
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $6
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store
                    end
                    local.get $8
                    i32.const 2
                    i32.and
                    if
                     local.get $0
                     local.get $10
                     i32.const 2
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 2
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $6
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store offset=8
                    end
                    local.get $8
                    i32.const 4
                    i32.and
                    if
                     local.get $0
                     local.get $10
                     i32.const 4
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 4
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $6
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store offset=16
                    end
                    local.get $8
                    i32.const 8
                    i32.and
                    if
                     local.get $0
                     local.get $10
                     i32.const 6
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 6
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $6
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store offset=24
                    end
                    br $break|2
                   end
                   local.get $3
                   i32.load offset=16
                   local.set $0
                   local.get $3
                   i32.load offset=24
                   local.set $10
                   local.get $9
                   i32.const 1
                   i32.and
                   local.set $11
                   local.get $3
                   i32.load offset=32
                   local.set $12
                   local.get $3
                   i32.load offset=40
                   local.set $13
                   local.get $9
                   i32.const 2
                   i32.and
                   i32.const 0
                   i32.ne
                   local.set $9
                   local.get $8
                   i32.const 1
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $0
                    local.get $10
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $6
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store
                   end
                   local.get $8
                   i32.const 2
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $0
                    local.get $10
                    i32.const 2
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 2
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $6
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store offset=8
                   end
                   local.get $8
                   i32.const 4
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $0
                    local.get $10
                    i32.const 4
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 4
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $6
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store offset=16
                   end
                   local.get $8
                   i32.const 8
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $0
                    local.get $10
                    i32.const 6
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 6
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $6
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store offset=24
                   end
                   br $break|2
                  end
                  local.get $3
                  i32.load offset=16
                  local.set $0
                  local.get $3
                  i32.load offset=24
                  local.set $10
                  local.get $9
                  i32.const 1
                  i32.and
                  local.set $11
                  local.get $3
                  i32.load offset=32
                  local.set $12
                  local.get $3
                  i32.load offset=40
                  local.set $13
                  local.get $9
                  i32.const 2
                  i32.and
                  i32.const 0
                  i32.ne
                  local.set $9
                  local.get $8
                  i32.const 1
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $0
                   local.get $10
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $6
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store
                  end
                  local.get $8
                  i32.const 2
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $0
                   local.get $10
                   i32.const 2
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 2
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $6
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store offset=8
                  end
                  local.get $8
                  i32.const 4
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $0
                   local.get $10
                   i32.const 4
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 4
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $6
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store offset=16
                  end
                  local.get $8
                  i32.const 8
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $0
                   local.get $10
                   i32.const 6
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 6
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $6
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store offset=24
                  end
                  br $break|2
                 end
                 local.get $3
                 i32.load offset=16
                 local.set $0
                 local.get $3
                 i32.load offset=24
                 local.set $10
                 local.get $9
                 i32.const 1
                 i32.and
                 local.set $9
                 local.get $8
                 i32.const 1
                 i32.and
                 if
                  f64.const 2
                  local.get $0
                  local.get $10
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $~lib/math/NativeMath.pow
                  local.set $1
                  local.get $6
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store
                 end
                 local.get $8
                 i32.const 2
                 i32.and
                 if
                  f64.const 2
                  local.get $0
                  local.get $10
                  i32.const 2
                  i32.shr_u
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $~lib/math/NativeMath.pow
                  local.set $1
                  local.get $6
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store offset=8
                 end
                 local.get $8
                 i32.const 4
                 i32.and
                 if
                  f64.const 2
                  local.get $0
                  local.get $10
                  i32.const 4
                  i32.shr_u
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $~lib/math/NativeMath.pow
                  local.set $1
                  local.get $6
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store offset=16
                 end
                 local.get $8
                 i32.const 8
                 i32.and
                 if
                  f64.const 2
                  local.get $0
                  local.get $10
                  i32.const 6
                  i32.shr_u
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $~lib/math/NativeMath.pow
                  local.set $1
                  local.get $6
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store offset=24
                 end
                 br $break|2
                end
                local.get $3
                i32.load offset=16
                local.set $0
                local.get $3
                i32.load offset=24
                local.set $10
                local.get $9
                i32.const 1
                i32.and
                local.set $9
                local.get $8
                i32.const 1
                i32.and
                if
                 local.get $0
                 local.get $10
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $~lib/math/NativeMath.log2
                 local.set $1
                 local.get $6
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store
                end
                local.get $8
                i32.const 2
                i32.and
                if
                 local.get $0
                 local.get $10
                 i32.const 2
                 i32.shr_u
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $~lib/math/NativeMath.log2
                 local.set $1
                 local.get $6
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store offset=8
                end
                local.get $8
                i32.const 4
                i32.and
                if
                 local.get $0
                 local.get $10
                 i32.const 4
                 i32.shr_u
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $~lib/math/NativeMath.log2
                 local.set $1
                 local.get $6
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store offset=16
                end
                local.get $8
                i32.const 8
                i32.and
                if
                 local.get $0
                 local.get $10
                 i32.const 6
                 i32.shr_u
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $~lib/math/NativeMath.log2
                 local.set $1
                 local.get $6
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store offset=24
                end
                br $break|2
               end
               local.get $3
               i32.load offset=16
               local.set $0
               local.get $3
               i32.load offset=24
               local.set $10
               local.get $9
               i32.const 1
               i32.and
               local.set $11
               local.get $3
               i32.load offset=32
               local.set $12
               local.get $3
               i32.load offset=40
               local.set $13
               local.get $9
               i32.const 2
               i32.and
               i32.const 0
               i32.ne
               local.set $14
               local.get $3
               i32.load offset=48
               local.set $15
               local.get $3
               i32.load offset=56
               local.set $16
               local.get $9
               i32.const 4
               i32.and
               i32.const 0
               i32.ne
               local.set $9
               local.get $8
               i32.const 1
               i32.and
               if
                local.get $0
                local.get $10
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $6
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store
               end
               local.get $8
               i32.const 2
               i32.and
               if
                local.get $0
                local.get $10
                i32.const 2
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 2
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 2
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $6
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store offset=8
               end
               local.get $8
               i32.const 4
               i32.and
               if
                local.get $0
                local.get $10
                i32.const 4
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 4
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 4
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $6
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store offset=16
               end
               local.get $8
               i32.const 8
               i32.and
               if
                local.get $0
                local.get $10
                i32.const 6
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 6
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 6
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $6
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store offset=24
               end
               br $break|2
              end
              local.get $3
              i32.load offset=16
              local.set $0
              local.get $3
              i32.load offset=24
              local.set $10
              local.get $9
              i32.const 1
              i32.and
              local.set $9
              local.get $8
              i32.const 1
              i32.and
              if
               local.get $0
               local.get $10
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $6
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store
              end
              local.get $8
              i32.const 2
              i32.and
              if
               local.get $0
               local.get $10
               i32.const 2
               i32.shr_u
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $6
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store offset=8
              end
              local.get $8
              i32.const 4
              i32.and
              if
               local.get $0
               local.get $10
               i32.const 4
               i32.shr_u
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $6
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store offset=16
              end
              local.get $8
              i32.const 8
              i32.and
              if
               local.get $0
               local.get $10
               i32.const 6
               i32.shr_u
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $6
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store offset=24
              end
              br $break|2
             end
             local.get $3
             i32.load offset=16
             local.get $3
             i32.load offset=24
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             i32.const 1
             i32.and
             select
             f64.abs
             local.get $3
             i32.load offset=32
             local.get $3
             i32.load offset=40
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             i32.const 2
             i32.and
             select
             call $~lib/math/NativeMath.pow
             local.set $1
             local.get $8
             i32.const 1
             i32.and
             if
              local.get $6
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store
             end
             local.get $8
             i32.const 2
             i32.and
             if
              local.get $6
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store offset=8
             end
             local.get $8
             i32.const 4
             i32.and
             if
              local.get $6
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store offset=16
             end
             local.get $8
             i32.const 8
             i32.and
             if
              local.get $6
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store offset=24
             end
             br $break|2
            end
            local.get $3
            i32.load offset=16
            local.set $0
            local.get $3
            i32.load offset=24
            local.set $10
            local.get $9
            i32.const 1
            i32.and
            local.set $11
            local.get $3
            i32.load offset=32
            local.set $12
            local.get $3
            i32.load offset=40
            local.set $13
            local.get $9
            i32.const 2
            i32.and
            i32.const 0
            i32.ne
            local.set $9
            local.get $8
            i32.const 1
            i32.and
            if
             local.get $0
             local.get $10
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             local.get $0
             local.get $10
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             f64.sub
             local.set $1
             local.get $6
             local.get $7
             if (result f64)
              f64.const 0
              f64.const 1
              local.get $1
              local.get $1
              f64.const 1
              f64.gt
              select
              local.get $1
              f64.const 0
              f64.lt
              select
             else
              local.get $1
             end
             f64.store
            end
            local.get $8
            i32.const 2
            i32.and
            if
             local.get $0
             local.get $10
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             local.get $0
             local.get $10
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             f64.sub
             local.set $1
             local.get $6
             local.get $7
             if (result f64)
              f64.const 0
              f64.const 1
              local.get $1
              local.get $1
              f64.const 1
              f64.gt
              select
              local.get $1
              f64.const 0
              f64.lt
              select
             else
              local.get $1
             end
             f64.store offset=8
            end
            local.get $8
            i32.const 4
            i32.and
            if
             local.get $0
             local.get $10
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             local.get $0
             local.get $10
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             f64.sub
             local.set $1
             local.get $6
             local.get $7
             if (result f64)
              f64.const 0
              f64.const 1
              local.get $1
              local.get $1
              f64.const 1
              f64.gt
              select
              local.get $1
              f64.const 0
              f64.lt
              select
             else
              local.get $1
             end
             f64.store offset=16
            end
            local.get $8
            i32.const 8
            i32.and
            if
             local.get $6
             f64.const 0
             f64.store offset=24
            end
            br $break|2
           end
           local.get $3
           i32.load offset=16
           local.set $0
           local.get $3
           i32.load offset=24
           local.set $10
           local.get $9
           i32.const 1
           i32.and
           local.set $9
           local.get $8
           i32.const 1
           i32.and
           if
            local.get $0
            local.get $10
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $6
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store
           end
           local.get $8
           i32.const 2
           i32.and
           if
            local.get $0
            local.get $10
            i32.const 2
            i32.shr_u
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $6
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store offset=8
           end
           local.get $8
           i32.const 4
           i32.and
           if
            local.get $0
            local.get $10
            i32.const 4
            i32.shr_u
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $6
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store offset=16
           end
           local.get $8
           i32.const 8
           i32.and
           if
            local.get $0
            local.get $10
            i32.const 6
            i32.shr_u
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $6
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store offset=24
           end
           br $break|2
          end
          local.get $3
          i32.load offset=16
          local.tee $0
          local.get $3
          i32.load offset=24
          local.tee $10
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          i32.const 1
          i32.and
          local.tee $9
          select
          local.tee $1
          local.get $1
          f64.mul
          local.get $0
          local.get $10
          i32.const 2
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $2
          f64.neg
          local.get $2
          local.get $9
          select
          local.tee $2
          local.get $2
          f64.mul
          f64.add
          local.get $0
          local.get $10
          i32.const 4
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $17
          f64.neg
          local.get $17
          local.get $9
          select
          local.tee $17
          local.get $17
          f64.mul
          f64.add
          f64.sqrt
          local.tee $18
          f64.const 1
          local.get $18
          local.get $18
          f64.eq
          local.get $18
          f64.const 0
          f64.ne
          i32.and
          select
          local.set $18
          local.get $8
          i32.const 1
          i32.and
          if
           local.get $1
           local.get $18
           f64.div
           local.set $1
           local.get $6
           local.get $7
           if (result f64)
            f64.const 0
            f64.const 1
            local.get $1
            local.get $1
            f64.const 1
            f64.gt
            select
            local.get $1
            f64.const 0
            f64.lt
            select
           else
            local.get $1
           end
           f64.store
          end
          local.get $8
          i32.const 2
          i32.and
          if
           local.get $2
           local.get $18
           f64.div
           local.set $1
           local.get $6
           local.get $7
           if (result f64)
            f64.const 0
            f64.const 1
            local.get $1
            local.get $1
            f64.const 1
            f64.gt
            select
            local.get $1
            f64.const 0
            f64.lt
            select
           else
            local.get $1
           end
           f64.store offset=8
          end
          local.get $8
          i32.const 4
          i32.and
          if
           local.get $17
           local.get $18
           f64.div
           local.set $1
           local.get $6
           local.get $7
           if (result f64)
            f64.const 0
            f64.const 1
            local.get $1
            local.get $1
            f64.const 1
            f64.gt
            select
            local.get $1
            f64.const 0
            f64.lt
            select
           else
            local.get $1
           end
           f64.store offset=16
          end
          local.get $8
          i32.const 8
          i32.and
          if
           local.get $6
           f64.const 0
           f64.store offset=24
          end
          br $break|2
         end
         local.get $3
         i32.load offset=16
         local.set $0
         local.get $3
         i32.load offset=24
         local.set $10
         local.get $9
         i32.const 1
         i32.and
         local.set $9
         local.get $8
         i32.const 1
         i32.and
         if
          local.get $0
          local.get $10
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          call $~lib/math/NativeMath.cos
          local.set $1
          local.get $6
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store
         end
         local.get $8
         i32.const 2
         i32.and
         if
          local.get $0
          local.get $10
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          call $~lib/math/NativeMath.sin
          local.set $1
          local.get $6
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store offset=8
         end
         local.get $8
         i32.const 4
         i32.and
         if
          local.get $0
          local.get $10
          i32.const 4
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          local.set $1
          local.get $6
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store offset=16
         end
         local.get $8
         i32.const 8
         i32.and
         if
          local.get $0
          local.get $10
          i32.const 6
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          local.set $1
          local.get $6
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store offset=24
         end
         br $break|2
        end
        local.get $3
        i32.load offset=16
        local.tee $0
        local.get $3
        i32.load offset=24
        local.tee $10
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $9
        i32.const 1
        i32.and
        local.tee $9
        select
        local.get $0
        local.get $10
        i32.const 2
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $2
        f64.neg
        local.get $2
        local.get $9
        select
        local.set $2
        local.get $3
        i32.load offset=68
        if
         local.get $8
         i32.const 1
         i32.and
         if
          local.get $6
          f64.const 0
          f64.store
         end
         local.get $8
         i32.const 2
         i32.and
         if
          local.get $6
          f64.const 0
          f64.store offset=8
         end
         local.get $8
         i32.const 4
         i32.and
         if
          local.get $6
          f64.const 0
          f64.store offset=16
         end
         local.get $8
         i32.const 8
         i32.and
         if
          local.get $6
          f64.const 1
          f64.store offset=24
         end
         br $break|2
        end
        global.get $src/wasm/sm2.as/sampOutBuf
        local.set $9
        i32.const 0
        local.set $0
        global.get $src/wasm/sm2.as/texW
        local.tee $10
        f64.convert_i32_s
        local.tee $17
        f64.mul
        f64.const -0.5
        f64.add
        local.tee $18
        f64.floor
        local.set $19
        local.get $2
        global.get $src/wasm/sm2.as/texH
        f64.convert_i32_s
        local.tee $20
        f64.mul
        f64.const -0.5
        f64.add
        local.tee $2
        f64.floor
        local.set $1
        local.get $18
        local.get $19
        f64.sub
        local.set $18
        local.get $2
        local.get $1
        f64.sub
        local.set $21
        local.get $19
        local.get $1
        local.get $17
        local.get $20
        local.get $10
        global.get $src/wasm/sm2.as/bilA
        call $src/wasm/sm2.as/bilCorner
        local.get $19
        f64.const 1
        f64.add
        local.tee $2
        local.get $1
        local.get $17
        local.get $20
        local.get $10
        global.get $src/wasm/sm2.as/bilB
        call $src/wasm/sm2.as/bilCorner
        local.get $19
        local.get $1
        f64.const 1
        f64.add
        local.tee $1
        local.get $17
        local.get $20
        local.get $10
        global.get $src/wasm/sm2.as/bilC
        call $src/wasm/sm2.as/bilCorner
        local.get $2
        local.get $1
        local.get $17
        local.get $20
        local.get $10
        global.get $src/wasm/sm2.as/bilD
        call $src/wasm/sm2.as/bilCorner
        loop $for-loop|00
         local.get $0
         i32.const 4
         i32.lt_s
         if
          local.get $0
          i32.const 3
          i32.shl
          local.tee $10
          global.get $src/wasm/sm2.as/bilA
          i32.add
          f64.load
          local.tee $1
          global.get $src/wasm/sm2.as/bilB
          local.get $10
          i32.add
          f64.load
          local.get $1
          f64.sub
          local.get $18
          f64.mul
          f64.add
          local.set $1
          local.get $9
          local.get $10
          i32.add
          local.get $1
          global.get $src/wasm/sm2.as/bilC
          local.get $10
          i32.add
          f64.load
          local.tee $2
          global.get $src/wasm/sm2.as/bilD
          local.get $10
          i32.add
          f64.load
          local.get $2
          f64.sub
          local.get $18
          f64.mul
          f64.add
          local.get $1
          f64.sub
          local.get $21
          f64.mul
          f64.add
          f64.store
          local.get $0
          i32.const 1
          i32.add
          local.set $0
          br $for-loop|00
         end
        end
        local.get $8
        i32.const 1
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load
         local.set $1
         local.get $6
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store
        end
        local.get $8
        i32.const 2
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load offset=8
         local.set $1
         local.get $6
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store offset=8
        end
        local.get $8
        i32.const 4
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load offset=16
         local.set $1
         local.get $6
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store offset=16
        end
        local.get $8
        i32.const 8
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load offset=24
         local.set $1
         local.get $6
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store offset=24
        end
        br $break|2
       end
       local.get $3
       i32.load offset=16
       local.set $0
       local.get $3
       i32.load offset=24
       local.set $10
       local.get $9
       i32.const 1
       i32.and
       local.set $11
       local.get $3
       i32.load offset=32
       local.set $12
       local.get $3
       i32.load offset=40
       local.set $13
       local.get $9
       i32.const 2
       i32.and
       i32.const 0
       i32.ne
       local.set $14
       local.get $3
       i32.load offset=48
       local.set $15
       local.get $3
       i32.load offset=56
       local.set $16
       local.get $9
       i32.const 4
       i32.and
       i32.const 0
       i32.ne
       local.set $9
       local.get $8
       i32.const 1
       i32.and
       if
        local.get $0
        local.get $10
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $6
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store
       end
       local.get $8
       i32.const 2
       i32.and
       if
        local.get $0
        local.get $10
        i32.const 2
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 2
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 2
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $6
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store offset=8
       end
       local.get $8
       i32.const 4
       i32.and
       if
        local.get $0
        local.get $10
        i32.const 4
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 4
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 4
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $6
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store offset=16
       end
       local.get $8
       i32.const 8
       i32.and
       if
        local.get $0
        local.get $10
        i32.const 6
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 6
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 6
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $6
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store offset=24
       end
       br $break|2
      end
      local.get $3
      i32.load offset=16
      local.tee $0
      local.get $3
      i32.load offset=24
      local.tee $10
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $9
      i32.const 1
      i32.and
      local.tee $11
      select
      local.get $3
      i32.load offset=32
      local.tee $12
      local.get $3
      i32.load offset=40
      local.tee $13
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $9
      i32.const 2
      i32.and
      i32.const 0
      i32.ne
      local.tee $14
      select
      f64.mul
      local.get $0
      local.get $10
      i32.const 2
      i32.shr_u
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $11
      select
      local.get $12
      local.get $13
      i32.const 2
      i32.shr_u
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $14
      select
      f64.mul
      f64.add
      local.get $3
      i32.load offset=48
      local.get $3
      i32.load offset=56
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $9
      i32.const 4
      i32.and
      select
      f64.add
      local.set $1
      local.get $8
      i32.const 1
      i32.and
      if
       local.get $6
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store
      end
      local.get $8
      i32.const 2
      i32.and
      if
       local.get $6
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store offset=8
      end
      local.get $8
      i32.const 4
      i32.and
      if
       local.get $6
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store offset=16
      end
      local.get $8
      i32.const 8
      i32.and
      if
       local.get $6
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store offset=24
      end
     end
    end
    local.get $4
    i32.const 1
    i32.add
    local.set $4
    local.get $3
    i32.const 96
    i32.add
    local.set $3
    br $for-loop|1
   end
  end
  i32.const 1
 )
)
