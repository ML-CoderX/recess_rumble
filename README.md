# Recess Rumble

A top-down arena brawler for phone and desktop browsers. Play solo against four bots or host a room for up to five fighters on the same Wi-Fi.

## Play solo offline

Open `recess-rumble-solo.html` in a browser, choose **Play Solo**, pick a fighter and difficulty, and press **Start solo match**. The file contains the whole game and runs without Node.js, a WebSocket connection, or an internet connection. You can get a fresh copy from **Download offline game** in the solo setup or rebuild it with `npm run build:solo` after changing characters or game files.

The hosted menu also runs solo matches locally. On localhost or HTTPS, the game saves an offline copy after the first successful load. On a phone opening the host's ordinary Wi-Fi HTTP address, leave the loaded page open or save the standalone HTML and open it in a browser that supports local HTML files. For offline reloads on phones that only preview downloaded HTML, use the cached game from an HTTPS origin.

Every round draws four independent random picks from the roster. Ranged bots keep their distance and fast bots close in. Medium and Hard bots dodge incoming shots. Increasing difficulty sharpens aim and shortens the delay before bots react or fire a charged super.

## Start the server

Install Node.js 22 or newer. In a terminal opened to the project folder, run:

```sh
npm ci
npm start
```

PowerShell users can run `npm.cmd ci` and `npm.cmd start`. Keep the terminal open while playing. On the host laptop, open [http://localhost:3000](http://localhost:3000).

## Join from another phone or PC

1. Connect everyone to the same Wi-Fi. On the host, find the **Wi-Fi IPv4 address** in the server output or by running `ipconfig` on Windows. Use the value for the Wi-Fi adapter if the server prints several.
2. On each device, open `http://<host-wifi-ip>:3000` in the browser. For example, if the laptop's IP is `192.168.1.42`, open `http://192.168.1.42:3000`.
3. Everyone chooses **Multiplayer Room**. The host enters a name, picks a fighter, and chooses **Create room**. Share the five-character room code. Everyone else enters a name and the code, then chooses **Join**. Duplicate fighters are allowed.
4. Before **Start match**, the host can toggle **Fill open slots with bots** and **Bots take over disconnected fighters** independently. After the round, **Back to lobby** opens the room for another match.

If another device cannot connect, check that the browser uses `http://` and the laptop's Wi-Fi IP. Allow Node.js or inbound TCP port 3000 on the host's private network if the firewall blocks it. Guest networks sometimes isolate devices from each other. If port 3000 is taken, set `PORT` to an available port before starting and share the new address. For example, in PowerShell run `$env:PORT = 3001` and then `npm.cmd start`.

## Play

On a phone, tap **Start** or **Start muted** to enter fullscreen and lock landscape when the browser supports both. If the rotate hint appears, turn the phone sideways. On supported browsers, adding the hosted game to your home screen lets it launch in landscape fullscreen from its icon.

| | Move | Aim and attack | Super |
| --- | --- | --- | --- |
| Desktop | WASD or arrow keys | Aim with the mouse, left-click to attack | Space |
| Touch | Drag the left stick | Drag and hold the right stick in the direction you want to fire | Tap the lit Super button |

Hits with your small attack charge your super. For Appo Smash, point at the landing spot with the mouse, or tilt the right stick to set direction and distance before tapping Super. Muawiz heals after two seconds without moving or attacking and takes more damage while napping. Firas leaves stickers that slow opponents who cross them. Furniture blocks movement, projectiles, grabs, and Laser Arm. Appo Smash can arc over furniture.

The last fighter standing wins. If two minutes elapse first, the most KOs wins, with a draw on equal KOs. Knocked-out players spectate the rest of the match. With takeovers enabled, a bot continues playing a disconnected fighter with the same position, health, super charge, and score. Otherwise the server removes their fighter. If the host leaves, the next connected player becomes host.

## Maps

Choose **Map** in Solo setup or in the multiplayer lobby as host. **Random** draws a map when the round starts.

- **Classroom Chaos** has desks, chairs, a whiteboard, and a podium. Step out of the marked area before the pop quiz goes live. Grab coffee for a short speed boost.
- **Canteen Showdown** has long tables and a central counter. Chai puddles carry your momentum. Grab samosas to recover health.
- **Hostel Night** has beds, lockers, blankets, and shadowy corners. Fighters are harder to spot at a distance, and Muawiz’s nap heals 25% faster.

Plants and blankets hide fighters from distant opponents. Attacking or taking damage briefly reveals your position. Bots route around obstacles and can retreat into cover. Each arena has a map intro, a chiptune track, and quiet synthesized ambience.

To add a map, copy a JSON file from `assets/maps/` and give it a unique `id` and `name`. Set the `intro` and `size` with `width`, `height`, and playable `inset`. The `tiles.layout` rows repeat across the floor, with each character mapped by `tiles.colors`. `background` sets `ground`, `edge`, and `mark` colors and can include a `path` to floor art in `assets/maps/`. Set at least five open `spawns` as `[x, y]` pairs.

Place obstacles and bushes with `{ "x": 100, "y": 100, "w": 80, "h": 60, "kind": "desk" }`-style rectangles. Use the existing furniture and hideout kinds from the shipped maps. The `hazards` array supports `quiz`, `slide`, and `dark`; the `pickups` array supports `speed` and `heal`. Copy an existing entry for the parameters for that type. Choose `classroom`, `canteen`, or `hostel` for `music` and `ambient`. Restart the server and run `npm run build:solo` to refresh the downloadable game.

## Audio

Choose **Start** on the tap-to-start screen to unlock audio. **Settings → Audio** in the menu and match HUD opens separate Music, Sound effects, and Voices sliders and a master mute. The browser saves those settings. The Web Audio API synthesizes the effects and looping chiptune. Browser text-to-speech delivers fighter lines when a voice is available on the device, with the music briefly lowered during speech. Your fighter's lines also appear as text. Nearby action sounds louder in both modes.

Global cues are in `assets/audio.json`. Each character's `sounds` object configures their attack, hit, super, and passive effects. To swap a synthesized cue for a clip, put an MP3 or Ogg file in `assets/sounds/` and use a cue object with a `file` path and an optional fallback `preset`. For example, set Muawiz's `attack` cue to `{ "file": "/assets/sounds/appo.mp3", "preset": "whoosh" }`. Restart the server to load the change. Run `npm run build:solo` to embed the clip in the standalone game.

## Mobile controls

Open **Settings → Controls** from the main menu or during a match. The shared size slider scales all three controls, and the Move, Attack, and Super sliders fine-tune them individually. Opacity ranges from 20% to 100%. The default joystick bases are 22% of the shorter screen side, with a 140px minimum, and knobs are 45% of the base. Super starts at 80px or larger. Controls shrink as needed on very small screens to fit the playable area.

Choose **Edit layout**, drag the three outlined controls, then **Save**. **Reset to default** restores the default positions in the preview. Escape or the browser Back action cancels unsaved position edits. Sizes, opacity, presets, and positions are saved in localStorage. Positions use fractions of the viewport and are clamped away from safe areas and the top HUD and super meter after rotation.

**Left-handed layout** mirrors control positions. **Floating move joystick** places movement under your first touch in the movement half of the arena, mirrored to the right for left-handed play. A quick tap on Attack fires toward the nearest visible enemy when **Aim assist** is enabled. Drag Attack to aim manually. Moving, attacking, and Super each track their own finger.

## Changing Character Voices

Each JSON file in `assets/characters/` has a `voiceLines` object. It holds `spawn`, `win`, `lose`, and `taunt` text, plus `super`. Edit the strings to change the speech. Muawiz’s `lose` line is `"Going to Byndoor"`. Spawn plays at the beginning, win and lose play at the result, and lose also plays on defeat. Taunt text is available for custom interactions through the audio controller’s `characterLine(fighter, "taunt")` method.

The `voice` object chooses the TTS voice by its exact `name` and sets its `pitch` and `rate`. An empty or unavailable voice name uses the browser’s default. List voices in the browser console with:

```js
function listVoices() {
  console.table(speechSynthesis.getVoices().map(({ name, lang }) => ({ name, lang })));
}
listVoices();
speechSynthesis.addEventListener("voiceschanged", listVoices);
```

Available voices differ between devices and may load asynchronously. A local voice can speak offline when the device supports it.

For recordings, get the person’s permission and put short MP3 or Ogg clips in `assets/voices/<character>/`. The `voiceFiles` object supplies an optional recording for each event. A recording takes priority, with the corresponding `voiceLines` text used as the fallback if loading or decoding fails. You may also set `voiceLines.lose` directly to `"assets/voices/muawiz/lose.mp3"`, though keeping the text in `voiceLines` and the path in `voiceFiles` provides a spoken fallback.

Keep each clip 1–3 seconds, mono, at a normalized volume, and under 100KB for fast mobile loading. Both recordings and TTS use the **Voices** slider and master mute in Settings, and duck the music during playback.

Here is a complete example character config. Create the referenced sprite and recording, save the JSON in `assets/characters/`, and restart the server. Remove the `voiceFiles` entry to use only TTS.

```json
{
  "id": "sleepy-pal",
  "name": "Sleepy Pal",
  "class": "Ranged",
  "color": "#ffbf54",
  "stats": { "health": 5, "speed": 5, "damage": 8, "range": 8 },
  "sprite": { "path": "/assets/sprites/sleepy-pal.png" },
  "attack": {
    "name": "Small Appo", "description": "Throw a chapati.",
    "type": "projectile", "cooldown": 0.62, "speed": 690, "charge": 34
  },
  "super": {
    "name": "Appo Smash", "description": "Lob a giant chapati.",
    "type": "lob", "range": 490, "radius": 86,
    "damage": 245, "delay": 0.53, "stun": 0.85
  },
  "passive": {
    "name": "Power Nap", "description": "Heal while resting.",
    "type": "nap", "delay": 2, "healing": 29, "vulnerability": 1.35
  },
  "sounds": {
    "attack": "whoosh", "attackHit": "splat", "super": "rise",
    "impact": "slam", "nap": "snore", "hurt": "boing", "defeated": "tumble"
  },
  "voiceLines": {
    "spawn": "Five more minutes!",
    "win": "A dream come true!",
    "lose": "Going to Byndoor",
    "taunt": "Wake me when you get here.",
    "super": "Extra-large appo!"
  },
  "voice": { "name": "", "pitch": 0.9, "rate": 0.95 },
  "voiceFiles": { "lose": "assets/voices/sleepy-pal/lose.mp3" }
}
```

Run `npm run build:solo` after changing voices to embed updated configs and available recordings in the offline game.

## Add a fighter from a reference image

1. Put the reference in `assets/reference/`. Note the hair silhouette, facial features, glasses or beard, clothing palette, and signature prop. Draw the character with an oversized head and compact body so the silhouette reads at arena size.
2. Export a transparent PNG, WebP, or SVG to `assets/sprites/`. Use consistent image dimensions and a centered character with feet near the bottom. If you have one still image, the renderer supplies idle, walk, attack, super, hurt, and defeated poses using transforms and effects.
3. Copy a file from `assets/characters/` to a new JSON file. Give it a unique lowercase `id` using letters, digits, or hyphens. Set the displayed name, class, color, and four 1–10 stats. Point `sprite.path` at the new image. Optional individual state images override the default poses. For example:

   ```json
   {
     "path": "/assets/sprites/new-fighter.png",
     "states": {
       "walk": "/assets/sprites/new-fighter-walk.png",
       "hurt": "/assets/sprites/new-fighter-hurt.png"
     }
   }
   ```

4. Set the attack, super, passive, and voice lines. Duplicate a move of the same type and adjust its numeric parameters. Available attack types are `projectile` and `slam`. Supers can use `lob` or `beam`, and passives can use `nap` or `sticker`. Times are in seconds, distances in arena units, and charge is a percentage per hit. New fighters that use those mechanics need no source changes. New mechanics require a simulation and rendering implementation.
5. Restart the server and choose the new fighter in the lobby. Check the portrait, combat states, and voice lines, then try a match with bots to tune the numbers.

### Reference notes

- **Muawiz the Great** uses the short brown curls, clean-shaven face, red sash, black jacket and pants, boots, and dark fingerless gloves from `Muawiz_the_Great.png`. The chibi version adds his chapati as a held prop.
- **Nigamon Firas** uses the dark curls and full beard, cream tracksuit with red trim, red sash, and dark gloves and sandals from `Nigamon_Firas.png`. The chibi version adds the mechanical backpack arm and a sticker. Firas’s super line is “Sticker strike!” to match the family-friendly tone.

The server simulates movement, collisions, damage, enemy hits, bots, and round results. Browsers send movement and aim inputs and attack requests. Rooms and scores live in memory for the current server session.

