"""Offline preflight: SDK dependencies, the limits file and the harness checkout.
Never reads credentials or the ledger, and never opens a socket."""
import importlib
import json


def check():
    # websockets imports SOCKS support lazily and otherwise raises only on dial.
    # Check it even on direct connections so a later OS proxy change is safe.
    required = [('google.genai', 'sdk'), ('google.genai.types', 'sdk'),
                ('socksio', 'http_proxy'), ('python_socks.async_.asyncio', 'socks'),
                ('websockets.asyncio.client', 'websocket')]
    for name, label in required:
        try:
            module = importlib.import_module(name)
        except (ImportError, AttributeError):
            raise RuntimeError('live_dependency_' + label) from None
        if label == 'socks' and not hasattr(module, 'Proxy'):
            raise RuntimeError('live_dependency_socks')
        if label == 'websocket' and not hasattr(module, 'SocksProxy'):
            raise RuntimeError('live_dependency_socks')
    # The caps every session runs under: a bad override must be said here, not found as a dead worker.
    try:
        importlib.import_module('live_budget')
    except RuntimeError:
        raise RuntimeError('live_limits_invalid') from None
    # The worker's own imports. A harness checkout that is not the pinned one (README) lacks modules
    # the tool bridge needs; without this check the worker dies on import and the page only sees
    # that it stopped.
    try:
        importlib.import_module('live_harness')
    except ImportError:
        raise RuntimeError('live_harness_mismatch') from None
    return {'ok': True, 'code': 'ready', 'network_requests': 0}


def diagnostic(error):
    """Allowlist categories only; no exception text, proxy URL, key, or paths."""
    if isinstance(error, ImportError):
        frames = [];modules=[]
        tb = error.__traceback__
        while tb:
            frames.append(tb.tb_frame.f_code.co_name)
            modules.append(tb.tb_frame.f_globals.get('__name__',''))
            tb = tb.tb_next
        if 'connect_socks_proxy' in frames:return 'live_dependency_socks'
        if any(m.startswith('httpx.') for m in modules):return 'live_dependency_http_proxy'
        return 'live_dependency_import'
    return None


if __name__ == '__main__':
    try:
        result = check()
    except RuntimeError as e:
        result = {'ok': False, 'code': str(e), 'network_requests': 0}
    except Exception:
        result = {'ok': False, 'code': 'live_runtime_check_failed', 'network_requests': 0}
    print(json.dumps(result))
    raise SystemExit(0 if result['ok'] else 1)
