import json, subprocess, sys
d=sys.argv[1]; clips=json.load(open(f"{d}/clips.json"))
f="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse"
import os
for c in clips:
    c["file"]=os.path.join(d,os.path.basename(c["file"]))
    w=c["file"].replace(".mp3",".wav")
    subprocess.run(["ffmpeg","-y","-v","error","-i",c["file"],"-af",f,"-ar","48000","-ac","1",w],check=True)
    c["wav"]=w; c["dur"]=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",w]))
    print(f'{c["dur"]:.2f} {c["key"]}')
json.dump(clips,open(f"{d}/clips.json","w"),ensure_ascii=False,indent=1)
