"""One authorized Google request, gated at the HTTP transport (including retries).

This is a local smoke restriction, not a replacement provider or general billing system.
The existing Google adapter still serializes requests and parses replies. Its SDK receives
an explicit no-retry HTTP client. A shared, durable ledger gates EVERY transport send.
Cost preflight is a conservative byte-based estimate at the configured list price, NOT
an invoice or a provider-enforced dollar ceiling. Failed/unfinished sends retain exposure.
"""
from __future__ import annotations

import fcntl
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from google import genai
from google.genai import types
from harness.providers import ProviderError, make_provider

MODEL = 'gemini-3.8-flash'
ENDPOINT = 'https://generativelanguage.googleapis.com'
# Separate local authorization is required. This source repository has no grant.
AUTHORIZATION_LEDGER = (Path(__file__).parent/'.model'/'ledger.json').resolve()


def bounded_config(cfg):
    """Never increase an existing cap. No retries, secondary roles or automatic restarts."""
    actor = cfg.roles['actor']
    p = cfg.providers[actor.provider]
    if p.adapter != 'google' or p.model != MODEL or p.base_url != ENDPOINT:
        raise ValueError('This smoke authorizes only the existing Google gemini-3.8-flash endpoint')
    if not actor.enabled or cfg.budget.usd_cap is None:
        raise ValueError('An enabled actor and finite configured USD cap are required')
    budget = cfg.budget.model_dump()
    for key, limit in dict(usd_cap=.50, steps_cap=1, time_cap_s=180).items():
        budget[key] = min(budget[key], limit) if budget[key] is not None else limit
    data = cfg.model_dump()
    data.update(budget=budget, actor_max_tokens=min(cfg.actor_max_tokens, 1024),
                actor_initial_max_tokens=None,
                provider_retries={**cfg.provider_retries.model_dump(), 'max': 0})
    # The original provider identity/key env/endpoint are not replaced.
    data['providers'][actor.provider]['timeout_s'] = min(p.timeout_s, budget['time_cap_s'])
    return type(cfg).model_validate(data)


def identity(cfg, prices):
    p = cfg.providers[cfg.roles['actor'].provider]
    rate = prices.entries[p.price_table_entry]
    if rate.input_per_m <= 0 or rate.output_per_m <= 0:
        raise ValueError('Smoke needs explicit positive input/output list prices')
    return dict(model=p.model, endpoint=p.base_url, price_version=prices.version,
                rates=rate.model_dump(), budget_usd=cfg.budget.usd_cap,
                time_cap_s=cfg.budget.time_cap_s, max_output_tokens=cfg.actor_max_tokens,
                request_cap=1)


def initialize_fixture(path, cfg, prices):
    """Offline tests ONLY. This ledger is never accepted by a real HTTP transport."""
    path = Path(path)
    if not path.is_absolute():
        raise ValueError('Use one absolute ledger path shared by all seats/restarts')
    record = dict(schema='partition-google-smoke-v1', offline_fixture=True, **identity(cfg, prices),
                  created_at=time.time(), attempts=[], blocked=[])
    record['deadline'] = record['created_at'] + cfg.budget.time_cap_s
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(record, f); f.flush(); os.fsync(f.fileno())


def authorized_ledger(cfg, prices):
    """Bind live entry points to the one persistent authorization, independent of output.

    No initialization/reset/mint CLI exists. Any future grant needs a separately
    approved update; this checkout never includes or auto-creates an allowance.
    Fail closed before provider construction; do not even append a blocked attempt.
    """
    override=os.environ.get('PARTITION_MODEL_LEDGER')
    if override and Path(override).resolve()!=AUTHORIZATION_LEDGER:
        raise ValueError('Alternate authorization ledger refused; output is not authorization')
    if not AUTHORIZATION_LEDGER.is_file():
        raise ValueError('Authorization required; this game checkout has no real-model grant')
    d=json.loads(AUTHORIZATION_LEDGER.read_text())
    if (d.get('authorization_id')!='partition-20261114-single-request'
            or d.get('offline_fixture') is not False or d.get('request_cap')!=1):
        raise ValueError('Unknown authorization; no request allowed')
    if len(d.get('attempts',[]))>=d['request_cap']:
        raise ValueError('Authorization exhausted; no additional real model request permitted')
    ledger=Ledger(AUTHORIZATION_LEDGER,cfg,prices)
    if time.time()>=d['deadline']:raise ValueError('Authorization expired')
    return ledger


