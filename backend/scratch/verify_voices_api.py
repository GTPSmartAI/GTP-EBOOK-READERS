import urllib.request
import json

req = urllib.request.Request('http://127.0.0.1:4000/api/voices')
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode('utf-8'))
    print('Total de vozes no backend:', len(res['voices']))
    for v in res['voices']:
        print(v['id'], '-->', v['name'], f"[{v.get('category')}]")

dialogue = '"Nesse sentido, você é que é verdadeiramente estranho." Snowfield murmurou algo com um olhar de pena. "Você, que preza as pessoas mais do que ninguém, descarta descuidadamente o próprio eu que elas amam."'
payload = json.dumps({'text': dialogue, 'voice_id': 'brian-cinema', 'cadence': 'dramatica'}).encode('utf-8')
req2 = urllib.request.Request('http://127.0.0.1:4000/api/tts/synthesize', data=payload, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req2) as resp2:
    res2 = json.loads(resp2.read().decode('utf-8'))
    print('Sintese Brian com Dialogo:', res2)

payload_th = json.dumps({'text': dialogue, 'voice_id': 'thalita-storyteller', 'cadence': 'natural'}).encode('utf-8')
req3 = urllib.request.Request('http://127.0.0.1:4000/api/tts/synthesize', data=payload_th, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req3) as resp3:
    res3 = json.loads(resp3.read().decode('utf-8'))
    print('Sintese Thalita com Dialogo:', res3)
