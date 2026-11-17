"""Untrusted demo folders (SECURITY.md threat model): build sidecars are validated before any value
reaches an ffmpeg filter graph or a loop, takes and outputs stay inside the demo folder, schema
patterns anchor at the very end, ffmpeg reads only local files, template folders cannot redirect
writes, and a shared demo.json cannot spend ElevenLabs credits on its own.
Run: python3 -I tests/test_security.py"""

import contextlib
import copy
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parent.parent
SCRIPTS = REPO / "scripts"
sys.path.insert(0, str(SCRIPTS))

import demolib as lib  # noqa: E402
from keynote import look as looks  # noqa: E402
from keynote import measure, motion, voice_sync  # noqa: E402
from keynote.model import PlanError, _shot_from, confine_take  # noqa: E402


def load(name: str, file: str):
    module_spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    module = importlib.util.module_from_spec(module_spec)
    sys.modules[name] = module  # dataclasses look their module up here
    module_spec.loader.exec_module(module)
    return module


narrate = load("narrate", "narrate.py")
check_cut = load("check_cut", "check-cut.py")
build_keynote = load("build_keynote", "build-keynote.py")
copier = load("template_from_video", "template-from-video.py")
validator = load("template_validate", "template-validate.py")
core = sys.modules["narration.core"]
mix = sys.modules["narration.mix"]

INJECTION = "-14:print_format=json[x];[x]amovie=/etc/passwd"


def good_plan(**changes) -> dict:
    plan = {"video": "x-keynote-cut.mp4", "total": 20.0, "template": "house", "look": looks.defaults(),
            "runs": [{"start": 2.0, "end": 10.0, "cuts": [5.0],
                      "zooms": [{"start": 3.0, "landed": 4.0, "out": 6.0, "end": 7.0, "scale": 1.15}]}],
            "cards": [{"key": "card-intro", "kind": "hero", "start": 0.0, "end": 2.0, "accent": "", "outro": 0.0}],
            "callouts": [{"start": 4.0, "end": 7.5, "kind": "statement", "text": "Saves you time"}],
            "highlights": [], "brand": {"accent": "#2255FF", "sweep": ["#2255FF", "#22AAFF"],
                                        "highlight": "#2255FF", "pill": None},
            "fonts": ["Inter"], "warnings": []}
    plan.update(changes)
    return plan


