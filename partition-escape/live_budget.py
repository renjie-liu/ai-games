"""Local Live connection allowances and per-session usage. No credentials or recordings."""
import fcntl
import json
import math
import os
from pathlib import Path
import re
import time

HERE=Path(__file__).resolve().parent
ROOT=HERE
MODEL='gemini-3.8-live'
LIMITS_FILE='live-limits.json'

def merge_limits(defaults,changes):
    """The same rules as live-limits.mjs: known names only, positive numbers, whole unless money."""
    if not isinstance(changes,dict) or set(changes)-set(defaults):raise RuntimeError('live_limits_invalid')
    merged={}
    for section,base in defaults.items():
        given=changes.get(section,{})
        if not isinstance(given,dict) or set(given)-set(base):raise RuntimeError('live_limits_invalid')
        merged[section]={**base,**given}
        for name,value in merged[section].items():
            if type(value) not in (int,float) or not math.isfinite(value) or value<=0:raise RuntimeError('live_limits_invalid')
            if not name.endswith('_usd'):
                if value!=int(value):raise RuntimeError('live_limits_invalid')
                merged[section][name]=int(value)
    return merged

def load_limits(override=None,root=HERE):
    """Per-session and context-update caps. Defaults are in live-limits.json; the JSON file named by
    PARTITION_LIVE_LIMITS may override any of them. Node reads the same file (live-limits.mjs)."""
    path=os.environ.get('PARTITION_LIVE_LIMITS') if override is None else override
    try:
        defaults=json.loads((Path(root)/LIMITS_FILE).read_text())
        changes=json.loads(Path(path).read_text()) if path else {}
    except (OSError,ValueError):raise RuntimeError('live_limits_invalid') from None
    return merge_limits(defaults,changes)

_loaded=load_limits()
SESSION=_loaded['session']   # what one connection may use
UPDATES=_loaded['updates']   # how much public game state may be pushed into a session's context
SERVER=_loaded['server']     # what the server as a whole allows: how many sessions run side by side
# A grant decides how many connections there are. The fixture grant below is the only one this
# file can mint; a real grant is a count written by the project owner (LIVE.md).
FIXTURE_GRANT=dict(connections=2,total_usd=.50)
GRANT_FIELDS=tuple(FIXTURE_GRANT)
LIMITS={**FIXTURE_GRANT,**SESSION}
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
    """The ledger must belong to the grant and carry the grant's own numbers. What one session may
    use is not part of a grant: it comes from live-limits.json and is written on each attempt, so a
    ledger opened under earlier session caps stays valid and keeps its count."""
    limits = grant_limits(marker)
    stored = data.get('limits')
    if data.get('authorization') != marker['authorization'] or not isinstance(stored,dict) or not isinstance(data.get('attempts'),list) \
            or any(stored.get(k) != limits[k] for k in GRANT_FIELDS):
        raise RuntimeError('live_ledger_mismatch')
    return limits

def quota_status(directory):
    marker = json.loads((directory/'authorization.json').read_text())
    data = json.loads((directory/'ledger.json').read_text())
    limits = validate_ledger(marker, data)
    count = limits['connections']
    return {'connectionLimit': count, 'remaining': max(0, count-len(data['attempts'])),
            'projectVerified': marker.get('projectVerified', True), 'totalUsd': limits['total_usd'],
            'invites': invite_counts(data['attempts'])}

def invite_from_env(environment=None):
    """The invitation the server started this session under (hosting.mjs), or None on this machine."""
    environment = os.environ if environment is None else environment
    name = environment.get('PARTITION_INVITE_NAME')
    if not name:
        return None
    try:
        return {'name': name, 'connections': int(environment.get('PARTITION_INVITE_CONNECTIONS', ''))}
    except ValueError:
        raise RuntimeError('live_invite_invalid') from None

def invite_counts(attempts):
    """How many connections each invitation has started. An attempt made without one has no name."""
    counts = {}
    for row in attempts:
        if isinstance(row, dict) and isinstance(row.get('invite'), str):
            counts[row['invite']] = counts.get(row['invite'], 0) + 1
    return counts


