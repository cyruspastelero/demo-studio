#!/usr/bin/env bash
# Turns a folder of captured frames into an edit-ready clip and logs it.
# Run from the recordings dir.
# Usage: encode-take.sh <frames-dir> <NN-scene-name> "<notes>"
# Output: raw/<NN-scene-name>-t<take>.mp4 (next free take number), 1920x1080,
# constant 30fps CRF 14, plus a row in takes.csv. Frames move to frames/<scene>-t<take>.
# Env: CSS_WIDTH (recorded viewport width in CSS px, default 1440)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

frames_dir="${1:?frames dir}"; scene="${2:?scene name}"; notes="${3:-}"
[ -s "${frames_dir}/ts.txt" ] || { echo "encode-take: ${frames_dir}/ts.txt missing or empty" >&2; exit 1; }
mkdir -p raw
[ -f takes.csv ] || echo "file,scene,take,duration_s,resolution,fps,recorded_at,status,notes" > takes.csv

take=1
while [ -e "raw/${scene}-t${take}.mp4" ]; do take=$((take + 1)); done
out="raw/${scene}-t${take}.mp4"
trap '[ -s "$out" ] || command rm -f "$out"' EXIT   # no empty take left behind on failure

fc="$(python3 "$here/blur-filter.py" "$frames_dir" "${CSS_WIDTH:-1440}")"

# Hold each frame until the next one arrived, so pauses keep real timing.
# Chrome can deliver screencast frames slightly out of order, so sort by time.
list="${frames_dir}/concat.txt"
abs_dir="$(cd "$frames_dir" && pwd)"
case "$abs_dir" in *$'\n'*|*$'\r'*) echo "encode-take: frames folder path has a line break: $abs_dir" >&2; exit 1 ;; esac
# ffmpeg concat quoting: inside '...', a ' is written as '\''. Passed through ENVIRON, which awk
# does not unescape (awk -v would).
concat_dir="${abs_dir//\'/\'\\\'\'}"
end_ts="$(cat "${frames_dir}/end.txt" 2>/dev/null || echo 0)"
awk '{ printf "%s %d\n", $1, NR - 1 }' "${frames_dir}/ts.txt" | sort -n -k1,1 |
  CONCAT_DIR="$concat_dir" awk -v end="$end_ts" '
    BEGIN { d = ENVIRON["CONCAT_DIR"] }
    { t[NR] = $1; f[NR] = $2 }
    END {
      for (i = 1; i <= NR; i++) {
        printf "file '\''%s/f%05d.jpg'\''\n", d, f[i]
        last = (end > t[NR]) ? end - t[NR] : 0.5
        printf "duration %.4f\n", (i < NR) ? t[i + 1] - t[i] : last
      }
      printf "file '\''%s/f%05d.jpg'\''\n", d, f[NR]
    }' > "$list"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$list" -filter_complex "$fc" -map "[out]" \
  -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -r 30 -movflags +faststart "$out"

kept="frames/${scene}-t${take}"
mv "$frames_dir" "$kept"

read -r w h dur < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height:format=duration -of default=nw=1:nk=1 "$out" | tr '\n' ' '; echo)
printf '%s,%s,%s,%.1f,%sx%s,vfr->30,%s,new,"%s"\n' \
  "$out" "$scene" "$take" "$dur" "$w" "$h" "$(date -u +%Y-%m-%dT%H:%M)" "${notes//\"/\'}" >> takes.csv

echo "$out (${dur}s, ${w}x${h}); frames kept in $kept"
