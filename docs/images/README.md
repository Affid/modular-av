# Images

The screenshots here come from `scripts/docs/screenshots.ts`: four users
of the local Foundry world (LOCAL-SETUP.md) in a P2P call, each in a
browser whose camera is a video file.

```bash
pnpm build && pnpm foundry:link
node scripts/docs/screenshots.ts <directory with gm.y4m, p1.y4m, p2.y4m, p3.y4m> [map image]
```

The wiki shows copies of them, in its own `images/` folder.

The two `theming-*` pictures are screenshots with outlines and numbers
drawn over the elements the page really has; the key to the numbers is
in `docs/dock-theming.md`.

## The people in them

The camera pictures are stock clips from [Mixkit](https://mixkit.co),
under the Mixkit Stock Video Free License. The clips themselves aren't
in this repository; only screenshots that show them are.

| File     | Clip                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `gm.y4m` | [Therapist in his office talking to the camera](https://mixkit.co/free-stock-video/therapist-in-his-office-talking-to-the-camera-4834/) |
| `p1.y4m` | [Guy facing in the middle of a video call](https://mixkit.co/free-stock-video/guy-facing-in-the-middle-of-a-video-call-on-10457/)       |
| `p2.y4m` | [Young cheerful man talking on a video call](https://mixkit.co/free-stock-video/young-cheerful-man-talking-on-a-video-call-10448/)      |
| `p3.y4m` | [Woman laughing out loud during a video call](https://mixkit.co/free-stock-video/woman-laughing-out-loud-during-a-video-call-10449/)    |

## The map

The map behind the scattered cameras is
[Cavern Battlemap](https://opengameart.org/content/cavern-battlemap) by
Ferrin, from OpenGameArt, under
[CC0](https://creativecommons.org/publicdomain/zero/1.0/). The script
puts it in a scene of its own and deletes the scene afterwards.

## Camera files

To make a camera file from a clip (Chrome wants Y4M and plays it in a
loop):

```bash
ffmpeg -t 6 -i clip.mp4 -vf "fps=15,scale=640:360" -pix_fmt yuv420p p1.y4m
```
