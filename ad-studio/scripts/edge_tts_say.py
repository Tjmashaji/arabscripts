# تحويل نص إلى صوت عبر edge-tts (أصوات Microsoft العصبية المجانية).
# يقرأ JSON من stdin: {"text", "voice", "rate", "pitch"} ويكتب MP3 إلى stdout.
import asyncio
import json
import os
import ssl
import sys

import edge_tts
import edge_tts.communicate as comm

# شهادة جذر إضافية عند العمل خلف بروكسي يعترض TLS (اختياري)
if os.environ.get("EDGE_TTS_CA_FILE") and hasattr(comm, "_SSL_CTX"):
    comm._SSL_CTX = ssl.create_default_context(cafile=os.environ["EDGE_TTS_CA_FILE"])


async def main():
    req = json.load(sys.stdin)
    tts = edge_tts.Communicate(req["text"], req["voice"], rate=req.get("rate", "+0%"), pitch=req.get("pitch", "+0Hz"), proxy=os.environ.get("HTTPS_PROXY") or None)
    out = sys.stdout.buffer
    wrote = False
    async for chunk in tts.stream():
        if chunk["type"] == "audio":
            out.write(chunk["data"])
            wrote = True
    if not wrote:
        sys.exit(3)
    out.flush()


asyncio.run(main())
