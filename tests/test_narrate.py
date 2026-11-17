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
                     "voiceover/01.mp3", "--export-lines", "--voice files", "narrate.py demo.json --dry-run"):
            self.assertIn(hint, message)
        self.assertNotIn("{cmd}", message)

    def test_explicit_provider_that_cannot_run_fails_clearly(self):
        with self.assertRaisesRegex(narrate.NarrateError, "macOS"):
            self.pick("say")
        with self.assertRaisesRegex(narrate.NarrateError, "ELEVENLABS_API_KEY"):
            self.pick("elevenlabs", say=True)

    def test_missing_key_error_offers_env_and_keychain_and_ends_with_the_command(self):
        with self.assertRaises(narrate.NarrateError) as caught:
            self.pick("elevenlabs", say=True)
        message = narrate.explain(caught.exception, narrate.parse_args(["demo.json", "--voice", "elevenlabs"]))
        self.assertIn("export ELEVENLABS_API_KEY=", message)
        self.assertIn("ELEVENLABS_KEYCHAIN_SERVICE", message)
        self.assertTrue(message.rstrip().endswith("--voice elevenlabs"))

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
        graph = narrate.mix_filter([(0.3, 2.0), (6.25, 8.0)], 14.0, None, 0.2)
        self.assertIn("adelay=300|300", graph)
        self.assertIn("adelay=6250|6250", graph)
        self.assertIn("amix=inputs=2", graph)
        self.assertIn("atrim=0:14.000", graph)
        self.assertIn("loudnorm=I=-14.00:TP=-2.00", graph)
        self.assertNotIn("sidechaincompress", graph)

    def test_second_pass_uses_the_measured_loudness(self):
        stderr = 'noise\n[Parsed_loudnorm_0 @ 0x1] \n{\n "input_i" : "-24.1", "input_tp" : "-6.0", ' \
                 '"input_lra" : "3.2", "input_thresh" : "-34.5", "target_offset" : "0.4"\n}\n'
        measured = narrate.parse_loudnorm(stderr)
        graph = narrate.mix_filter([(0.3, 2.0)], 5.0, None, 0.2, measured)
        self.assertIn("volume=10.10dB", graph)          # -14 LUFS target minus the measured -24.1
        self.assertIn("alimiter=limit=0.7674", graph)   # peaks held under -2.3 dBFS (true peak <= -1)
        self.assertNotIn("loudnorm", graph)             # no AGC fallback that pumps the bed
        self.assertIsNone(narrate.parse_loudnorm("no json here"))
        silent = stderr.replace('"-24.1"', '"-inf"')
        self.assertIsNone(narrate.parse_loudnorm(silent))

    def test_music_is_ducked_under_the_voice_by_an_envelope_not_a_compressor(self):
        graph = narrate.mix_filter([(0.3, 2.0)], 14.0, 2, 0.2)
        self.assertIn("[2:a]", graph)
        self.assertIn("volume=0.200", graph)
        self.assertNotIn("sidechaincompress", graph)
        self.assertIn(narrate.duck_stage([(0.3, 2.0)]), graph)

    def test_music_fades_in_and_out_when_set(self):
        graph = narrate.mix_filter([(0.3, 2.0)], 14.0, 2, 0.2, fade_in=2.0, fade_out=3.0)
        self.assertIn("afade=t=in:st=0:d=2.000", graph)
        self.assertIn("afade=t=out:st=11.000:d=3.000", graph)

    def test_default_music_has_a_fade_out_and_no_fade_in(self):
        graph = narrate.mix_filter([(0.3, 2.0)], 14.0, 2, 0.2)
        self.assertNotIn("afade=t=in", graph)
        self.assertIn("afade=t=out:st=12.500:d=1.500", graph)

    def test_zero_fades_leave_the_bed_untouched_and_long_fades_are_clamped(self):
        graph = narrate.mix_filter([(0.3, 2.0)], 14.0, 2, 0.2, fade_in=0, fade_out=0)
        self.assertNotIn("afade", graph)
        short = narrate.mix_filter([(0.3, 2.0)], 4.0, 2, 0.2, fade_in=10, fade_out=10)
        self.assertIn("afade=t=in:st=0:d=2.000", short)
        self.assertIn("afade=t=out:st=2.000:d=2.000", short)

    def test_fade_settings_come_from_the_voice_config(self):
        voice = narrate.Voice.from_config({"music_fade_in": 1.0, "music_fade_out": 4.0})
        self.assertEqual((voice.music_fade_in, voice.music_fade_out), (1.0, 4.0))
        self.assertEqual((VOICE.music_fade_in, VOICE.music_fade_out), (0.0, narrate.MUSIC_FADE))


