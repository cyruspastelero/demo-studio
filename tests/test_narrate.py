"""Behaviour of scripts/narrate.py: timing, fit, cache keys, provider choice and the ElevenLabs
request, with the network mocked. Run: python3 -I tests/test_narrate.py"""

import importlib.util
import sys
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent


def load_narrate():
    spec = importlib.util.spec_from_file_location("narrate", REPO / "scripts" / "narrate.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["narrate"] = module  # dataclasses look their module up here while a class is being built
    spec.loader.exec_module(module)
    return module


narrate = load_narrate()

SEQUENCE = [
    {"card": "intro", "title": "Hi", "duration": 3.0, "voiceover": "One two three four five."},
    {"scene": "01", "stem": "01-a", "trim": [1.0, 7.0], "speed": 2},
    {"scene": "02", "stem": "02-b", "trim": [0.0, 6.0], "voiceover": "Six seven eight."},
    {"card": "outro", "title": "Bye", "duration": 2.0},
]
TIMINGS = [narrate.ItemTiming("card-intro", 0.0, 3.0), narrate.ItemTiming("01", 3.0, 3.0),
           narrate.ItemTiming("02", 6.0, 6.0), narrate.ItemTiming("card-outro", 12.0, 2.0)]
VOICE = narrate.Voice.from_config({})


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


class Timing(unittest.TestCase):
    def test_lines_start_after_lead_in_and_run_until_the_next_voiced_item(self):
        lines = narrate.plan_lines(SEQUENCE, TIMINGS, 14.0, 0.3)
        self.assertEqual([(l.number, l.key, l.start, l.budget) for l in lines],
                         [(1, "card-intro", 0.3, 5.7), (2, "02", 6.3, 7.7)])

    def test_derived_timing_matches_build_keynote_arithmetic(self):
        timings = narrate.derive_timing(SEQUENCE, Path("/nowhere"), probe=lambda _: 99.0)
        self.assertEqual([(t.key, t.start, t.duration) for t in timings],
                         [("card-intro", 0.0, 3.0), ("01", 3.0, 3.0), ("02", 6.0, 6.0), ("card-outro", 12.0, 2.0)])

    def test_open_ended_trim_probes_the_raw_take(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "01-a-t1.mp4").write_bytes(b"x")
            item = {"scene": "01", "stem": "01-a", "trim": [2.0, None]}
            self.assertEqual(narrate.item_length(item, Path(tmp), probe=lambda _: 10.0), 8.0)

    def test_timing_file_that_no_longer_matches_demo_json_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cut.timing.json"
            path.write_text(json.dumps({"total": 5, "items": [{"key": "card-intro", "start": 0, "duration": 5}]}))
            with self.assertRaisesRegex(narrate.NarrateError, "build the cut again"):
                narrate.load_timing(path, SEQUENCE)

    def test_matching_timing_file_is_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cut.timing.json"
            items = [{"key": t.key, "start": t.start, "duration": t.duration} for t in TIMINGS]
            path.write_text(json.dumps({"total": 14.0, "items": items}))
            timings, total = narrate.load_timing(path, SEQUENCE)
            self.assertEqual((timings, total), (TIMINGS, 14.0))


class Fit(unittest.TestCase):
    def test_overrun_is_reported_with_length_and_budget(self):
        line = narrate.Line(3, "05", "words", 10.0, 7.4)
        spoken = [narrate.Spoken(line, 9.1, True, None)]
        self.assertEqual(narrate.fit_problems(spoken), ["line 3 (05) runs 9.1s but has 7.4s"])
        self.assertIn("NO", narrate.format_table(spoken))

    def test_line_that_fits_has_no_problem_and_estimates_are_marked(self):
        line = narrate.Line(1, "card-intro", "words", 0.3, 5.0)
        spoken = [narrate.Spoken(line, 2.0, False, None)]
        self.assertEqual(narrate.fit_problems(spoken), [])
        self.assertIn("~2.00s", narrate.format_table(spoken))

    def test_overrun_advice_says_how_much_and_how_many_words_to_cut(self):
        line = narrate.Line(3, "05", "words", 10.0, 7.4)
        advice = narrate.overrun_advice([narrate.Spoken(line, 9.1, True, None)], 165)
        self.assertEqual(advice, ["line 3 (05) runs 9.1s but has 7.4s: 1.7s too long (cut about 5 words)"])

    def test_next_steps_are_ready_to_paste_and_keep_braces_in_text(self):
        args = narrate.parse_args(["demo.json", "--voice", "files"])
        error = narrate.NarrateError("x", ('Say "{a}" then {cmd}', "{keynote}"))
        message = narrate.explain(error, args)
        self.assertIn('Say "{a}" then python3 -I ', message)
        self.assertIn("build-keynote.py demo.json", message)
        self.assertIn("--voice files", narrate.command_for(args))

    def test_estimate_uses_words_per_minute(self):
        self.assertAlmostEqual(narrate.estimate_seconds("a b c d e f", 120), 3.0)


class CacheKey(unittest.TestCase):
    def test_same_inputs_give_the_same_key(self):
        a = narrate.cache_key("elevenlabs", "v", "m", {"stability": 0.5}, "Hello")
        self.assertEqual(a, narrate.cache_key("elevenlabs", "v", "m", {"stability": 0.5}, "Hello"))
        self.assertRegex(a, r"^[0-9a-f]{64}$")

    def test_any_change_gives_a_new_key(self):
        base = ("elevenlabs", "v", "m", {"stability": 0.5}, "Hello")
        variants = [("say", *base[1:]), (base[0], "w", *base[2:]), (*base[:2], "n", *base[3:]),
                    (*base[:3], {"stability": 0.6}, base[4]), (*base[:4], "Hello!")]
        keys = {narrate.cache_key(*v) for v in variants}
        self.assertEqual(len(keys), len(variants))
        self.assertNotIn(narrate.cache_key(*base), keys)


class Provider(unittest.TestCase):
    def pick(self, requested=None, configured=None, key=False, say=False, files=False):
        return narrate.select_provider(requested, configured, key, say, files)

    def test_command_line_beats_config(self):
        self.assertEqual(self.pick("files", "say", say=True), "files")

    def test_config_is_used_when_no_flag(self):
        self.assertEqual(self.pick(configured="say", key=True, say=True), "say")

    def test_auto_order_is_files_then_key_then_say(self):
        self.assertEqual(self.pick(key=True, say=True, files=True), "files")
        self.assertEqual(self.pick(key=True, say=True), "elevenlabs")
        self.assertEqual(self.pick(say=True), "say")

    def test_nothing_available_lists_the_three_options_as_commands(self):
        with self.assertRaises(narrate.NarrateError) as caught:
            self.pick()
        message = narrate.explain(caught.exception, narrate.parse_args(["demo.json"]))
        for hint in ("--voice say", "export ELEVENLABS_API_KEY=", "--voice elevenlabs",
                     "voiceover/01.wav", "--voice files", "narrate.py demo.json --dry-run"):
            self.assertIn(hint, message)
        self.assertNotIn("{cmd}", message)

    def test_explicit_provider_that_cannot_run_fails_clearly(self):
        with self.assertRaisesRegex(narrate.NarrateError, "macOS"):
            self.pick("say")
        with self.assertRaisesRegex(narrate.NarrateError, "ELEVENLABS_API_KEY"):
            self.pick("elevenlabs", say=True)

    def test_voice_files_are_found_by_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            self.assertFalse(narrate.has_voice_files(folder))
            (folder / "notes.txt").write_text("x")
            self.assertFalse(narrate.has_voice_files(folder))
            (folder / "02.m4a").write_bytes(b"x")
            self.assertTrue(narrate.has_voice_files(folder))
            line = narrate.Line(2, "02", "t", 0, 1)
            self.assertEqual(narrate.user_file(line, folder), folder / "02.m4a")
            self.assertIsNone(narrate.user_file(narrate.Line(1, "x", "t", 0, 1), folder))


class ElevenLabs(unittest.TestCase):
    KEY = "test-key-not-real"

    def test_request_has_url_header_and_body(self):
        voice = narrate.Voice.from_config({"elevenlabs": {"voice_id": "abc", "stability": 0.3}})
        request = narrate.build_tts_request("Hello there.", voice, self.KEY)
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.full_url,
                         "https://api.elevenlabs.io/v1/text-to-speech/abc?output_format=mp3_44100_128")
        self.assertEqual(request.get_header("Xi-api-key"), self.KEY)
        self.assertNotIn(self.KEY, request.full_url)
        body = json.loads(request.data)
        self.assertEqual(body, {"text": "Hello there.", "model_id": "eleven_multilingual_v2",
                                "voice_settings": {"stability": 0.3, "similarity_boost": 0.75}})

    def test_default_voice_is_used_when_none_is_set(self):
        request = narrate.build_tts_request("x", VOICE, self.KEY)
        self.assertIn(narrate.DEFAULT_ELEVENLABS_VOICE, request.full_url)

    def test_rendered_line_is_cached_and_not_requested_twice(self):
        opener = mock.Mock(return_value=FakeResponse(b"ID3fake-mp3"))
        line = narrate.Line(1, "card-intro", "Hello.", 0.3, 4.0)
        with tempfile.TemporaryDirectory() as tmp:
            first = narrate.render_elevenlabs(line, VOICE, self.KEY, Path(tmp), opener=opener)
            second = narrate.render_elevenlabs(line, VOICE, self.KEY, Path(tmp), opener=opener)
            self.assertEqual(first, second)
            self.assertEqual(first.read_bytes(), b"ID3fake-mp3")
            self.assertEqual(opener.call_count, 1)
            self.assertEqual([p.name for p in Path(tmp).iterdir()], [first.name])

    def http_error(self, code, detail):
        body = io.BytesIO(json.dumps({"detail": detail}).encode())
        return urllib.error.HTTPError("https://api.elevenlabs.io", code, "error", {}, body)

    def render_failing(self, error):
        line = narrate.Line(4, "03", "Hello.", 0.3, 4.0)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(narrate.NarrateError) as caught:
                narrate.render_elevenlabs(line, VOICE, self.KEY, Path(tmp), opener=mock.Mock(side_effect=error))
            self.assertEqual(list(Path(tmp).iterdir()), [])
        message = str(caught.exception)
        self.assertNotIn(self.KEY, message)
        self.assertIn("line 4", message)
        return message

    def test_bad_key_names_the_env_var(self):
        message = self.render_failing(self.http_error(401, {"status": "invalid_api_key", "message": "Invalid"}))
        self.assertIn("401", message)
        self.assertIn("ELEVENLABS_API_KEY", message)

    def test_quota_is_explained(self):
        message = self.render_failing(self.http_error(401, {"status": "quota_exceeded", "message": "Out of credits"}))
        self.assertIn("quota", message)
        self.assertIn("Out of credits", message)

    def test_network_failure_is_explained(self):
        message = self.render_failing(urllib.error.URLError("no route to host"))
        self.assertIn("could not reach ElevenLabs", message)
        self.assertIn("no route to host", message)


