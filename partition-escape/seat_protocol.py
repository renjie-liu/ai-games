"""Strict, one-command seat format adapter. No authority or game-state decisions.

Only JSON shape changes here. Original provider text remains in the private harness
record; a separate allowlisted audit records normalization, never a fabricated reason.
"""
import json
import re
from harness.actions.parse import ChunkParseError

VERSION = 'partition-seat-normalization-v1'
COMMANDS = {'inspect', 'share', 'action', 'say', 'accept', 'decline', 'cancel'}
SOURCES = {'model', 'script', 'offline-replay', 'offline-fixture'}


def decode(text):
    def unique(pairs):
        d = {}
        for k, v in pairs:
            if k in d: raise ValueError('duplicate key')
            d[k] = v
        return d
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))


def command(c):
    if not isinstance(c, dict) or not isinstance(c.get('type'), str) or c['type'] not in COMMANDS:
        raise ValueError('unknown command')
    arg = 'text' if c['type'] == 'say' else 'id'
    if set(c) != {'type', arg} or not isinstance(c[arg], str): raise ValueError('command shape')
    if arg == 'text':
        if not c[arg].strip() or len(c[arg]) > 500: raise ValueError('message length')
    elif not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', c[arg]): raise ValueError('identifier shape')
    # The server, not this syntactic adapter, checks seat permissions, valid IDs,
    # pending proposal ownership/freshness and fixed engine preconditions.
    return c


def normalize(text):
    try:
        text = text.strip()
        if text.startswith('```'):
            match = re.fullmatch(r'```(?:json)?\s*\n(.*?)\n```', text, re.S)
            if not match: raise ValueError('fence')
            text = match[1]
        obj = decode(text)
        if not isinstance(obj, dict): raise ValueError('object required')
        if 'actions' in obj:
            if set(obj) - {'actions', 'commentary'} or not isinstance(obj.get('commentary', ''), str):
                raise ValueError('envelope')
            if not isinstance(obj['actions'], list) or len(obj['actions']) != 1:
                raise ValueError('exactly one command')
            action = obj['actions'][0]; commentary = obj.get('commentary', '')
            form = 'actions-command'
        else:
            action = obj; commentary = ''; form = 'bare-command'
        wrapped = isinstance(action, dict) and action.get('type') == 'type'
        if wrapped:
            if form != 'actions-command' or set(action) != {'type', 'text'} or not isinstance(action['text'], str):
                raise ValueError('wrapper')
            c = command(decode(action['text'])); form = 'harness-wrapper'
        else: c = command(action)
        proposal = json.dumps({'commentary': commentary, 'actions': [
            {'type': 'type', 'text': json.dumps(c, ensure_ascii=False)}]}, ensure_ascii=False)
        return proposal, {'normalized': not wrapped, 'status': 'accepted', 'input_format': form}
    except (ValueError, TypeError, AttributeError, RecursionError):
        # Never echo a private command or raw model output in errors/public metadata.
        raise ChunkParseError('Seat protocol requires exactly one well-formed supported seat command; no command sent.') from None


def safe_audit(row):
    if not isinstance(row, dict) or row.get('version') != VERSION or row.get('source') not in SOURCES:
        return None
    if row.get('status') not in {'accepted', 'rejected'} or type(row.get('normalized')) is not bool:
        return None
    if row.get('input_format') not in {'actions-command', 'bare-command', 'harness-wrapper', 'invalid'}:
        return None
    return {k: row[k] for k in ('version', 'source', 'normalized', 'status', 'input_format')}