class DuckEnvelope(unittest.TestCase):
    @staticmethod
    def gain(stage: str, t: float) -> float:
        """Evaluates the volume expression duck_stage writes, the way ffmpeg would."""
        expression = stage.split("volume='")[1].split("'")[0]
        return eval(expression, {"__builtins__": {}, "t": t, "min": min,  # noqa: S307
                                 "clip": lambda x, lo, hi: max(lo, min(hi, x))})

    def test_short_pauses_stay_ducked_and_real_gaps_come_back_up(self):
        regions = narrate.duck_regions([(0.3, 2.0), (2.6, 4.0), (6.0, 8.0)])
        self.assertEqual(regions, [(0.3, 4.0), (6.0, 8.0)])

    def test_bed_is_held_down_under_speech_with_quarter_second_ramps(self):
        stage = narrate.duck_stage([(1.0, 3.0), (3.5, 5.0), (8.0, 9.0)])
        low = 10 ** (-narrate.DUCK_DB / 20)
        self.assertAlmostEqual(self.gain(stage, 0.5), 1.0, places=6)          # before speech: full
        self.assertAlmostEqual(self.gain(stage, 0.875), (1 + low) / 2, places=3)  # halfway down the ramp
        for t in (1.0, 2.0, 3.25, 4.9, 5.0):                                   # held flat, no swell in 0.5 s pause
            self.assertAlmostEqual(self.gain(stage, t), low, places=3)
        self.assertAlmostEqual(self.gain(stage, 5.25), 1.0, places=6)         # back up 0.25 s after
        self.assertAlmostEqual(self.gain(stage, 6.5), 1.0, places=6)          # a real gap: normal level
        self.assertAlmostEqual(self.gain(stage, 8.5), low, places=3)

    def test_no_lines_means_no_envelope(self):
        self.assertEqual(narrate.duck_stage([]), "")


