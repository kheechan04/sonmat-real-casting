# Photo -> 3D fish model with Microsoft TRELLIS.2 (MIT) on its official free Hugging Face Space.
#   python scripts/trellis.py assets-src/models/ai-src/<id>.jpg assets-src/models/raw/<id>.glb
# Uses the Space's free GPU quota: about 2 min/day without a Hugging Face login, 5 min/day with a free
# account — put a Read token in %USERPROFILE%\.hf-token (outside the project; never printed) or set
# HF_TOKEN. The quota refills 24 h after first use. One fish takes about a minute.
# Then: node scripts/build-fish.mjs <id>, and add the species to MODELS in src/app/fishAssets.ts.
import os, shutil, sys, time
from pathlib import Path
from gradio_client import Client, handle_file

def token():
    if os.environ.get('HF_TOKEN'):
        return os.environ['HF_TOKEN']
    f = Path.home() / '.hf-token'
    return f.read_text(encoding='utf-8-sig').strip() if f.exists() else None

src, out = sys.argv[1], sys.argv[2]
c = Client('microsoft/TRELLIS.2', verbose=False, hf_token=token())
t = time.time()
c.predict(api_name='/start_session')
pre = c.predict(handle_file(src), api_name='/preprocess_image')  # background removal
pre = pre['path'] if isinstance(pre, dict) else pre
c.predict(handle_file(pre), 0, '1024', api_name='/image_to_3d')
glb, dl = c.predict(100000, 1024, api_name='/extract_glb')  # 100k is the Space's minimum; build-fish.mjs reduces it
shutil.copy(dl if isinstance(dl, str) else glb, out)
print('ok', out, round(time.time() - t), 's')
