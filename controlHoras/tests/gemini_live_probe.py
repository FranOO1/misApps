"""One real Firebase AI request with synthetic data; no session/App Check bypass or billing changes.
An HTTP rejection is a blocked attempt, NEVER a verified model response.
"""
import json,re,urllib.request,urllib.error
from pathlib import Path
html=(Path(__file__).resolve().parents[1]/'index.html').read_text();key=re.search(r'apiKey: "([^"]+)"',html).group(1)
endpoint=Path(__file__).resolve().parents[1]/'captures/gemini-endpoint.json'
base=json.loads(endpoint.read_text())['url'] if endpoint.exists() else 'https://firebasevertexai.googleapis.com/v1beta/projects/mishoras-bb0cc/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent'
url=base+'?key='+key
body={'contents':[{'role':'user','parts':[{'text':'Prueba ficticia, sin datos personales: el cálculo local indica 8,25 horas registradas. Explica ese dato en una frase en español, sin calcular importes.'}]}],'generationConfig':{'maxOutputTokens':200,'thinkingConfig':{'thinkingLevel':'MINIMAL'}}}
req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
try:
 with urllib.request.urlopen(req,timeout=35) as res:
  data=json.loads(res.read());text=' '.join(p.get('text','') for c in data.get('candidates',[]) for p in c.get('content',{}).get('parts',[]));print('REAL_ENDPOINT_RESULT '+json.dumps({'status':res.status,'modelResponse':bool(text),'text':text[:500],'limit':'No se ha validado sesión/Auth ni App Check del cliente; no equivale a integración completa.'},ensure_ascii=False))
except urllib.error.HTTPError as e:
 try:detail=json.loads(e.read()).get('error',{})
 except:detail={}
 print('REAL_ENDPOINT_BLOCKED '+json.dumps({'http':e.code,'status':detail.get('status'),'message':str(detail.get('message',''))[:800],'modelResponse':False,'cause':'Este entorno no tiene sesión Firebase ni atestación App Check del dominio autorizado.'},ensure_ascii=False))
except Exception as e:print('REAL_ENDPOINT_BLOCKED '+json.dumps({'modelResponse':False,'error':type(e).__name__+': '+str(e)[:200]},ensure_ascii=False))
