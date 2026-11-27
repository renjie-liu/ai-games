"""Writes a hosted server's grant: how many voice connections it may ever start (HOSTING.md).

    python deploy/grant.py <connections> --billing-is-on

Run once, on the server, by the project owner. The count is the spending cap: every connection
ends at the session's cost stop (live-limits.json), so the server cannot start more than
<connections> of them whatever happens. `--billing-is-on` is the owner saying that the Google
project behind the key has billing enabled: on unpaid quota Google may use what players say to
improve its products, and people may review it.

It refuses when a grant is already there: a second one would throw away the count of what has
been used. To allow more connections later, see HOSTING.md.
"""
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import live_budget  # noqa: E402


def mint(directory, connections):
    directory = Path(directory)
    if type(connections) is not int or connections < 1:
        raise SystemExit('refused: connections is a whole number from 1')
    if any((directory / name).exists() for name in ('authorization.json', 'ledger.json')):
        raise SystemExit(f'refused: {directory} already holds a grant; its count of used connections would be lost')
    os.umask(0o077)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    grant = {'schema': 2, 'authorization': str(uuid4()), 'connectionLimit': connections, 'projectVerified': True}
    ledger = {'authorization': grant['authorization'], 'limits': live_budget.grant_limits(grant), 'attempts': []}
    (directory / 'ledger.json').write_text(json.dumps(ledger), encoding='utf-8')
    (directory / 'authorization.json').write_text(json.dumps(grant), encoding='utf-8')
    return live_budget.quota_status(directory)


if __name__ == '__main__':
    arguments = sys.argv[1:]
    if len(arguments) != 2 or arguments[1] != '--billing-is-on' or not arguments[0].isdigit():
        raise SystemExit(__doc__)
    status = mint(live_budget.ROOT / '.live', int(arguments[0]))
    print(f"grant written: {status['remaining']} voice connections, each stopped at an estimated "
          f"${live_budget.SESSION['usage_stop_usd']:.2f}")
