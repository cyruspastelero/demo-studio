#!/bin/bash
# side-by-side.sh: reference frame (left) next to our render (right), one row per pair. Keep the output out of the repo (third-party frames).
# side-by-side.sh <ref.mp4> <storyboard> <style> <out.jpg> "refT:ourT refT:ourT ..."
set -e
REF=$1; SB=$2; ST=$3; OUT=$4; PAIRS=$5
M=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p $M/work; TMP=$(mktemp -d $M/work/sbs.XXXX)
OURS=""; for p in $PAIRS; do OURS="$OURS,${p#*:}"; done; OURS=${OURS#,}
(cd $M && node render-motion.mjs $SB --style $ST --size 16x9 --stills $OURS --stills-dir $TMP/ours --prefix o >/dev/null)
i=0; ROWS=""
for p in $PAIRS; do
  r=${p%%:*}; o=${p#*:}
  ffmpeg -v error -y -ss $r -i $REF -frames:v 1 -vf scale=800:450 $TMP/r$i.png
  of=$(ls $TMP/ours/ | grep -- "-$(printf %.2f $o).png")
  ffmpeg -v error -y -i $TMP/r$i.png -i $TMP/ours/$of -filter_complex "[1]scale=800:450[b];[0][b]hstack=2,pad=iw:ih+6:0:0:red" $TMP/row$i.png
  ROWS="$ROWS -i $TMP/row$i.png"; i=$((i+1))
done
ffmpeg -v error -y $ROWS -filter_complex "vstack=$i" -q:v 3 $OUT
/bin/rm -rf $TMP
echo $OUT
