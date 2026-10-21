# Shadow Crown Universe + Living World (Book 1)

Lives inside the Grooveville site at **https://grooveville.org/shadowcrown/**. Plain HTML/CSS/JavaScript, no build step.

## Routes

| URL | Page |
|---|---|
| `/shadowcrown/` | Universe home |
| `/shadowcrown/read/` | Book 1, buy link, redeem code |
| `/shadowcrown/watch/` | Trailers and videos |
| `/shadowcrown/play/` | Living World hub (`new/`, `continue/`, `house/`, `school/`, `basketball/`, `daydream/`, `missions/`, `collections/`, `friends/`) |
| `/shadowcrown/map/` | Interactive Charlotte map |
| `/shadowcrown/characters/` | Character profiles (`?c=zeke`, `?c=zora`, ...) |
| `/shadowcrown/store/` | Books and merch |

Every route folder holds the same `index.html`, so refreshing a deep link works on Cloudflare without any server code. `sc.js` reads the address and shows the right page. All paths come from one helper in `sc.js` (`BASE`, `ROUTES`, `href()`, `go()`).

## Files

- `sc-data.js`: characters, places, missions, dialogue, visions and collectibles. Edit this to change story text.
- `sc-config.js`: public settings: Mapbox token, trailers, sample link, book redeem codes.
- `sc.js`: the site, game and map. `sc.css`: the look.
- `assets/`: character sheets, portraits, scenes and the logo (cut from your artwork).

## Map

- **Built-in map (default):** an illustrated Charlotte map with real coordinates for real places. Pins are approximate; story places (Upendo House, Evolve Prep, the Court) are fictional.
- **Mapbox:** put your Mapbox **public** token (starts with `pk.`) in `sc-config.js` › `mapboxToken`, and in your Mapbox account restrict the token to `grooveville.org`. A token saved only as a Cloudflare variable can't reach the browser on a static site, so it has to go in this file. Never put a secret token here.
- **Google Places:** not connected. Live place details need a small server (a Cloudflare Worker) so the key stays secret. Place cards use the info in `sc-data.js` plus a Google Maps directions link.

## Game

Play as Zeke with Prince. Six Book 1 missions: A Different Kind of Dream, School Day, Run the Court, Something's Off, Family First, The Message. Scenes: the Upendo House (rooms, family talks, journal, outfits, rest/save), Evolve Prep (focus class, friends, Coach Dixon with choices), basketball (timed shooting with Dribble, Sprint and the Crown Shot), the Daydream (find clues; stress hides clues, breathing clears them), the Charlotte map (virtual check-ins, Walk with Prince at Freedom Park, Vybr8 spot check-in).

**Saves:** progress saves on the device. Signed in with a Grooveville account, it also saves to Firebase (`scsave/{uid}`) and follows the player. **Friends:** each signed-in player gets a 6-character code; friends add each other by code (`scplayers/{uid}` holds only name, level, location and code).

Links back to Grooveville: the Grooveville logo (top left) goes home, **‹ Back** goes back a step, and the footer has **Back to Grooveville**.
