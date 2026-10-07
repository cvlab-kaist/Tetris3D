# Browser fixtures

`header-test.mp4` is a synthetic two-second H.264 test pattern, used only through browser request interception. It is not a project video or a public asset.

Regenerate it with:

```sh
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=12 -t 2 -c:v libx264 -pix_fmt yuv420p -movflags +faststart header-test.mp4
```
