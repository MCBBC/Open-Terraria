# IIIII49 遗产工具（仓内版，替代 /tmp 副本）：pass59 掷流解码/锚点扫描。
# 用法: python3 tools/_i49decode.py [rollwin路径]
# 桶语义：'---PASS n <name>' 标记滞后一拍；其后的桶=pass (n+1) 的消费。
import sys, json
W,H=4200,1200
F=4.656612875245797e-10

def load_bucket(path, mark='---PASS 58 Statues'):
    rig=[]; started=False
    for l in open(path):
        l=l.rstrip('\n')
        if l.startswith('---'):
            if started: break
            if l==mark: started=True
            continue
        if started: rig.append(int(l))
    return rig

def dec_value(v, mn, mx):
    """UnifiedRandom.Next(mn,mx)：mn+trunc(Sample()*range)，Sample=v*F（可负）"""
    return mn + int(v * F * (mx - mn))

def main():
    path=sys.argv[1] if len(sys.argv)>1 else '/tmp/iii50-out/rig1/rollwin.txt'
    rig=load_bucket(path)
    print('bucket samples:',len(rig))
    heads=(dec_value(rig[0],35,41), dec_value(rig[1],10,16), dec_value(rig[2],35,41), dec_value(rig[3],2,3))
    print('head counts: CaveHouse=%d Underworld=%d CaveChest=%d Desert=%d'%heads)
    cl=json.load(open('/tmp/iii50-out/add59clusters.json'))['g']
    boxes=[(c['a'][0]-6,c['a'][1]-6,c['b'][0]+6,c['b'][1]+6) for c in cl if c['n']>=25]
    lo,hi=332,969   # wsH=312(=groundLevel 337−25)+20 .. maxTilesY−230
    hits={}
    for i in range(len(rig)-1):
        dx=dec_value(rig[i],80,4120)
        dy=dec_value(rig[i+1],lo,hi)
        for bi,(ax,ay,bx,by) in enumerate(boxes):
            if ax<=dx<=bx and ay<=dy<=by:
                hits.setdefault(bi,[]).append(i)
    for bi,lst in sorted(hits.items())[:20]:
        print('box%d (%d,%d) tapidx_first=%d cnt=%d'%(bi,boxes[bi][0],boxes[bi][1],lst[0],len(lst)))

if __name__=='__main__':
    main()
