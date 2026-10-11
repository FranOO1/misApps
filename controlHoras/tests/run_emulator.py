"""Temporary local emulator rules. Never read or deploy production rules."""
import json,os,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='horas-emulator-') as path:
 d=Path(path);(d/'firestore.rules').write_text("rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /users/{uid} { allow read, write: if request.auth != null && request.auth.uid == uid; } } }")
 (d/'firebase.json').write_text(json.dumps({'firestore':{'rules':'firestore.rules'},'emulators':{'firestore':{'host':'127.0.0.1','port':8080},'ui':{'enabled':False},'singleProjectMode':False}}))
 command='python '+str(ROOT/'controlHoras/tests/browser_sync.py')
 subprocess.run(['/tmp/horas-emulator/node_modules/.bin/firebase','emulators:exec','--project','demo-mis-horas','--only','firestore','--config',str(d/'firebase.json'),command],cwd=d,env={**os.environ,'FIRESTORE_EMULATOR_HOST':'127.0.0.1:8080'},check=True)
