import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import location_daemon as d  # noqa: E402


class TestProtocol(unittest.TestCase):
    def test_parse_valid_set(self):
        self.assertEqual(
            d.parse_command('{"id": 1, "cmd": "set", "lat": 25.0, "lng": 121.5}'),
            {"id": 1, "cmd": "set", "lat": 25.0, "lng": 121.5},
        )

    def test_parse_blank_returns_none(self):
        self.assertIsNone(d.parse_command("   "))

    def test_parse_invalid_json_returns_none(self):
        self.assertIsNone(d.parse_command("not json"))

    def test_parse_non_dict_json_returns_none(self):
        self.assertIsNone(d.parse_command("[1, 2, 3]"))
        self.assertIsNone(d.parse_command("42"))

    def test_reply_ok(self):
        self.assertEqual(d.reply_ok(3), {"id": 3, "ok": True})

    def test_reply_err(self):
        self.assertEqual(d.reply_err(3, "boom"), {"id": 3, "ok": False, "error": "boom"})


if __name__ == "__main__":
    unittest.main()
