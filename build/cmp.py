import json
a=json.load(open("py.json")); b=json.load(open("js.json"))
n=0
def cmp(x,y,path):
    global n
    if isinstance(x,dict) and isinstance(y,dict):
        for k in set(x)|set(y): cmp(x.get(k),y.get(k),path+"."+k)
    elif isinstance(x,list) and isinstance(y,list) and len(x)==len(y):
        for i,(u,v) in enumerate(zip(x,y)): cmp(u,v,f"{path}[{i}]")
    elif x!=y:
        n+=1
        if n<=12: print(path,"\n  py:",json.dumps(x,ensure_ascii=False)[:300],"\n  js:",json.dumps(y,ensure_ascii=False)[:300])
cmp(a,b,"")
print("diffs:",n, "sizes", len(a["course"]), len(a["edit"][0]), len(a["talk"]))
