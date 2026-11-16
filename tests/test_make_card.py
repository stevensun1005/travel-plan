# travel-plan — https://github.com/stevensun1005/travel-plan
# Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
# Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
# and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from make_card import inject  # noqa: E402

PAGE = '<html><head><meta name="description" content="A &amp; B"><title>Trip "1"</title>\n</head><body></body></html>'


class InjectTest(unittest.TestCase):
    def test_absolute_image_and_escaping(self):
        out = inject(PAGE, 'https://x.test/trip')
        self.assertIn('<meta property="og:image" content="https://x.test/trip/og.png">', out)
        self.assertIn('<meta property="og:url" content="https://x.test/trip/">', out)
        self.assertIn('content="Trip &quot;1&quot;"', out)
        self.assertIn('content="A &amp; B"', out)
        self.assertIn('summary_large_image', out)

    def test_rerun_replaces_block(self):
        once = inject(PAGE, 'https://x.test/a/')
        twice = inject(once, 'https://x.test/b/')
        self.assertEqual(twice.count('og:start'), 1)
        self.assertNotIn('x.test/a/', twice)


if __name__ == '__main__':
    unittest.main()
