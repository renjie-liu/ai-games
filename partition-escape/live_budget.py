"""Local Live connection allowances and per-session usage. No credentials or recordings."""
import fcntl
import json
import math
import os
from pathlib import Path
import re
import time

ROOT=Path(__file__).resolve().parent
MODEL='gemini-3.8-live'
LIMITS=dict(connections=2,seconds=60,input_seconds=30,output_seconds=20,turns=6,tools=6,
            text_bytes=8000,max_output_tokens=256,total_usd=.50,reserve_usd=.25)
AUTH='partition-live-20261114-v1'

def key():
    value=os.environ.get('GEMINI_API_KEY','')
    if re.fullmatch(r'[A-Za-z0-9_-]{20,256}',value):return value
    try:text=(Path.home()/'.bashrc').read_text()
    except OSError:raise RuntimeError('gemini_key_unavailable') from None
    matches=re.findall(r'^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*[\"\x27]?([A-Za-z0-9_-]{20,256})[\"\x27]?\s*(?:#.*)?$',text,re.M)
    if not matches:raise RuntimeError('gemini_key_unavailable')
    return matches[-1]


def grant_limits(marker):
    if marker.get('authorization') == AUTH:
        return LIMITS
    if marker.get('schema') != 2 or not isinstance(marker.get('authorization'), str) or not marker['authorization']:
        raise RuntimeError('live_ledger_mismatch')
    count = marker.get('connectionLimit')
    if type(count) is not int or not 0 < count <= 2**53-1 or type(marker.get('projectVerified')) is not bool:
        raise RuntimeError('live_ledger_mismatch')
    # A count grant does not allocate additional dollars.
    return {**LIMITS, 'connections': count, 'total_usd': None}

def validate_ledger(marker, data):
    limits = grant_limits(marker)
    if data.get('authorization') != marker['authorization'] or data.get('limits') != limits or not isinstance(data.get('attempts'),list):
        raise RuntimeError('live_ledger_mismatch')
    return limits

def quota_status(directory):
    marker = json.loads((directory/'authorization.json').read_text())
    data = json.loads((directory/'ledger.json').read_text())
    limits = validate_ledger(marker, data)
    count = limits['connections']
    return {'connectionLimit': count, 'remaining': max(0, count-len(data['attempts'])),
            'projectVerified': marker.get('projectVerified', True), 'totalUsd': limits['total_usd']}


class Ledger:
    def __init__(self,directory=None,fixture=False):
        if directory is not None and not fixture:raise RuntimeError('alternate_ledger_refused')
        self.directory=Path(directory) if fixture else ROOT/'.live'
        if not fixture and not all((self.directory/n).is_file() for n in ('authorization.json','ledger.json')):
            raise RuntimeError('live_authorization_required')
        self.directory.mkdir(mode=0o700,parents=True,exist_ok=True)
        self.lock=open(self.directory/'lock','a')
        try:fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:self.lock.close();raise RuntimeError('live_session_already_running') from None
        self.path=self.directory/'ledger.json';self.fixture=fixture
        marker=self.directory/'authorization.json'
        if marker.exists() and not self.path.exists():
            self.lock.close();raise RuntimeError('live_ledger_missing_no_reset')
        first=not marker.exists()
        try:
            if not fixture and first:
                raise RuntimeError('live_authorization_required')
            self.grant=json.loads(marker.read_text()) if not first else {'authorization':AUTH}
            if self.path.exists():
                self.data=json.loads(self.path.read_text())
            elif fixture and first:
                self.data={'authorization':AUTH,'limits':LIMITS,'attempts':[]}
            else:
                raise RuntimeError('live_ledger_missing_no_reset')
            self.limits=validate_ledger(self.grant,self.data)
        except Exception:
            self.lock.close()
            raise
        self.row=None;self.held=0 # In-memory text held for receipts of tools already dispatched; never persisted.
        if first:
            self.save()
            fd=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as f:json.dump({'authorization':AUTH},f)
    def save(self):
        temp=self.path.with_suffix('.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as f:json.dump(self.data,f);f.flush();os.fsync(f.fileno())
        temp.replace(self.path)
    def reserve(self):
        if len(self.data['attempts'])>=self.limits['connections']:raise RuntimeError('live_authorization_exhausted')
        if not self.grant.get('projectVerified',True):raise RuntimeError('live_project_unverified')
        self.row={'attempt':len(self.data['attempts'])+1,'reserved_usd':LIMITS['reserve_usd'],
          'started_at':time.time(),'status':'reserved','source':'offline-fixture' if self.fixture else 'gemini-live',
          'connections':1,'retries':0,'input_seconds':0,'output_seconds':0,'text_bytes':0,'turns':0,'tools':0,'usage':[],
          'estimated_usd':0,'billing':'estimate only; credits and provider invoice unverified'}
        self.data['attempts'].append(self.row);self.save();return self.row
    def available(self,field):
        return LIMITS[field]-self.row[field]-(self.held if field=='text_bytes' else 0)
    def debit(self,field,amount):
        if field not in ('input_seconds','output_seconds','text_bytes','turns','tools') or not isinstance(amount,(int,float)) or not math.isfinite(amount) or amount<0:raise RuntimeError('invalid_usage')
        if amount>self.available(field):raise RuntimeError('live_'+field+'_limit')
        self.row[field]+=amount;self.save()
    def hold_text(self,amount):
        # Reserve receipt bytes before a tool may touch the room; other sends cannot consume them.
        if type(amount) is not int or amount<0:raise RuntimeError('invalid_usage')
        if amount>self.available('text_bytes'):raise RuntimeError('live_text_bytes_limit')
        self.held+=amount
    def release_text(self,amount):
        if type(amount) is not int or not 0<=amount<=self.held:raise RuntimeError('invalid_usage')
        self.held-=amount
    def usage(self,metadata):
        # Preserve provider-reported counts. Conservatively SUM messages; if a provider
        # reports cumulative snapshots this overestimates instead of undercounting.
        prompt=metadata.get('prompt_token_count') or 0;output=metadata.get('response_token_count') or 0
        thoughts=metadata.get('thoughts_token_count') or 0
        estimate=(prompt*3+(output+thoughts)*12)/1_000_000
        self.row['usage'].append(metadata);self.row['estimated_usd']+=estimate;self.save()
        if self.row['estimated_usd']>=.15:raise RuntimeError('live_usage_stop')
    def finish(self,status):
        if self.row:self.row['status']=status;self.row['ended_at']=time.time();self.save()
    def close(self):self.lock.close()

if __name__ == '__main__':
    try:
        print(json.dumps(quota_status(ROOT/'.live')))
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError):
        raise SystemExit(1)