class Ledger:
    def __init__(self, path, cfg, prices):
        self.path = Path(path)
        if not self.path.is_absolute():
            raise ValueError('An absolute shared PARTITION_MODEL_LEDGER is required')
        self.expected = identity(cfg, prices)
        self.edit(lambda d: None)  # Validate BEFORE constructing a provider.

    def edit(self, fn):
        with self.path.open('r+') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            d = json.load(f)
            if d.get('schema') != 'partition-google-smoke-v1' or any(d.get(k) != v for k, v in self.expected.items()):
                raise ValueError('Smoke ledger/config mismatch; refusing request')
            result = fn(d)
            f.seek(0); json.dump(d, f); f.truncate(); f.flush(); os.fsync(f.fileno())
            return result

    def claim(self, request):
        body = request.read()
        url = urlsplit(str(request.url))
        endpoint = urlsplit(self.expected['endpoint'])
        payload = json.loads(body)
        output = payload.get('generationConfig', {}).get('maxOutputTokens', 0)
        rates = self.expected['rates']
        # Counting UTF-8 bytes of the entire wire JSON (plus overhead) intentionally
        # overestimates this text-only prompt. Not a formal tokenizer/billing guarantee.
        estimate = ((len(body) + 1024) * max(rates['input_per_m'], rates['cached_per_m'])
                    + output * rates['output_per_m']) / 1_000_000
        def reserve(d):
            reason = None
            if (request.method != 'POST' or (url.scheme, url.netloc) != (endpoint.scheme, endpoint.netloc)
                    or url.query or url.path not in [f'/{v}/models/{MODEL}:generateContent' for v in ('v1beta', 'v1')]):
                reason = 'endpoint_not_authorized'
            elif not isinstance(output, int) or not 0 < output <= d['max_output_tokens']:
                reason = 'output_limit'
            elif payload.get('tools') or any(k in json.dumps(payload) for k in ('inlineData', 'fileData', 'cachedContent')):
                reason = 'text_only_smoke'
            elif time.time() >= d['deadline']:
                reason = 'deadline'
            elif len(d['attempts']) >= d['request_cap']:
                reason = 'request_limit'
            elif estimate > d['budget_usd']:
                reason = 'estimated_cost_limit'
            if reason:
                d['blocked'].append({'reason': reason, 'at': time.time()})
                return None, reason
            d['attempts'].append(dict(number=len(d['attempts'])+1, at=time.time(),
                                      wire_bytes=len(body), max_output_tokens=output,
                                      preflight_estimate_usd=estimate, status='reserved',
                                      billing='unknown until usage arrives; failed send may incur cost'))
            # A request started late in the shared window cannot take the original
            # full timeout. The harness also stops input if its own time cap expires.
            remaining=max(.001,d['deadline']-time.time())
            request.extensions['timeout']={k:min(v,remaining) if v is not None else remaining
                for k,v in request.extensions.get('timeout',dict(connect=remaining,read=remaining,write=remaining,pool=remaining)).items()}
            return len(d['attempts'])-1, None
        index, reason = self.edit(reserve)
        if reason:
            raise ProviderError('Smoke guard: '+reason+'; no HTTP request sent', retryable=False)
        return index

    def finish(self, index, **fields):
        self.edit(lambda d: d['attempts'][index].update(fields))


class GatedTransport(httpx.BaseTransport):
    def __init__(self, ledger, inner):
        self.ledger, self.inner = ledger, inner

    def handle_request(self, request):
        index = self.ledger.claim(request)  # durable count BEFORE the network, never refunded
        started = time.monotonic()
        try:
            response = self.inner.handle_request(request)
        except Exception as exc:
            self.ledger.finish(index, status='transport_failed', error_type=type(exc).__name__)
            raise
        self.ledger.finish(index, status='http_response', http_status=response.status_code,
                           latency_ms=round((time.monotonic()-started)*1000))
        return response

    def close(self):
        self.inner.close()


class SmokeProvider:
    def __init__(self, cfg, prices, ledger, *, transport=None, api_key=None):
        if transport is None:
            authorized=authorized_ledger(cfg,prices)
            if ledger.path.resolve()!=authorized.path:
                raise ValueError('Only the fixed authorization ledger permits real transport')
        elif not isinstance(transport,httpx.MockTransport):
            raise ValueError('Offline injection requires MockTransport; no alternate live transport')
        self.ledger, self.prices = ledger, prices
        p = cfg.providers[cfg.roles['actor'].provider]
        self.price_entry = p.price_table_entry
        # Reuse the existing adapter's serializer/parser. Replace only its SDK transport
        # via documented HttpOptions, with explicit no retries and no redirects/proxies.
        self.provider = make_provider(p, api_key=api_key)
        self.provider._client.close()
        key = api_key or os.environ.get(p.api_key_env or 'GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        client = httpx.Client(transport=GatedTransport(ledger, transport or httpx.HTTPTransport(retries=0)),
                              follow_redirects=False, trust_env=False, timeout=p.timeout_s)
        self.provider._client = genai.Client(api_key=key, vertexai=False, http_options=types.HttpOptions(
            base_url=p.base_url, timeout=int(p.timeout_s*1000), httpx_client=client,
            retry_options=types.HttpRetryOptions(attempts=1)))
        self.provider._endpoint = p.base_url.rstrip('/')
        self.name, self.capabilities = self.provider.name, self.provider.capabilities

    def complete(self, messages, max_tokens):
        try:
            c = self.provider.complete(messages, max_tokens)
        except Exception as exc:
            # SDK errors can echo request details. Keep exception type, not raw text.
            raise ProviderError('Model smoke stopped: '+type(exc).__name__+
                                '; see sanitized ledger; no automatic retry', retryable=False) from None
        self.ledger.finish(0, usage=dict(input_tokens=c.input_tokens, cached_tokens=c.cached_tokens,
                                        output_tokens_including_thinking=c.output_tokens),
                           estimated_cost_usd=self.prices.completion_cost_usd(self.price_entry, c),
                           billing='provider token usage x configured list prices; not an invoice')
        return c

    def close(self):
        self.provider._client.close()

    def audit(self):
        return transport_audit(self.ledger.edit(lambda d:d))


def transport_audit(d):
    """Aggregate only: no request bodies, headers, credentials or raw provider errors."""
    attempts=d['attempts']
    return dict(http_attempts=len(attempts), http_responses=sum('http_status' in a for a in attempts),
                retries=max(0,len(attempts)-1), blocked_before_send=len(d['blocked']),
                usage_estimate_usd=sum(a.get('estimated_cost_usd',0) for a in attempts),
                unknown_billing_attempts=sum('usage' not in a for a in attempts), budget_usd=d['budget_usd'])


if __name__ == '__main__':
    raise SystemExit('No authorization creation/reset CLI. Existing real request authorization is exhausted.')