class Folder(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = Path(self._tmp.name).resolve()
        self.demo = base / "demo"
        self.outside = base / "outside"
        self.exports = self.demo / "recordings" / "exports"
        self.exports.mkdir(parents=True)
        self.outside.mkdir()
        self.addCleanup(self.reset_audio)

    @staticmethod
    def reset_audio() -> None:
        core.use_audio({"lufs": -14, "true_peak": -1.0, "music_gap_db": 13.0, "outro_silence": 3.0})

    def write(self, name: str, data, raw: str | None = None) -> Path:
        path = self.exports / name
        path.write_text(raw if raw is not None else json.dumps(data))
        return path


# ---------------------------------------------------------------- H1: filter-graph injection

class AudioTargets(Folder):
    def test_template_audio_values_must_be_numbers_in_range(self):
        for bad in ({"lufs": INJECTION}, {"lufs": True}, {"lufs": float("nan")}, {"true_peak": float("inf")},
                    {"lufs": -80}, {"music_gap_db": "13"}, {"outro_silence": 99}, {"evil": 1}, "not an object"):
            with self.subTest(audio=bad), self.assertRaises(lib.SidecarError):
                core.use_audio(bad)

    def test_valid_audio_reaches_the_graph_with_fixed_precision(self):
        core.use_audio({"lufs": -16, "true_peak": -1.5})
        self.assertEqual(mix.loudnorm(None), "loudnorm=I=-16.00:TP=-2.50:LRA=11:print_format=json")
        second = mix.loudnorm({"input_i": "-20.0"})
        self.assertTrue(second.startswith("volume=4.00dB,alimiter=limit="), second)

    def test_loudnorm_refuses_a_target_that_is_not_a_number(self):
        with mock.patch.object(core, "TARGET_LUFS", INJECTION), self.assertRaises(lib.SidecarError):
            mix.loudnorm(None)
        with mock.patch.object(core, "TARGET_TP", float("nan")), self.assertRaises(lib.SidecarError):
            mix.loudnorm(None)

    def test_narrate_refuses_a_planted_plan_with_a_crafted_audio_target(self):
        cut = self.exports / "x-keynote-cut.mp4"
        look = looks.defaults()
        look["audio"]["lufs"] = INJECTION
        self.write("x-keynote-cut.plan.json", good_plan(look=look))
        with self.assertRaises(narrate.NarrateError) as caught:
            narrate.use_template_audio(cut)
        self.assertIn("look.audio.lufs", str(caught.exception))
        self.assertEqual(core.TARGET_LUFS, -14)

    def test_narrate_uses_a_valid_template_target(self):
        look = looks.defaults()
        look["audio"]["lufs"] = -16
        self.write("x-keynote-cut.plan.json", good_plan(look=look))
        with contextlib.redirect_stdout(io.StringIO()):
            narrate.use_template_audio(self.exports / "x-keynote-cut.mp4")
        self.assertEqual(core.TARGET_LUFS, -16.0)


class Sidecars(Folder):
    def test_a_plan_the_build_writes_validates(self):
        self.assertEqual(lib.load_sidecar(self.write("p.plan.json", good_plan()), "plan")["total"], 20.0)

    def test_nan_and_infinity_are_not_numbers(self):
        # Python's json reads NaN and Infinity, and both slip past minimum/maximum comparisons.
        for raw in ('{"total": NaN, "runs": [], "cards": [], "callouts": [], "highlights": []}',
                    '{"total": Infinity, "runs": [], "cards": [], "callouts": [], "highlights": []}'):
            with self.subTest(raw=raw), self.assertRaises(lib.SidecarError):
                lib.load_sidecar(self.write("p.plan.json", None, raw), "plan")

    def test_plan_look_is_checked_against_the_template_look_schema(self):
        for change in ({"window": {"shadow": "0 0 1px url(https://x.example/a)"}}, {"zoom": {"scale": 9}},
                       {"transitions": {"window_in": "0.7"}}, {"unknown": {}}):
            look = looks.deep_merge(looks.defaults(), change) if "unknown" not in change else {**looks.defaults(), **change}
            with self.subTest(change=change), self.assertRaises(lib.SidecarError):
                lib.load_sidecar(self.write("p.plan.json", good_plan(look=look)), "plan")

    def test_lists_are_capped_so_a_checker_cannot_be_made_to_run_for_ever(self):
        run = {"start": 0.0, "end": 10.0, "zooms": [], "cuts": [1.0] * 201}
        with self.assertRaises(lib.SidecarError):
            lib.load_sidecar(self.write("p.plan.json", good_plan(runs=[run])), "plan")
        with self.assertRaises(lib.SidecarError):
            lib.load_sidecar(self.write("p.plan.json", good_plan(total=10 ** 9)), "plan")

    def test_timing_file_values_are_checked_before_narrate_uses_them(self):
        sequence = [{"card": "intro", "title": "Hi"}]
        for items, total in (([{"key": "card-intro", "start": "0", "duration": 2.0}], 2.0),
                             ([{"key": "card-intro", "start": -1.0, "duration": 2.0}], 2.0),
                             ([{"key": "card-intro", "start": 0.0, "duration": 2.0}], "2"),
                             ([{"key": "card-intro", "start": 0.0, "duration": 99.0}], 2.0),
                             ([{"key": "card-intro;x", "start": 0.0, "duration": 2.0}], 2.0)):
            path = self.write("t.timing.json", {"total": total, "outro": 0, "items": items})
            with self.subTest(items=items, total=total), self.assertRaises(narrate.NarrateError):
                narrate.load_timing(path, sequence)
        path = self.write("t.timing.json", None, '{"total": Infinity, "items": []}')
        with self.assertRaises(narrate.NarrateError):
            narrate.load_timing(path, [])

    def test_a_bad_outro_counts_as_none(self):
        path = self.write("t.timing.json", {"total": 5.0, "outro": "3; evil", "items": []})
        self.assertEqual(narrate.timing_outro(path), 0.0)
        path = self.write("t.timing.json", {"total": 5.0, "outro": 4.0, "items": []})
        self.assertEqual(narrate.timing_outro(path), 4.0)

    def test_check_cut_stops_on_a_bad_plan_or_voice_file(self):
        cut = self.exports / "x-keynote-cut.mp4"
        self.write("x-keynote-cut.plan.json", good_plan(total="20"))
        with self.assertRaises(SystemExit) as caught:
            check_cut.find_plan(cut, None)
        self.assertIn("sidecars.schema.json", str(caught.exception))
        self.write("x-keynote-cut.voice.json", {"lines": [{"start": 0, "end": "1e9"}]})
        with self.assertRaises(SystemExit):
            check_cut.find_voice(cut)

    def test_check_cut_bounds_every_time_by_the_cut(self):
        self.assertEqual(check_cut.plan_problems(good_plan()), [])
        late = good_plan(runs=[{"start": 2.0, "end": 9000.0, "zooms": [], "cuts": []}])
        self.assertTrue(check_cut.plan_problems(late))
        backwards = good_plan(runs=[{"start": 2.0, "end": 10.0, "cuts": [],
                                     "zooms": [{"start": 6.0, "landed": 4.0, "out": 5.0, "end": 7.0, "scale": 1.1}]}])
        self.assertTrue(check_cut.plan_problems(backwards))
        self.write("x-keynote-cut.plan.json", late)
        with self.assertRaises(SystemExit):
            check_cut.find_plan(self.exports / "x-keynote-cut.mp4", None)


class HighlightTake(Folder):
    def setUp(self) -> None:
        super().setUp()
        raw = self.demo / "recordings" / "raw"
        raw.mkdir()
        (raw / "02-a-t1.mp4").write_bytes(b"x")
        (self.outside / "secret.mp4").write_bytes(b"x")

    def test_a_take_inside_the_demo_folder_is_allowed(self):
        found = check_cut.highlight_take({"take": "../raw/02-a-t1.mp4"}, self.exports, self.demo)
        self.assertEqual(found, self.demo / "recordings" / "raw" / "02-a-t1.mp4")

    def test_absolute_escaping_and_symlinked_takes_are_refused(self):
        (self.demo / "recordings" / "raw" / "link.mp4").symlink_to(self.outside / "secret.mp4")
        for take in (str(self.outside / "secret.mp4"), "../../../outside/secret.mp4", "../raw/link.mp4"):
            with self.subTest(take=take), self.assertRaises(lib.UnsafePath):
                check_cut.highlight_take({"take": take}, self.exports, self.demo)

    def test_the_demo_folder_of_a_plan_is_two_levels_up_only_from_recordings_exports(self):
        self.assertEqual(check_cut.demo_folder(self.exports / "x.plan.json"), self.demo)
        self.assertEqual(check_cut.demo_folder(self.outside / "x.plan.json"), self.outside)

    def test_an_escaping_take_fails_h8_without_reading_it(self):
        report = check_cut.Report()
        row = {"start": 1.0, "end": 2.0, "rect": [0, 0, 10, 10], "where": "w", "scene": "02",
               "take": "../../../outside/secret.mp4", "take_size": [640, 360], "shot_start": 0.0,
               "shot_end": 4.0, "trim_in": 0.0, "speed": 1.0}
        with contextlib.redirect_stdout(io.StringIO()):
            check_cut.check_highlight_motion(report, {"highlights": [row]}, self.exports, self.demo)
        self.assertEqual(report.rows[0]["status"], "FAIL")
        self.assertIn("outside", report.rows[0]["text"])


# ---------------------------------------------------------------- L9: ffmpeg reads local files only

class ProtocolWhitelist(unittest.TestCase):
    def test_every_ffmpeg_input_and_every_ffprobe_call_gets_the_whitelist(self):
        cmd = lib.ffmpeg_cmd(["ffmpeg", "-y", "-i", "a.mp4", "-f", "lavfi", "-i", "color=c=red", "out.mp4"])
        self.assertEqual(cmd, ["ffmpeg", "-y", "-protocol_whitelist", "file,pipe", "-i", "a.mp4", "-f", "lavfi",
                               "-protocol_whitelist", "file,pipe", "-i", "color=c=red", "out.mp4"])
        self.assertEqual(lib.ffmpeg_cmd(cmd), cmd)  # idempotent
        self.assertEqual(lib.ffmpeg_cmd(["ffprobe", "-v", "error", Path("x.mp4")])[:3],
                         ["ffprobe", "-protocol_whitelist", "file,pipe"])
        self.assertEqual(lib.ffmpeg_cmd(["say", "-i", "x"]), ["say", "-i", "x"])

    def test_measure_and_motion_pass_the_whitelist(self):
        done = subprocess.CompletedProcess([], 0, stdout=b"", stderr=b"")
        with mock.patch.object(subprocess, "run", return_value=done) as run:
            with contextlib.suppress(Exception):
                measure.grab(Path("a.mp4"), 1.0)
            with contextlib.suppress(Exception):
                motion.patch_at(Path("a.mp4"), motion.Rect(0, 0, 10, 10), (640, 360), 1.0)
        for call in run.call_args_list:
            argv = call.args[0]
            self.assertEqual(argv[1:3], ["-protocol_whitelist", "file,pipe"], argv)

    def test_a_playlist_pointing_at_a_url_is_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            playlist = Path(tmp) / "take.m3u8"  # an HLS playlist whose segment is a URL
            playlist.write_text("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:9/x.ts\n#EXT-X-ENDLIST\n")
            with self.assertRaises(SystemExit) as caught:
                lib.duration(playlist)
            self.assertIn("not on whitelist", str(caught.exception))


# ---------------------------------------------------------------- L1, L2: schema patterns

class SchemaPatterns(unittest.TestCase):
    def test_a_trailing_newline_does_not_pass_an_anchored_pattern(self):
        template = {"id": "x-look", "name": "X", "look": {"brand": {"accent": "#FFFFFF\n"}}}
        self.assertTrue(lib.validate(template, "template"))
        template["look"]["brand"]["accent"] = "#FFFFFF"
        self.assertEqual(lib.validate(template, "template"), [])
        self.assertTrue(lib.validate({"title": "T", "template": "house\n", "sequence": [{"card": "a", "title": "x"}]},
                                     "demo"))

    def test_window_shadow_is_an_allow_list(self):
        def errors(shadow):
            return lib.validate({"id": "x-look", "name": "X", "look": {"window": {"shadow": shadow}}}, "template")

        for good in (looks.defaults()["window"]["shadow"], "none", "inset 0 2px 4px #00000022",
                     "0 0 0 1px rgb(0,0,0)", "0 1px 2px rgba(0, 0, 0, .2)"):
            self.assertEqual(errors(good), [], good)
        for bad in ("0 0 1px url(https://x.example/t)", "0 0 1px red", "0 0 1px var(--a)", "0 0 1px #fff\n",
                    "image(x)", "0 0 1px rgba(0,0,0,0.1) url(a)", "0 0 1px env(x)", "0 0 1px attr(x)"):
            self.assertTrue(errors(bad), bad)


# ---------------------------------------------------------------- M2: build inputs and outputs

class BuildConfinement(Folder):
    def setUp(self) -> None:
        super().setUp()
        self.raw = self.demo / "recordings" / "raw"
        self.raw.mkdir()

    def shot(self, raw_dir: Path):
        item = {"scene": "01", "stem": "01-a", "crop": [0, 0, 640, 328]}
        return _shot_from(item, 0, 0, raw_dir, lambda path: (4.0, (640, 360)), [])

    def test_a_real_take_in_the_demo_is_used(self):
        (self.raw / "01-a-t1.mp4").write_bytes(b"x")
        self.assertEqual(self.shot(self.raw).source, self.raw / "01-a-t1.mp4")

    def test_a_take_that_symlinks_out_of_the_demo_is_refused(self):
        (self.outside / "private.mp4").write_bytes(b"x")
        (self.raw / "01-a-t1.mp4").symlink_to(self.outside / "private.mp4")
        with self.assertRaisesRegex(PlanError, "outside the demo folder"):
            self.shot(self.raw)

    def test_a_symlinked_raw_folder_is_refused(self):
        elsewhere = self.outside / "raw"
        elsewhere.mkdir()
        (elsewhere / "01-a-t1.mp4").write_bytes(b"x")
        linked = self.demo / "recordings" / "linked-raw"
        linked.symlink_to(elsewhere, target_is_directory=True)
        with self.assertRaises(PlanError):
            confine_take(linked / "01-a-t1.mp4", linked, "sequence[0]")

    def test_build_refuses_linked_output_folders_before_making_any(self):
        def plant(what: str, demo: Path, outside: Path) -> None:
            rec = demo / "recordings"
            if what == "recordings":
                rec.symlink_to(outside, target_is_directory=True)
                return
            rec.mkdir()
            if what == "exports":
                (rec / "exports").symlink_to(outside, target_is_directory=True)
            elif what == "inside exports":
                (rec / "exports").mkdir()
                (rec / "exports" / ".keynote").symlink_to(outside, target_is_directory=True)
            else:
                (rec / "voice-cache").symlink_to(outside, target_is_directory=True)

        for what in ("recordings", "exports", "inside exports", "voice-cache"):
            with self.subTest(what=what), tempfile.TemporaryDirectory() as tmp:
                demo, outside = Path(tmp) / "demo", Path(tmp) / "outside"
                demo.mkdir()
                outside.mkdir()
                plant(what, demo, outside)
                with self.assertRaises(lib.UnsafePath):
                    build_keynote.refuse_linked_outputs(demo)
                self.assertEqual(list(outside.iterdir()), [], "nothing may be created through the link")

    def test_real_output_folders_pass(self):
        build_keynote.refuse_linked_outputs(self.demo)

    def test_the_end_card_say_render_refuses_a_linked_voice_cache(self):
        (self.demo / "recordings" / "voice-cache").symlink_to(self.outside, target_is_directory=True)
        cfg = {"sequence": [{"card": "end", "title": "Bye", "voiceover": "Bye now."}]}
        with mock.patch.object(voice_sync.shutil, "which", return_value="/usr/bin/say"), \
                mock.patch("narration.providers.render_say") as render, self.assertRaises(lib.UnsafePath):
            voice_sync.measure_line(self.demo, cfg, "Bye now.", 1)
        render.assert_not_called()
        self.assertEqual(list(self.outside.iterdir()), [])


# ---------------------------------------------------------------- L3, L4: template folders

class TemplateFolders(Folder):
    def test_template_validate_refuses_a_symlink_anywhere_in_the_template(self):
        folder = self.demo / "_templates" / "linked-look"
        folder.mkdir(parents=True)
        (folder / "template.json").write_text(json.dumps({"id": "linked-look", "name": "L", "look": {}}))
        (folder / "preview").mkdir()
        (folder / "preview" / "01.png").symlink_to(self.outside / "target.png")
        result = subprocess.run([sys.executable, "-I", str(SCRIPTS / "template-validate.py"), "linked-look",
                                 "--templates", str(self.demo / "_templates"), "--work", str(self.outside / "w")],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symlink", result.stderr)
        self.assertFalse((self.outside / "w").exists(), "no work should start")

    def test_previews_replace_a_planted_symlink_instead_of_writing_through_it(self):
        folder = self.demo / "tpl"
        (folder / "preview").mkdir(parents=True)
        victim = self.outside / "victim.txt"
        victim.write_text("keep me")
        (folder / "preview" / "01.png").symlink_to(victim)
        frame = self.outside / "frame.png"
        frame.write_bytes(b"\x89PNG new")
        validator.save_previews(folder, [frame])
        self.assertEqual(victim.read_text(), "keep me")
        self.assertFalse((folder / "preview" / "01.png").is_symlink())
        self.assertEqual((folder / "preview" / "01.png").read_bytes(), b"\x89PNG new")

    def test_copier_force_refuses_a_target_with_symlinks_in_it(self):
        folder = self.demo / "_templates" / "look-abcdef"
        folder.mkdir(parents=True)
        (folder / "template.json").symlink_to(self.outside / "anything.json")
        with self.assertRaises(SystemExit) as caught:
            copier.prepare_target(folder, force=True)
        self.assertIn("symlink", str(caught.exception))
        with self.assertRaises(SystemExit):
            copier.prepare_target(self.outside, force=False)  # exists, no --force
        copier.prepare_target(self.demo / "_templates" / "new-look-000000", force=False)

    def test_copier_anonymous_keeps_the_file_name_out_of_the_template(self):
        video = Path("/Videos/Acme Corp launch (internal).mp4")
        self.assertEqual(copier.reference_label(video, True), "reference video")
        self.assertEqual(copier.reference_label(video, False), video.name)
        tid = copier.template_id(copier.reference_label(video, True), "abcdef0123")
        self.assertEqual(tid, "reference-video-abcdef")


# ---------------------------------------------------------------- L10: paid voice needs opt-in

class PaidVoiceOptIn(unittest.TestCase):
    def choose(self, argv, provider=None, env=None):
        voice = narrate.Voice.from_config({"provider": provider} if provider else {})
        args = narrate.parse_args(["demo.json", *argv])
        environ = {"ELEVENLABS_API_KEY": "k" * 32, **(env or {})}
        out = io.StringIO()
        with mock.patch.dict(os.environ, environ, clear=False), contextlib.redirect_stdout(out), \
                mock.patch.object(narrate.shutil, "which", return_value="/usr/bin/say"):
            os.environ.pop("DEMO_STUDIO_ALLOW_CONFIG_VOICE", None) if not env else None
            return narrate.choose_provider(args, voice, Path("/nowhere")), out.getvalue()

    def test_demo_json_alone_cannot_pick_elevenlabs(self):
        (provider, key), message = self.choose([], provider="elevenlabs")
        self.assertEqual((provider, key), ("say", ""))
        self.assertIn("--voice elevenlabs", message)

    def test_a_key_in_the_environment_alone_does_not_pick_elevenlabs(self):
        (provider, key), message = self.choose([])
        self.assertEqual((provider, key), ("say", ""))
        self.assertIn("only used when you ask", message)

    def test_the_user_can_opt_in_on_the_command_line_or_with_the_env(self):
        self.assertEqual(self.choose(["--voice", "elevenlabs"], provider="say")[0][0], "elevenlabs")
        self.assertEqual(self.choose([], provider="elevenlabs",
                                     env={"DEMO_STUDIO_ALLOW_CONFIG_VOICE": "1"})[0][0], "elevenlabs")


if __name__ == "__main__":
    unittest.main(verbosity=1)
