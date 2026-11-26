"""The typed real-run script's player for a room with a choice of supports: the two things it
works out for itself. Offline; no server, no model."""
import json
import subprocess
import unittest
from pathlib import Path

from live_text_playthrough import RULES_FOR, chart_of, tag_heard

ROOT = Path(__file__).resolve().parent
# A real west view of a room made with the rule set, and the truth of its puzzle, from the server's own code.
ROOM = """import('./world.mjs').then(({Room})=>{const r=new Room({west:'human',east:'live'},{rules:'standard',seed:Number(process.argv[1])});
r.look('west');console.log(JSON.stringify({view:r.view('west'),puzzle:r.puzzle}));})"""


class WhatThePlayerWorksOut(unittest.TestCase):
    def test_the_table_and_the_weight_are_read_from_the_west_view(self):
        for seed in (1, 2, 20261129):
            with self.subTest(seed=seed):
                node = subprocess.run(['node', '-e', ROOM, str(seed)], cwd=ROOT, capture_output=True, text=True, timeout=20)
                self.assertEqual(node.returncode, 0, node.stderr)
                room = json.loads(node.stdout)
                weight, tags, table = chart_of(room['view'])
                puzzle = room['puzzle']
                self.assertEqual((weight, tags), (puzzle['weight'], puzzle['tags']))
                self.assertEqual(table, {s['mark']: s['ratings'] for s in puzzle['supports']})
                # The player's sum picks the support that holds, once it knows the tag and what fits.
                enough = [s['mark'] for s in puzzle['supports'] if table[s['mark']][puzzle['tag']] >= weight and s['fits']]
                self.assertEqual(enough, [s['mark'] for s in puzzle['supports'] if s['holds']])

    def test_a_tag_is_heard_only_when_one_colour_is_named_as_a_colour(self):
        tags = ['红', '黄']
        self.assertEqual(tag_heard('闸轨上挂着一块黄色检修牌。', tags), '黄')
        self.assertEqual(tag_heard('是红牌。', tags), '红')
        self.assertIsNone(tag_heard('黄铜钥匙已经递给你了。', tags), 'the brass key is not a tag')
        self.assertIsNone(tag_heard('不是红色，是黄色。', tags), 'two colours named: ask again')
        self.assertIsNone(tag_heard('', tags))

    def test_every_player_names_the_rules_it_is_written_for(self):
        rules = json.loads((ROOT / 'room-rules.json').read_text())['rule_sets']
        self.assertTrue(set(RULES_FOR.values()) <= set(rules))
        self.assertIn('supports', rules[RULES_FOR['supports']])
        for scenario in ('dictated', 'proposal-first', 'west-only'):
            self.assertNotIn('supports', rules[RULES_FOR[scenario]])


if __name__ == '__main__':
    unittest.main()
