"""Offline actor-summary projection fixture; no model provider, no execution, no claimed game outcome."""
import argparse,json
from pathlib import Path
from types import SimpleNamespace
from harness.providers import Completion
from seat_worker import SeatActor
from public_trace import public_studio

def fixture():
    observation={'signals':{'hold-brake':12,'power-on':10,'power-off':14},'pending':None,'private':'PRIVATE_FIXTURE_SENTINEL'}
    actor=SeatActor();context=SimpleNamespace(observation=SimpleNamespace(state_text=json.dumps(observation)))
    request=actor.request(context,None)
    menu=json.loads(request[1].text)['_public_summary_choices']
    summary=next(x['choices'][0] for x in menu if x['label']=='取出并安装木撑')
    steps=[]
    for i,text in enumerate((summary,summary+' PRIVATE_FIXTURE_SENTINEL',''),1):
        # This is provided fixture output processed through the SAME actor/projection path, not a model call.
        response=Completion(json.dumps({'commentary':text,'actions':[{'type':'type','text':json.dumps({'type':'action','id':'brace'})}]},ensure_ascii=False),0,0,0,0,{'source':'offline-fixture'})
        decoded=json.loads(actor.proposal(response))
        steps.append({'observation':{'observation_id':f'fixture-obs-{i}','seq':i,'ts':i,'trigger':'fixture','state_text':context.observation.state_text},
            'chunk':{'chunk_id':f'fixture-chunk-{i}',**decoded},'calls':[{'request_id':f'fixture-request-{i}','role':'actor','seq':i,'ts':i,'cost_usd':0}], 'results':[]})
    return {'header':{'run_id':'offline-summary-fixture-not-model'},'steps':steps,'events':[]}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);args=p.parse_args()
    html=public_studio(fixture(),'离线 fixture · 非真实模型');assert 'PRIVATE_FIXTURE_SENTINEL' not in html
    args.out.parent.mkdir(parents=True,exist_ok=True);args.out.write_text(html);print(args.out)
