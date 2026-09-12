# Generated screen test media

`poster.svg` is a locally authored two-colour image with a white central disc and LED text.

`color-cycle.mp4` is a synthetic four-second FFmpeg test pattern, generated with:

```text
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=20 -t 4 -c:v libx264 -pix_fmt yuv420p -movflags +faststart color-cycle.mp4
```

These files contain no third-party music, footage or artwork. They make browser import/decoding tests reproducible without requiring FFmpeg at test runtime.
