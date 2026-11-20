[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Singhaxbt/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Singhaxbt/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMAR SUNSET

An original open-world crime game in the sun-soaked coastal city of Solmar,
built with three.js for the make.fun **gta6-01** bounty ("Make GTA 6").

Dario "Dare" Fontana runs packages for Marisol Vega. Explore five districts —
downtown, beach and boardwalk, harbor, old town, and the hills — on foot or
behind the wheel, steal cars, dodge the Solmar PD's wanted system, and finish
all five story missions — **First Delivery** ($300), **The Getaway** ($600),
**Harbor Heist** ($900), **Rescue Run** ($1,200) and **Sunset Showdown**
($2,000).

## What's in the game

- A seeded, deterministic city: five distinct districts, a day/night cycle
  with a long golden sunset, ~120 procedural buildings, Solmar Tower, a
  hospital, a plaza fountain, a beach, a pier with marina boats, palms,
  streetlights and road signs
- On-foot movement and arcade driving with distinct handling per vehicle
- Five vehicle types — sedan, sports car, taxi, pickup truck, motorcycle —
  each with its own speed, handling, and sound
- Car stealing — parked and driven cars, including the red Velocita GT
- Traffic and 46 pedestrians who wander, cross streets, and flee from gunfire
- Wanted system, 1–5 stars: police cars chase and ram, a helicopter joins at
  4–5 stars; busted or wasted means a $200 hospital bill
- Five story missions with varied objectives, timers, and payouts, plus side
  activities: taxi fares, checkpoint street races, 12 hidden packages, and
  stunt jumps
- Three weapons — pistol, SMG, shotgun — with different range, damage, and
  fire rate; raycast shooting, tracers, and muzzle flash
- HUD with circular minimap, wanted stars, money, health and armor, objective
  + timer, speed, and weapon/ammo; start / pause / mission menus
- Save in localStorage (money, missions done, collectibles, best times)
- Synthesised WebAudio sound only — engine hum, sirens, gunshots, fanfare

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
| Mouse click | Shoot |
| 1 / 2 / 3 | Switch weapon |
| Space | Handbrake |
| M | Missions |
| P / Esc | Pause |

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
