"""Behaviour of starter/check.py, the workspace drift report. Run: python3 -I tests/test_check.py"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def load_check():
    spec = importlib.util.spec_from_file_location("check", REPO / "starter" / "check.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


check = load_check()

INDEX = """# Demos

| Demo | What it shows | Status | Final cut |
| --- | --- | --- | --- |
| [acme](acme/README.md) | Invoice bot | {status} | {final} |
"""


def make_workspace(root: Path, status="Delivered (2026-01-02): done", final="`acme/final/acme.mp4`"):
    (root / "README.md").write_text(INDEX.format(status=status, final=final))
    demo = root / "acme"
    (demo / "final").mkdir(parents=True)
    (demo / "final" / "acme.mp4").write_bytes(b"x")
    (demo / "README.md").write_text("# acme\n\n## Status\n\n- done\n")
    return demo


class WorkspaceCheck(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def issues(self):
        return check.check_workspace(self.root)

    def test_clean_workspace_reports_nothing(self):
        make_workspace(self.root)
        self.assertEqual(self.issues(), {"acme": []})

    def test_demo_missing_from_index_is_reported(self):
        make_workspace(self.root)
        other = self.root / "other"
        other.mkdir()
        (other / "README.md").write_text("# other\n\n## Status\n")
        self.assertIn("missing from the README index", self.issues()["other"])

    def test_index_row_without_folder_is_reported(self):
        make_workspace(self.root)
        (self.root / "README.md").write_text(
            INDEX.format(status="Planning (2026-01-01)", final="none yet")
            + "| [ghost](ghost/README.md) | x | Planning (2026-01-01) | none yet |\n"
        )
        self.assertIn("index row has no folder", self.issues()["ghost"])

    def test_final_cut_path_that_does_not_exist_is_reported(self):
        make_workspace(self.root, final="`acme/final/missing.mp4`")
        self.assertTrue(any("final cut does not exist" in i for i in self.issues()["acme"]))

    def test_status_outside_the_vocabulary_is_reported(self):
        make_workspace(self.root, status="Almost done")
        self.assertTrue(any("status is not one of" in i for i in self.issues()["acme"]))

    def test_unreviewed_take_is_reported(self):
        demo = make_workspace(self.root)
        (demo / "recordings").mkdir()
        (demo / "recordings" / "takes.csv").write_text("file,scene,status\na.mp4,01,keep\nb.mp4,02,new\n")
        self.assertTrue(any("1 take(s)" in i for i in self.issues()["acme"]))

    def test_open_throwaway_is_reported_and_closed_ones_are_not(self):
        demo = make_workspace(self.root)
        (demo / "THROWAWAYS.md").write_text(
            "| What | Where | Delete? |\n| --- | --- | --- |\n"
            "| key | app | deleted 2026-01-03 |\n| repo | github | kept: public example |\n| bot | chat | no |\n"
        )
        self.assertTrue(any("1 open throwaway" in i for i in self.issues()["acme"]))

    def test_a_throwaways_table_with_any_header_wording_and_no_rows_is_clean(self):
        demo = make_workspace(self.root)
        (demo / "THROWAWAYS.md").write_text(
            "# Throwaways\n\n| Item | Where | Id | Created | Status |\n| --- | --- | --- | --- | --- |\n"
        )
        self.assertEqual(self.issues()["acme"], [])

    def test_leftover_frames_are_reported(self):
        demo = make_workspace(self.root)
        frames = demo / "recordings" / "frames"
        (frames / "01-scene-t1").mkdir(parents=True)
        self.assertTrue(any("recordings/frames still present" in i for i in self.issues()["acme"]))

    def test_empty_frames_folder_of_a_new_demo_is_fine(self):
        demo = make_workspace(self.root)
        (demo / "recordings" / "frames").mkdir(parents=True)
        self.assertEqual(self.issues()["acme"], [])

    def test_env_file_outside_app_is_reported(self):
        demo = make_workspace(self.root)
        (demo / "tools").mkdir()
        (demo / "tools" / ".env").write_text("TOKEN=x")
        (demo / "app").mkdir()
        (demo / "app" / ".env").write_text("TOKEN=x")
        found = [i for i in self.issues()["acme"] if "secrets file outside app/" in i]
        self.assertEqual(len(found), 1)
        self.assertIn("tools/.env", found[0])

    def test_handoff_folder_kept_next_to_its_zip_is_reported(self):
        demo = make_workspace(self.root)
        rec = demo / "recordings"
        (rec / "editor-handoff").mkdir(parents=True)
        with (rec / "editor-handoff" / "clip.mp4").open("wb") as handle:
            handle.truncate(60_000_000)  # sparse: takes no real disk
        (rec / "acme-editor-handoff.zip").write_bytes(b"x")
        self.assertTrue(any("editor-handoff folder and its zip" in i for i in self.issues()["acme"]))


if __name__ == "__main__":
    unittest.main()
