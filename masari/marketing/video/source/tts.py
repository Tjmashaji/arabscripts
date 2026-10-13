import asyncio, json, sys, subprocess, edge_tts
# usage: tts.py lines.json outdir voice rate
lines=json.load(open(sys.argv[1])); out=sys.argv[2]; voice=sys.argv[3]; rate=sys.argv[4]
async def main():
    res=[]
    for i,(key,text) in enumerate(lines):
        p=f"{out}/{i:02d}_{key}.mp3"
        await edge_tts.Communicate(text, voice, rate=rate).save(p)
        d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p]))
        res.append({"key":key,"text":text,"file":p,"dur":d})
    json.dump(res,open(f"{out}/clips.json","w"),ensure_ascii=False,indent=1)
    for r in res: print(f'{r["dur"]:.2f}  {r["key"]}  {r["text"]}')
asyncio.run(main())
