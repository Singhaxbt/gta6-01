[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Singhaxbt/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Singhaxbt/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR SUNSET

An original open-world crime game in the sun-soaked coastal city of Solmar,
built with three.js for the make.fun **gta6-01** bounty ("Make GTA 6").

Dario "Dare" Fontana runs packages for Marisol Vega. Explore the city on foot
or behind the wheel, steal cars (the red Cometa GT is worth the heat), dodge
the Solmar PD's wanted system, and finish all three story missions —
**First Run** ($300), **Hot Property** ($600) and **Heat Run** ($1,200).

## What's in the game

- A seeded, deterministic city: road grid, ~120 procedural buildings, Solmar
  Tower, a hospital, a plaza fountain, a beach, a pier with marina boats,
  palms, streetlights and road signs
- On-foot movement and arcade driving (accelerate, steer, handbrake, damage
  with smoke, building collisions)
- Car stealing — 15 parked cars, including the Cometa GT sports car
- Traffic (10 cars on loop routes with gap-keeping) and 24 pedestrians who
  wander and flee from gunfire
- Wanted system, 1–5 stars: police cars spawn to match the stars, chase and
  ram; busted or wasted means a $200 hospital bill
- Three story missions with timers, gold objective markers and payouts
- Pistol combat with raycast shooting, tracers and muzzle flash
- HUD with circular minimap, wanted stars, money, health, objective + timer,
  speed and toasts; start / pause / wasted / busted menus
- Save in localStorage (money, missions done, best result)
- Synthesised WebAudio sound only — engine hum, siren, gunshots, fanfare

## Run it

Serve `game/` with any static file server and open `index.html` in a desktop
browser. No build step, no network requests — everything loads from local
files.

```sh
npx serve game
# or
python3 -m http.server --directory game 8000
```

Then open http://localhost:8000 (or the port shown) and press
**START THE ENGINE**.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Run |
| E | Steal / exit car |
| Mouse click / F | Shoot |
| Space | Handbrake |
| M | Start the next mission |
| N | Mute |
| Esc | Pause |

## Hand-in

`main.ts` (Node 22) copies `game/` and `screenshots/` to `/output` (or
`$MAKEFUN_OUTPUT_DIR`) and writes `/output/dossier.json` with the kit's
`buildDossier` from `vendor/makefun-game.ts`.

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE). three.js (vendored under `game/vendor/`) is
MIT-licensed by the three.js authors; its license text is in
`game/vendor/LICENSE`.