class Mix(unittest.TestCase):
    def test_lines_are_delayed_to_their_start_and_loudness_normalised(self):
        graph = narrate.mix_filter([0.3, 6.25], 14.0, None, 0.2, True)
        self.assertIn("adelay=300|300", graph)
        self.assertIn("adelay=6250|6250", graph)
        self.assertIn("amix=inputs=2", graph)
        self.assertIn("atrim=0:14.000", graph)
        self.assertIn("loudnorm=I=-16", graph)
        self.assertNotIn("sidechaincompress", graph)

    def test_second_pass_uses_the_measured_loudness(self):
        stderr = 'noise\n[Parsed_loudnorm_0 @ 0x1] \n{\n "input_i" : "-24.1", "input_tp" : "-6.0", ' \
                 '"input_lra" : "3.2", "input_thresh" : "-34.5", "target_offset" : "0.4"\n}\n'
        measured = narrate.parse_loudnorm(stderr)
        graph = narrate.mix_filter([0.3], 5.0, None, 0.2, True, measured)
        self.assertIn("measured_I=-24.1", graph)
        self.assertIn("linear=true", graph)
        self.assertIsNone(narrate.parse_loudnorm("no json here"))
        silent = stderr.replace('"-24.1"', '"-inf"')
        self.assertIsNone(narrate.parse_loudnorm(silent))

    def test_music_is_ducked_under_the_voice(self):
        graph = narrate.mix_filter([0.3], 14.0, 2, 0.2, True)
        self.assertIn("[2:a]", graph)
        self.assertIn("sidechaincompress", graph)
        plain = narrate.mix_filter([0.3], 14.0, 2, 0.2, False)
        self.assertNotIn("sidechaincompress", plain)
        self.assertIn("volume=0.100", plain)


if __name__ == "__main__":
    unittest.main()
