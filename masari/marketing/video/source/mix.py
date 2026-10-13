# usage: mix.py builddir gaps.json  -> timeline.json, audio.wav
import json, sys, wave, numpy as np, subprocess
d=sys.argv[1]; gaps=json.load(open(sys.argv[2])); SR=48000
clips=json.load(open(f"{d}/clips.json"))
def readwav(p):
    with wave.open(p) as w: return np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
t=gaps.get("_start",0.3); tl=[]
for c in clips:
    t+=gaps.get(c["key"],0.2); tl.append({"key":c["key"],"text":c["text"],"start":round(t,3),"end":round(t+c["dur"],3)}); t+=c["dur"]
total=t+gaps.get("_tail",1.2); N=int(total*SR)
voice=np.zeros(N,np.float32)
for c,e in zip(clips,tl):
    a=readwav(c["wav"]); s=int(e["start"]*SR); voice[s:s+len(a)]+=a[:N-s]
voice*=0.9/max(1e-6,np.abs(voice).max())
# chime before every clip whose key starts with "d" (the word إشعار)
ch=np.zeros(N,np.float32); tt=np.arange(int(0.7*SR))/SR
chime=0.5*np.sin(2*np.pi*1568*tt)*np.exp(-8*tt)+0.35*np.sin(2*np.pi*2093*np.clip(tt-0.09,0,None))*np.exp(-9*np.clip(tt-0.09,0,None))*(tt>0.09)
dings=[]
for e in tl:
    if e["key"].startswith("d") or e["key"] in gaps.get("_chime",[]):
        s=int((e["start"]-0.18)*SR); ch[s:s+len(chime)]+=chime[:N-s]; dings.append(round(e["start"]-0.18,3))
# soft pad: chords that change every bar
prog=[[57,60,64,69],[53,57,60,65],[48,55,60,64],[55,59,62,67]]  # Am F C G
bar=gaps.get("_bar",4.0); pad=np.zeros(N,np.float32); x=np.arange(N)/SR
for i in range(int(total/bar)+1):
    s=int(i*bar*SR); e=min(N,int((i+1)*bar*SR)+int(0.8*SR))
    if s>=N: break
    seg=x[s:e]-i*bar; env=np.minimum(1,seg/0.8)*np.minimum(1,np.clip((bar+0.8-seg)/0.8,0,1))
    for m in prog[i%4]:
        f=440*2**((m-69)/12)
        pad[s:e]+=env*(np.sin(2*np.pi*f*seg)+0.3*np.sin(2*np.pi*2*f*seg)+0.12*np.sin(2*np.pi*3*f*seg))
    # gentle plucked root an octave up on each beat
    for b in range(4):
        bs=s+int(b*bar/4*SR); f=440*2**((prog[i%4][(b*2)%4]+12-69)/12); n=min(int(0.9*SR),N-bs)
        if n>0: tb=np.arange(n)/SR; pad[bs:bs+n]+=0.9*np.sin(2*np.pi*f*tb)*np.exp(-5*tb)
pad/=np.abs(pad).max()
fade=np.minimum(1,x/1.0)*np.minimum(1,(total-x)/1.5)
# duck music under voice
env=np.convolve(np.abs(voice)>0.02,np.ones(int(0.25*SR))/int(0.25*SR),"same")
music=pad*fade*(0.16-0.09*np.clip(env*3,0,1))
mix=voice+0.55*ch+music; mix/=max(1,np.abs(mix).max()/0.97)
with wave.open(f"{d}/audio.wav","w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype(np.int16).tobytes())
json.dump({"total":round(total,3),"clips":tl,"dings":dings},open(f"{d}/timeline.json","w"),ensure_ascii=False,indent=1)
print("total",round(total,2)); [print(e["start"],e["end"],e["key"]) for e in tl]
