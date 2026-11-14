"""Explicit harness checkout dependency; no copy of the harness or its state."""
import os
from pathlib import Path

GAME_ROOT=Path(__file__).resolve().parent
HARNESS_ROOT=Path(os.environ.get('PARTITION_HARNESS_ROOT',GAME_ROOT.parent.parent/'ai-gaming')).resolve()