class Ledger:
    """One session's hold on the ledger. Several sessions may run side by side, each a process of
    its own with a Ledger of its own on the one file:
     - a session holds one of SERVER['concurrent_sessions'] places for as long as it lives. The
       place is a lock on a file, so a session that dies gives its place back with it;
     - every write takes a second, short lock, reads the file as the other sessions left it,
       changes this session's own row and nothing else, and writes it back.
    `invite` is the invitation the session was started under on a hosted server: a name and the
    number of connections that invitation may start. Its count is kept in the same rows."""
    def __init__(self,directory=None,fixture=False,invite=None):
        if directory is not None and not fixture:raise RuntimeError('alternate_ledger_refused')
        if invite is not None and not (isinstance(invite,dict) and set(invite)=={'name','connections'} and isinstance(invite['name'],str) and invite['name']
                and type(invite['connections']) is int and invite['connections']>0):raise RuntimeError('live_invite_invalid')
        self.invite=invite
        self.directory=Path(directory) if fixture else ROOT/'.live'
        if not fixture and not all((self.directory/n).is_file() for n in ('authorization.json','ledger.json')):
            raise RuntimeError('live_authorization_required')
        self.directory.mkdir(mode=0o700,parents=True,exist_ok=True)
        self.lock=self.place()
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
            self.write()
            fd=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as f:json.dump({'authorization':AUTH},f)
    def place(self):
        """One of the server's places for a running session, held until this process ends."""
        for n in range(SERVER['concurrent_sessions']):
            lock=open(self.directory/('lock' if n==0 else f'lock.{n}'),'a')
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);return lock
            except BlockingIOError:lock.close()
        raise RuntimeError('live_session_already_running')
    def write(self):
        temp=self.path.with_suffix(f'.{os.getpid()}.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as f:json.dump(self.data,f);f.flush();os.fsync(f.fileno())
        temp.replace(self.path)
    def change(self,edit):
        """Reads the ledger as it is now, lets `edit` change it, and writes it, all under the short
        lock. If `edit` raises, nothing is written."""
        with open(self.directory/'ledger.lock','a') as guard:
            fcntl.flock(guard,fcntl.LOCK_EX)
            self.data=json.loads(self.path.read_text())
            self.limits=validate_ledger(self.grant,self.data)
            result=edit(self.data['attempts'])
            self.write()
            return result
    def save(self):
        """Puts this session's own row into the ledger as the other sessions left it."""
        def own(attempts):
            if not self.row:return
            at=next((i for i,row in enumerate(attempts) if isinstance(row,dict) and row.get('attempt')==self.row['attempt']),None)
            if at is None:raise RuntimeError('live_ledger_mismatch')
            attempts[at]=self.row
        self.change(own)
    def reserve(self):
        def take(attempts):
            # Counted on the file as it is at this moment: another session may have taken the last one.
            if len(attempts)>=self.limits['connections']:raise RuntimeError('live_authorization_exhausted')
            if not self.grant.get('projectVerified',True):raise RuntimeError('live_project_unverified')
            if self.invite and invite_counts(attempts).get(self.invite['name'],0)>=self.invite['connections']:
                raise RuntimeError('live_invite_exhausted')
            self.row={'attempt':len(attempts)+1,'reserved_usd':LIMITS['usage_stop_usd'],'limits':{k:LIMITS[k] for k in SESSION},
              'started_at':time.time(),'status':'reserved','source':'offline-fixture' if self.fixture else 'gemini-live',
              'connections':1,'retries':0,'input_seconds':0,'output_seconds':0,'text_bytes':0,'turns':0,'tools':0,'usage':[],
              'estimated_usd':0,'billing':'estimate only; credits and provider invoice unverified',
              **({'invite':self.invite['name']} if self.invite else {})}
            attempts.append(self.row);return self.row
        return self.change(take)
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
        if self.row['estimated_usd']>=LIMITS['usage_stop_usd']:raise RuntimeError('live_usage_stop')
    def finish(self,status):
        if self.row:self.row['status']=status;self.row['ended_at']=time.time();self.save()
    def close(self):self.lock.close()

if __name__ == '__main__':
    try:
        print(json.dumps(quota_status(ROOT/'.live')))
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError):
        raise SystemExit(1)
