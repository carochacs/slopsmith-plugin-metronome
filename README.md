# Slopsmith Plugin: Metronome

A plugin for [Slopsmith](https://github.com/carochacs/slopsmith) that adds an audible metronome click and visual beat flash to the highway player, synced to the song's tempo.

## Features

- **Audible click** — plays a sine tone on every beat, with a higher pitch on downbeats (measure starts)
- **Visual flash** — subtle amber glow on the highway canvas on each beat (brighter on downbeats)
- **Tempo-synced** — follows the song's actual beat map, including tempo changes
- **Subdivisions** — optional eighth-note or triplet subdivision clicks between beats
- **Count-in** — optional 4-3-2-1 visual countdown before the song's first beat, toggleable via checkbox (off by default)
- **Volume control** — slider to adjust click volume (0–100%)
- **Toggle button** — click "Metronome" in the player controls to enable/disable; reveals controls when active
- **Flash toggle** — checkbox to enable/disable the visual flash independently
- **Zero setup** — no configuration needed, works with any song

## Installation

**Docker (web version)**
```bash
cd /path/to/slopsmith/plugins
git clone https://github.com/carochacs/slopsmith-plugin-metronome.git metronome
docker compose restart
```

**Desktop app** — clone into the platform plugins directory:

| Platform | Plugins directory |
|----------|-------------------|
| Windows  | `%APPDATA%\slopsmith-desktop\plugins\` |
| macOS    | `~/Library/Application Support/slopsmith-desktop/plugins/` |
| Linux    | `~/.config/slopsmith-desktop/plugins/` |

Then restart the app.

A "Metronome" button will appear in the player controls bar when you play a song. Click it to enable; volume, flash, and subdivision controls appear inline.

## How It Works

Rocksmith arrangements include precise beat timing data with measure markers. The plugin reads this beat data from the highway renderer and triggers a click sound and visual flash at each beat position. Downbeats (first beat of each measure) get a higher-pitched click (1500 Hz) and a brighter flash; regular beats use a mid-pitch click (1000 Hz); subdivision ticks use a quieter, lower-pitched click (660 Hz).

Subdivision times are interpolated between consecutive beat timestamps, so they track any playback-speed changes applied by the host automatically.

## License

[MIT](LICENSE.txt)
