"""Behaviour of scripts/video-gate.py, the plan-free gate for any finished mp4.
Run: python3 -I tests/test_video_gate.py. Fixtures are tiny ffmpeg lavfi clips built in a temp dir."""

import json
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GATE = REPO / "scripts" / "video-gate.py"
RATE = 12


def segment(kind: str, seconds: float, size: str, index: int) -> tuple[str, str]:
    """(lavfi source, filter label) for one piece of a fixture."""
    if kind == "move":
        src = f"testsrc2=s={size}:r={RATE}:d={seconds}"
    elif kind == "freeze":  # a busy picture held still: one testsrc2 frame, repeated
        src = (f"testsrc2=s={size}:r={RATE}:d=1,trim=end_frame=1,loop=loop=-1:size=1,"
               f"trim=duration={seconds},setpts=N/{RATE}/TB")
    else:  # flat colour, e.g. "flat-black"
        src = f"color=c={kind.split('-')[1]}:s={size}:r={RATE}:d={seconds}"
    return src, f"[v{index}]"


def make_video(path: Path, pieces: list[tuple[str, float]], size: str = "320x180", audio: bool = True) -> Path:
    graph, labels = [], ""
    for i, (kind, seconds) in enumerate(pieces):
        src, label = segment(kind, seconds, size, i)
        graph.append(f"{src},format=yuv420p{label}")
        labels += label
    graph.append(f"{labels}concat=n={len(pieces)}:v=1:a=0[v]")
    total = sum(seconds for _, seconds in pieces)
    cmd = ["ffmpeg", "-v", "error", "-y", "-filter_complex", ";".join(graph)]
    if audio:
        cmd += ["-f", "lavfi", "-t", str(total), "-i", "sine=frequency=440:sample_rate=48000"]
    # the sine audio is the only -i, so it is input 0
    cmd += ["-map", "[v]"] + (["-map", "0:a", "-c:a", "aac"] if audio else [])
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)]
    subprocess.run(cmd, check=True)
    return path


def gate(video: Path, *extra: str) -> subprocess.CompletedProcess:
    return subprocess.run(["python3", "-I", str(GATE), str(video), *extra], capture_output=True, text=True)


def status(result: subprocess.CompletedProcess, item: str) -> str:
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) > 1 and parts[1] == item:
            return parts[0]
    raise AssertionError(f"no {item} line in:\n{result.stdout}\n{result.stderr}")


class VideoGate(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def video(self, pieces, **kw) -> Path:
        return make_video(self.root / "clip.mp4", pieces, **kw)

    def test_moving_video_passes_every_failing_check(self):
        result = gate(self.video([("move", 4)]))
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(status(result, "G1"), "PASS")
        self.assertEqual(status(result, "G4"), "PASS")

    def test_a_second_and_a_half_of_black_mid_video_fails(self):
        result = gate(self.video([("move", 2), ("flat-black", 1.5), ("move", 2)]))
        self.assertEqual(status(result, "G1"), "FAIL")
        self.assertEqual(result.returncode, 1)

    def test_a_second_and_a_half_of_white_mid_video_fails(self):
        result = gate(self.video([("move", 2), ("flat-white", 1.5), ("move", 2)]))
        self.assertEqual(status(result, "G1"), "FAIL")

    def test_any_flat_colour_mid_video_fails(self):
        result = gate(self.video([("move", 2), ("flat-0x3366aa", 1.5), ("move", 2)]))
        self.assertEqual(status(result, "G1"), "FAIL")

    def test_flat_colour_in_the_first_half_second_does_not_fail(self):
        result = gate(self.video([("flat-black", 0.4), ("move", 3)]))
        self.assertEqual(status(result, "G1"), "PASS")

    def test_flat_colour_in_the_last_half_second_does_not_fail(self):
        result = gate(self.video([("move", 3), ("flat-black", 0.4)]))
        self.assertEqual(status(result, "G1"), "PASS")

    def test_the_short_flat_beat_between_the_sweep_and_the_outro_passes(self):
        # The house look holds about 0.33 s of flat dark after the brand sweep, before the outro words.
        result = gate(self.video([("move", 2), ("flat-black", 0.4), ("move", 2)]))
        self.assertEqual(status(result, "G1"), "PASS")

    def test_seven_tenths_of_flat_colour_is_a_look_and_exits_zero(self):
        result = gate(self.video([("move", 2), ("flat-black", 0.75), ("move", 2)]))
        self.assertEqual(status(result, "G1"), "LOOK")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_a_flat_flash_of_two_tenths_does_not_fail(self):
        result = gate(self.video([("move", 2), ("flat-white", 0.2), ("move", 2)]))
        self.assertEqual(status(result, "G1"), "PASS")

    def test_eight_second_freeze_is_a_look_and_exits_zero(self):
        result = gate(self.video([("move", 2), ("freeze", 8), ("move", 2)]))
        self.assertEqual(status(result, "G2"), "LOOK")
        self.assertIn("2.0", result.stdout)  # the timestamp range names where the freeze starts
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_moving_video_has_no_freeze_look(self):
        result = gate(self.video([("move", 4)]))
        self.assertEqual(status(result, "G2"), "PASS")
        self.assertEqual(status(result, "G3"), "PASS")

    def test_long_quiet_stretch_is_a_look_on_g3_and_never_a_fail(self):
        result = gate(self.video([("move", 1), ("freeze", 16), ("move", 1)], size="160x90"))
        self.assertEqual(status(result, "G3"), "LOOK")
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_portrait_9x16_input_works(self):
        result = gate(self.video([("move", 2), ("flat-black", 1.5), ("move", 2)], size="180x320"))
        self.assertEqual(status(result, "G1"), "FAIL")
        self.assertEqual(status(result, "G4"), "PASS")

    def test_square_and_four_by_five_inputs_work(self):
        for size in ("200x200", "160x200"):
            result = gate(self.video([("move", 3)], size=size))
            self.assertEqual(result.returncode, 0, f"{size}: {result.stdout}{result.stderr}")

    def test_missing_file_exits_with_a_video_gate_message(self):
        result = gate(self.root / "nope.mp4")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("video-gate:", result.stderr)

    def test_a_file_that_is_not_a_video_exits_with_a_video_gate_message(self):
        bad = self.root / "bad.mp4"
        bad.write_bytes(b"not a video")
        result = gate(bad)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("video-gate:", result.stderr)

    def test_no_audio_stream_is_a_look_not_a_fail(self):
        result = gate(self.video([("move", 3)], audio=False))
        self.assertEqual(status(result, "G4a"), "LOOK")
        self.assertEqual(result.returncode, 0)

    def test_audio_stream_passes_the_audio_item(self):
        result = gate(self.video([("move", 3)]))
        self.assertEqual(status(result, "G4a"), "PASS")

    def test_json_output_lists_one_row_per_item(self):
        out = self.root / "gate.json"
        gate(self.video([("move", 3)]), "--json", str(out))
        rows = json.loads(out.read_text())
        self.assertEqual([r["item"] for r in rows], ["G1", "G2", "G3", "G4", "G4a"])
        self.assertEqual(set(rows[0]), {"status", "item", "text"})


if __name__ == "__main__":
    unittest.main()
