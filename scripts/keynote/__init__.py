"""The keynote engine behind build-keynote.py. Every number comes from docs/quality-bar.md.

Modules: spec (the numbers), easing (curves), model (demo.json -> a frozen plan), window (the
product window per frame), overlay (titles, pills, highlight boxes, end card per frame), render
(Chrome renders the overlay frames), compose (ffmpeg composites and encodes), voice_sync (end-card
words timed to the narration).
"""
