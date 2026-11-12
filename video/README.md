# Jadaliaat article videos

One folder per article (e.g. `embryo/`). Everything is rendered locally; nothing here is published to the website (`.vercelignore`) or to GitHub (large files are in `.gitignore`).

## Files in an article folder

| File | What it is |
|---|---|
| `script.json` | The narration, one entry per line. Quran verses are shown on screen, never recited. |
| `beats.js` | The cards: what appears on screen for each line, and on which spoken word. |
| `img/` + `img/credits.json` | Public-domain / Creative-Commons images and their licences. |
| `meta.json` | Title, summary, sources for the upload description. |
| `vo.wav`, `timings.json` | Generated narration and the start/end time of every line. |
| `*_youtube_16x9.mp4`, `*_vertical_9x16.mp4` | Final videos. |
| `description.txt`, `subtitles.ar.srt` | Ready-to-paste description (with YouTube chapters) and Arabic subtitles. |

## Making a video

```powershell
cd video
$env:TEMPO = "1.08"; npm run voiceover -- embryo     # ElevenLabs narration (uses credits)
node --env-file=.env.local credits.mjs               # check remaining ElevenLabs credits
node render.mjs embryo --w 1080 --h 1920 --stills 12,40,90   # preview stills
node render.mjs embryo --w 1080 --h 1920 --scale 0.4 --out draft.mp4   # fast draft
node render.mjs embryo --w 1920 --h 1080 --out embryo_youtube_16x9.mp4
node render.mjs embryo --w 1080 --h 1920 --out embryo_vertical_9x16.mp4
node make-meta.mjs embryo                            # description + subtitles
```

Images: `node commons.mjs search "query"` then `node commons.mjs get embryo/img "File:Name.jpg=key"`.

The ElevenLabs key lives in `.env.local` (never committed). The free plan requires crediting ElevenLabs; the description already does.
