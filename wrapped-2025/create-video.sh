#!/bin/bash

# NERVBOX WRAPPED 2025 - Video Generator
# Creates a high-quality slideshow video with crossfade transitions

OUTPUT_DIR="/home/joerg/projects/nervbox/nervbox/wrapped-2025/output"
AUDIO_FILE="/home/joerg/projects/nervbox/sounds/CABD2021.mp3"
VIDEO_FILE="$OUTPUT_DIR/nervbox-wrapped-2025.mp4"

SLIDE_DURATION=10     # Seconds per slide
FADE_DURATION=1       # Crossfade duration (integer for simplicity)
FPS=30

# Slide files in order
SLIDES=(
  "01-intro.png"
  "02-stats.png"
  "03-sound-of-the-year.png"
  "04-charts.png"
  "05-peak-times.png"
  "06-sound-koenige.png"
  "07-speed-demon.png"
  "08-nachteulen.png"
  "09-high-roller.png"
  "10-wall-of-shame.png"
  "11-achievement-hunters.png"
  "12-content-creators.png"
  "13-grosszuegigkeit.png"
  "14-first-blood.png"
  "15-the-awards.png"
  "16-timeline.png"
  "17-fun-facts.png"
  "18-danke.png"
)

NUM_SLIDES=${#SLIDES[@]}
echo "╔════════════════════════════════════════╗"
echo "║   NERVBOX WRAPPED 2025 Video Creator   ║"
echo "╚════════════════════════════════════════╝"
echo ""
echo "📊 Configuration:"
echo "   Slides: $NUM_SLIDES"
echo "   Duration per slide: ${SLIDE_DURATION}s"
echo "   Fade duration: ${FADE_DURATION}s"
echo ""

# Calculate total duration: (NUM_SLIDES * SLIDE_DURATION) - ((NUM_SLIDES - 1) * FADE_DURATION)
TOTAL_DURATION=$((NUM_SLIDES * SLIDE_DURATION - (NUM_SLIDES - 1) * FADE_DURATION))
FADE_OUT_START=$((TOTAL_DURATION - 3))

echo "   Total video duration: ${TOTAL_DURATION}s"
echo ""

# Build ffmpeg command
echo "🎬 Building video with crossfade transitions..."

# Build input arguments
INPUTS=""
for slide in "${SLIDES[@]}"; do
  INPUTS="$INPUTS -loop 1 -t $SLIDE_DURATION -i $OUTPUT_DIR/$slide"
done

# Build complex filter for xfade transitions
# Each transition starts at: i * (SLIDE_DURATION - FADE_DURATION)
FILTER=""
PREV="[0:v]"

for ((i=1; i<NUM_SLIDES; i++)); do
  # Offset = i * SLIDE_DURATION - i * FADE_DURATION = i * (SLIDE_DURATION - FADE_DURATION)
  OFFSET=$((i * (SLIDE_DURATION - FADE_DURATION)))

  if [ $i -lt $((NUM_SLIDES - 1)) ]; then
    OUT="[v$i]"
  else
    OUT="[vout]"
  fi

  FILTER="${FILTER}${PREV}[$i:v]xfade=transition=fade:duration=$FADE_DURATION:offset=$OFFSET$OUT;"
  PREV="$OUT"
done

# Remove trailing semicolon
FILTER="${FILTER%;}"

echo "🔊 Adding audio track with fade out at ${FADE_OUT_START}s..."

# Run ffmpeg
ffmpeg -y \
  $INPUTS \
  -i "$AUDIO_FILE" \
  -filter_complex "$FILTER;[${NUM_SLIDES}:a]afade=t=out:st=$FADE_OUT_START:d=3[aout]" \
  -map "[vout]" \
  -map "[aout]" \
  -c:v libx264 \
  -preset slow \
  -crf 18 \
  -pix_fmt yuv420p \
  -r $FPS \
  -c:a aac \
  -b:a 192k \
  -t "$TOTAL_DURATION" \
  -movflags +faststart \
  "$VIDEO_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo "════════════════════════════════════════"
  echo "✨ Video created successfully!"
  echo "📁 Output: $VIDEO_FILE"

  # Show file size
  SIZE=$(du -h "$VIDEO_FILE" | cut -f1)
  DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null | cut -d. -f1)
  echo "📦 Size: $SIZE"
  echo "⏱️  Duration: ${DURATION}s"
  echo "════════════════════════════════════════"
else
  echo ""
  echo "❌ Error creating video"
  exit 1
fi
