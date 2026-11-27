"""Loopback-only mock TTS integration; no provider requests or credentials needed.
Copies the small prototype to an isolated directory so its mock ledger cannot
alter the playable instance's ledger. Human API input is a test driver.
"""
import json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
ROOT=Path(__file__).resolve().parent
from harness_paths import HARNESS_ROOT

def main():
    with tempfile.TemporaryDirectory(prefix='partition-voice-',dir=ROOT) as tmp:
        root=Path(tmp)/'prototypes'/'partition-escape'
        shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('.runs','.voice','.live','.model','__pycache__','partition-voice-*'))
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        base=f'http://127.0.0.1:{port}'
        env={k:v for k,v in os.environ.items() if 'KEY' not in k and not k.startswith('PARTITION_MODEL')}
        env.update(PORT=str(port),PARTITION_ALLOW_MODEL='0',PARTITION_TTS_MODE='mock',PARTITION_PYTHON=sys.executable,PARTITION_HARNESS_ROOT=str(HARNESS_ROOT),PARTITION_STEP_DELAY='0.05')
        p=subprocess.Popen(['node','server3d.mjs'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        def call(route,token=None,data=None,origin=base,host=None):
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            if origin:headers['Origin']=origin
            if host:headers['Host']=host
            q=urllib.request.Request(base+route,headers=headers,data=None if data is None else json.dumps(data).encode())
            try:
                with urllib.request.urlopen(q,timeout=10) as r:
                    raw=r.read();return r.status,(json.loads(raw) if r.headers.get_content_type()=='application/json' else raw),dict(r.headers)
            except urllib.error.HTTPError as e:return e.code,json.loads(e.read()),{}
        try:
            for _ in range(100):
                try:
                    if call('/api/health')[0]==200:break
                except OSError:pass
                time.sleep(.05)
            assert call('/api/health')[1]['localOnly']
            assert not call('/api/capabilities')[1]['modelEnabled']
            assert call('/api/health',host='evil.test')[0]==403
            assert call('/api/health',origin='https://evil.test')[0]==403
            assert call('/voice.mjs')[0]==404
            assert call('/.voice/ledger.json')[0]==404
            assert call('/api/rooms',data={'controllers':{'west':'human','east':'model'}})[0]==403
            _,room,_=call('/api/rooms',data={'controllers':{'west':'human','east':'script'}})
            route='/api/rooms/'+room['id']
            token=lambda role:parse_qs(urlsplit(room['links'][role]).fragment)['key'][0]
            west,watch=token('west'),token('watch')
            for _ in range(200):
                _,view,_=call(route,west)
                events=[e for e in view['events'] if e['source']=='script' and e['type'] in ('message','clue')]
                if events:break
                time.sleep(.05)
            assert events,'script failed to publish a shared event'
            event=events[0];data={'eventId':event['id']}
            assert call(route+'/voice',None,data)[0]==403
            assert call(route+'/voice',watch,data)[0]==403
            assert call(route+'/voice',west,data,origin=None)[0]==403
            assert call(route+'/voice',west,{'eventId':event['id'],'text':'PRIVATE_SENTINEL'})[0]==400
            assert call(route+'/voice',west,{'eventId':9999})[0]==409
            a,audio,h=call(route+'/voice',west,data);assert a==200 and audio[:4]==b'RIFF' and h['X-Voice-Source']=='mock'
            b,again,h2=call(route+'/voice',west,data);assert b==200 and again==audio and h2['X-Voice-Cache']=='hit'
            state=call(route+'/voice-status',west)[1];assert state['used']=={'requests':1,'characters':len(event['text']),'microUsd':0}
            call(route+'/command',west,{'type':'pause'})
            assert call(route+'/voice',west,data)[0]==409
            call(route+'/command',west,{'type':'pause'})
            assert call(route+'/voice-disable',west,{})[1]['enabled'] is False
            assert call(route+'/voice',west,data)[0]==409
            public=json.dumps({'status':state,'headers':h},ensure_ascii=False)
            assert all(s not in public for s in ('PRIVATE_SENTINEL','ELEVENLABS_API_KEY','holdingBrake','fanSpinning'))
            print(json.dumps({'passed':True,'external_requests':0,'source':'mock-tone; script harness; human test driver','host_origin':'preserved','private_assets':'404','watch_and_missing_token':'403','arbitrary_text':'400','paused_and_disabled':'409','cache':'one reservation for two plays','used':state['used'],'eventId':event['id']},ensure_ascii=False,indent=2))
        finally:
            p.terminate();p.wait(timeout=10)

if __name__=='__main__':main()
