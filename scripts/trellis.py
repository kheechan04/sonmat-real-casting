# Photo -> 3D fish model with Microsoft TRELLIS.2 (MIT) on its official free Hugging Face Space.
#   python scripts/trellis.py assets-src/models/ai-src/<id>.jpg assets-src/models/raw/<id>.glb
# Uses the Space's free GPU quota (about 2 min/day without a Hugging Face login, 5 min/day with a free
# account: set HF_TOKEN). One fish takes about a minute. Then: node scripts/build-fish.mjs <id>
import os, shutil, sys, time
from gradio_client import Client, handle_file

src, out = sys.argv[1], sys.argv[2]
c = Client('microsoft/TRELLIS.2', verbose=False, hf_token=os.environ.get('HF_TOKEN'))
t = time.time()
c.predict(api_name='/start_session')
pre = c.predict(handle_file(src), api_name='/preprocess_image')  # background removal
pre = pre['path'] if isinstance(pre, dict) else pre
c.predict(handle_file(pre), 0, '1024', api_name='/image_to_3d')
glb, dl = c.predict(100000, 1024, api_name='/extract_glb')  # 100k is the Space's minimum; build-fish.mjs reduces it
shutil.copy(dl if isinstance(dl, str) else glb, out)
print('ok', out, round(time.time() - t), 's')