class PlaceholderBed(unittest.TestCase):
    def test_make_bed_tags_its_file_and_narrate_spots_it(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            bed = Path(tmp) / "bed.m4a"
            result = subprocess.run([sys.executable, "-I", str(REPO / "scripts" / "make-bed.py"), str(bed),
                                     "--seconds", "3"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("placeholder bed, replace before sharing", result.stderr)
            self.assertTrue(narrate.is_placeholder_bed(bed))
            plain = Path(tmp) / "own.m4a"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=d=1", str(plain)], check=True)
            self.assertFalse(narrate.is_placeholder_bed(plain))


class NextCommands(unittest.TestCase):
    def test_printed_commands_point_at_scripts_narrate_py(self):
        args = narrate.parse_args(["demo.json", "--voice", "files"])
        command = narrate.command_for(args)
        self.assertIn(str(REPO / "scripts" / "narrate.py"), command)
        self.assertNotIn("narration/narrate.py", command)
        self.assertEqual(narrate.SCRIPTS, REPO / "scripts")


class ExportLines(unittest.TestCase):
    def manifest(self):
        lines = narrate.plan_lines(SEQUENCE, TIMINGS, 14.0, 0.3)
        return narrate.lines_manifest(lines, SEQUENCE, 14.0, 165, "Acme")

    def test_each_voiced_line_gets_index_label_text_file_timing_and_word_budget(self):
        manifest = self.manifest()
        self.assertEqual(manifest["lines"], [
            {"index": 1, "item": "card-intro", "label": "Hi", "text": "One two three four five.",
             "file": "voiceover/01.mp3", "start": 0.3, "budget": 5.7, "suggested_words": 15},
            {"index": 2, "item": "02", "label": "02", "text": "Six seven eight.",
             "file": "voiceover/02.mp3", "start": 6.3, "budget": 7.7, "suggested_words": 21}])
        self.assertEqual(manifest["total"], 14.0)
        self.assertEqual(manifest["music_length_ms"], 15000)

    def test_export_writes_lines_json_and_both_readmes(self):
        with tempfile.TemporaryDirectory() as tmp:
            demo = Path(tmp)
            written = narrate.write_exports(self.manifest(), demo)
            data = json.loads((demo / "voiceover" / "lines.json").read_text())
            self.assertEqual([l["file"] for l in data["lines"]], ["voiceover/01.mp3", "voiceover/02.mp3"])
            readme = (demo / "voiceover" / "README.txt").read_text()
            for hint in ("01.mp3", "--voice files", "text_to_speech", "generate_audio"):
                self.assertIn(hint, readme)
            music = (demo / "music" / "README.txt").read_text()
            for hint in ("music/bed.m4a", "make-bed.py", "compose_music", "generate_audio", "music_dips"):
                self.assertIn(hint, music)
            self.assertEqual(len(written), 3)
            # the manifest and READMEs must not be mistaken for numbered recordings
            self.assertFalse(narrate.has_voice_files(demo / "voiceover"))

    def test_export_refuses_a_voiceover_folder_that_symlinks_out(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            demo = Path(tmp)
            (demo / "voiceover").symlink_to(outside)
            with self.assertRaises(narrate.NarrateError):
                narrate.write_exports(self.manifest(), demo)
            self.assertEqual(list(Path(outside).iterdir()), [])


class MissingFiles(unittest.TestCase):
    LINES = [narrate.Line(1, "card-intro", "Hello there.", 0.3, 4.0),
             narrate.Line(2, "02", "Now press Run.", 5.3, 4.0),
             narrate.Line(3, "03", "Done.", 9.3, 4.0)]

    def test_every_missing_number_is_listed_with_the_next_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "voiceover"
            folder.mkdir()
            (folder / "02.mp3").write_bytes(b"x")
            with self.assertRaises(narrate.NarrateError) as caught:
                narrate.check_voice_files(self.LINES, folder)
        message = narrate.explain(caught.exception, narrate.parse_args(["demo.json", "--voice", "files"]))
        self.assertIn("2 of 3", message)
        self.assertIn("voiceover/01.mp3", message)
        self.assertIn("voiceover/03.mp3", message)
        self.assertNotIn("voiceover/02.mp3", message)
        self.assertIn("--export-lines", message)
        self.assertTrue(message.rstrip().endswith("narrate.py demo.json --voice files"))

    def test_complete_folder_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            for n in (1, 2, 3):
                (folder / f"{n:02d}.wav").write_bytes(b"x")
            narrate.check_voice_files(self.LINES, folder)


class Keychain(unittest.TestCase):
    SECRET = "sk-keychain-secret-not-real"

    def done(self, code=0, out="", err=""):
        return mock.Mock(returncode=code, stdout=out, stderr=err)

    def test_env_key_wins_and_keychain_is_not_touched(self):
        with mock.patch.object(narrate.subprocess, "run") as run:
            key, problem = narrate.find_api_key(VOICE, {"ELEVENLABS_API_KEY": " env-key "})
        self.assertEqual((key, problem), ("env-key", ""))
        run.assert_not_called()

    def test_config_service_is_ignored_unless_the_user_chose_elevenlabs(self):
        voice = narrate.Voice.from_config({"elevenlabs": {"keychain_service": "elevenlabs-api"}})
        with mock.patch.object(narrate.subprocess, "run") as run:
            self.assertEqual(narrate.find_api_key(voice, {}), ("", ""))
        run.assert_not_called()

    def test_config_cannot_name_an_unrelated_keychain_item(self):
        voice = narrate.Voice.from_config({"elevenlabs": {"keychain_service": "github-token"}})
        with mock.patch.object(narrate.subprocess, "run") as run:
            self.assertEqual(narrate.find_api_key(voice, {}, explicit=True), ("", ""))
        run.assert_not_called()

    def test_write_atomic_replaces_a_planted_symlink_instead_of_following_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            victim = base / "victim.txt"; victim.write_text("keep me")
            target = base / "lines.json"; target.symlink_to(victim)
            (base / "lines.json.part").symlink_to(victim)
            narrate.write_atomic(target, b"new")
            self.assertEqual(victim.read_text(), "keep me")
            self.assertFalse(target.is_symlink())
            self.assertEqual(target.read_text(), "new")

    def test_no_service_means_no_lookup(self):
        with mock.patch.object(narrate.subprocess, "run") as run:
            self.assertEqual(narrate.find_api_key(VOICE, {}), ("", ""))
        run.assert_not_called()

    def test_keychain_service_from_config_is_read_without_a_shell(self):
        voice = narrate.Voice.from_config({"elevenlabs": {"keychain_service": "elevenlabs-api"}})
        with mock.patch.object(narrate.subprocess, "run", return_value=self.done(out=self.SECRET + "\n")) as run:
            key, problem = narrate.find_api_key(voice, {}, explicit=True)
        self.assertEqual((key, problem), (self.SECRET, ""))
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["security", "find-generic-password", "-s", "elevenlabs-api", "-w"])
        self.assertFalse(kwargs.get("shell", False))
        self.assertIn("timeout", kwargs)

    def test_env_service_name_wins_over_config(self):
        voice = narrate.Voice.from_config({"elevenlabs": {"keychain_service": "from-config"}})
        with mock.patch.object(narrate.subprocess, "run", return_value=self.done(out="k")) as run:
            narrate.find_api_key(voice, {"ELEVENLABS_KEYCHAIN_SERVICE": "from-env"})
        self.assertEqual(run.call_args[0][0][3], "from-env")

    def test_missing_item_is_explained_without_leaking_output(self):
        with mock.patch.object(narrate.subprocess, "run",
                               return_value=self.done(44, self.SECRET, "The specified item could not be found")):
            key, problem = narrate.find_api_key(VOICE, {"ELEVENLABS_KEYCHAIN_SERVICE": "nope"})
        self.assertEqual(key, "")
        self.assertIn("nope", problem)
        self.assertIn("not found", problem)
        self.assertNotIn(self.SECRET, problem)

    def test_unsafe_service_name_is_refused_before_running_anything(self):
        with mock.patch.object(narrate.subprocess, "run") as run:
            key, problem = narrate.find_api_key(VOICE, {"ELEVENLABS_KEYCHAIN_SERVICE": "-a evil"})
        self.assertEqual(key, "")
        self.assertIn("not a valid", problem)
        run.assert_not_called()

    def test_missing_security_tool_and_timeout_are_handled(self):
        for error in (FileNotFoundError("security"), narrate.subprocess.TimeoutExpired("security", 60)):
            with mock.patch.object(narrate.subprocess, "run", side_effect=error):
                key, problem = narrate.find_api_key(VOICE, {"ELEVENLABS_KEYCHAIN_SERVICE": "svc"})
            self.assertEqual(key, "")
            self.assertTrue(problem)

    def test_explicit_elevenlabs_with_a_failed_keychain_gives_the_store_command(self):
        args = narrate.parse_args(["demo.json", "--voice", "elevenlabs"])
        with mock.patch.object(narrate.subprocess, "run", return_value=self.done(44, "", "not found")), \
                mock.patch.dict(narrate.os.environ, {"ELEVENLABS_KEYCHAIN_SERVICE": "svc"}, clear=False):
            narrate.os.environ.pop("ELEVENLABS_API_KEY", None)
            with self.assertRaises(narrate.NarrateError) as caught:
                narrate.choose_provider(args, VOICE, Path("/nowhere"))
        message = narrate.explain(caught.exception, args)
        self.assertIn("security add-generic-password", message)
        self.assertIn("-s svc", message)
        self.assertTrue(message.rstrip().endswith("--voice elevenlabs"))

    def test_say_choice_never_reads_the_keychain(self):
        voice = narrate.Voice.from_config({"provider": "say", "elevenlabs": {"keychain_service": "svc"}})
        args = narrate.parse_args(["demo.json"])
        with mock.patch.object(narrate.subprocess, "run") as run, \
                mock.patch.object(narrate.shutil, "which", return_value="/usr/bin/say"):
            self.assertEqual(narrate.choose_provider(args, voice, Path("/nowhere"))[0], "say")
        run.assert_not_called()


class Help(unittest.TestCase):
    def test_help_shows_every_route(self):
        out = io.StringIO()
        with mock.patch("sys.stdout", out), self.assertRaises(SystemExit):
            narrate.parse_args(["--help"])
        text = out.getvalue()
        for hint in ("--export-lines", "--voice files", "ELEVENLABS_KEYCHAIN_SERVICE",
                     "export ELEVENLABS_API_KEY", "music/bed.m4a"):
            self.assertIn(hint, text)



class Schema(unittest.TestCase):
    BASE = {"title": "x", "sequence": [{"card": "a", "title": "t"}]}

    def check(self, voice):
        return narrate.lib.validate({**self.BASE, "voice": voice}, "demo")

    def test_fades_and_keychain_service_are_accepted(self):
        self.assertEqual(self.check({"music": "assets/music.mp3", "music_fade_in": 1, "music_fade_out": 2.5,
                                     "elevenlabs": {"keychain_service": "elevenlabs-api"}}), [])

    def test_negative_fades_and_option_like_service_names_are_rejected(self):
        errors = self.check({"music_fade_out": -1, "elevenlabs": {"keychain_service": "-w"}})
        self.assertEqual(len(errors), 2, errors)


class QualityBarAudio(unittest.TestCase):
    def test_bed_is_set_a_gap_under_the_narration(self):
        volume = narrate.bed_volume(voice_lufs=-16.0, music_lufs=-20.0, gap_db=13.0)
        self.assertAlmostEqual(20 * __import__("math").log10(volume), -9.0, places=6)

    def test_bed_stops_before_a_silent_tail_and_dips_on_key_moments(self):
        graph = narrate.mix_filter([(0.3, 2.0)], 20.0, 2, 0.3, fade_out=4.0, tail=3.0, dips=((8.0, 1.5),))
        self.assertIn("atrim=0:17.000", graph)            # the bed ends 3 s before the cut
        self.assertIn("afade=t=out:st=13.000:d=4.000", graph)
        self.assertIn("apad,atrim=0:20.000[bed]", graph)  # then silence to the end
        self.assertIn("volume='(1-0.650*clip(min((t-8.000)/0.3,(9.500-t)/0.3),0,1))':eval=frame", graph)
        self.assertIn("volume=0.300", graph)              # the level as given

    def test_mix_targets_minus_14_lufs(self):
        self.assertEqual(narrate.TARGET_LUFS, -14)
        self.assertLessEqual(narrate.TARGET_TP, -1.0)

    def test_timing_outro_is_read_and_old_files_mean_no_outro(self):
        with tempfile.TemporaryDirectory() as tmp:
            new = Path(tmp) / "new.json"
            new.write_text(json.dumps({"total": 20, "outro": 5.0, "items": []}))
            old = Path(tmp) / "old.json"
            old.write_text(json.dumps({"total": 20, "items": []}))
            self.assertEqual(narrate.timing_outro(new), 5.0)
            self.assertEqual(narrate.timing_outro(old), 0.0)
            self.assertEqual(narrate.timing_outro(Path(tmp) / "missing.json"), 0.0)

    def test_loudness_report_names_each_problem(self):
        self.assertEqual(narrate.loudness_report({"I": -14.2, "TP": -1.6, "LRA": 9}), [])
        problems = narrate.loudness_report({"I": -11.0, "TP": -0.2, "LRA": 18})
        self.assertEqual(len(problems), 3)

    def test_music_settings_from_the_config(self):
        voice = narrate.Voice.from_config({"music_gap_db": 14, "music_dips": [{"at": 4, "dur": 2}],
                                           "music_fade_out": 2})
        self.assertEqual((voice.music_gap_db, voice.music_dips, voice.fade_out_set, voice.music_volume),
                         (14, ((4.0, 2.0),), True, None))


if __name__ == "__main__":
    unittest.main()
