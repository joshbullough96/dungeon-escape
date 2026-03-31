# Dungeon Escape Gameplay Guide

This document describes the current gameplay rules and systems in `Dungeon Escape`.

## Goal

Clear all 30 stages by:

- finding keys
- spending 1 key per locked door
- reaching the exit

Loot carries forward between stages. Health also carries forward during a run unless you restart.

## Core Rules

- The dungeon is tile-based.
- You move one tile at a time.
- You can use:
  - arrow keys
  - `W`, `A`, `S`, `D`
  - on-screen touch controls
  - swipe controls on mobile
  - tapping an orthogonally adjacent visible tile
- Walls block movement.
- Locked doors require 1 key to pass.
- If you are carrying at least 1 key, locked doors preview as unlocked/gray.
- Reaching the exit automatically loads the next stage after a short delay.
- Stage 30 ends the run with a victory message.

## Run Structure

- Total stages: `30`
- Starting health: `3`
- Max health: `5`
- Restart resets the whole run back to stage 1
- Restart also resets:
  - health to `3`
  - loot to `0`

## Stage Generation

The game currently uses 3 stage generation methods:

- `Linear`
- `Quadrant`
- `Custom Template`

Generation schedule:

- every `10th` stage: looting custom template
- every other `5th` stage: standard custom template
- every `3rd` stage: quadrant
- all other stages: linear

Looting template stages are intended to be richer treasure rounds.

## Keys And Doors

- Each locked door costs `1` key
- Keys are collectible and stack
- Some stages may allow you to gather multiple keys before opening the next door
- The generators aim to ensure enough keys are accessible to finish the stage

## Loot

### Treasure Bag

- Available from stage `1`
- Worth a random amount based on stage
- Base range is roughly:
  - minimum: `15`
  - maximum: `35 + floor(stage / 2)`

### Gemstone

- Available from stage `6`
- Worth `100` loot

Loot is kept across stages until the run ends or is restarted.

## Support Items And Power-Ups

### Meat on Bone

- Available from stage `3`
- Restores `1` health
- Cannot heal above max health

### Flashlight

- Available from stage `8`
- Grants full vision for `10` moves
- Additional flashlight pickups add more moves to the current effect

### Shield

- Available from stage `15`
- Grants `1` shield charge per pickup
- A shield charge fully blocks one hazard, no matter how dangerous it is
- If multiple shields are collected, charges stack

## Hazards

Hazards disappear after they trigger once.

### Trap

- Available from stage `1`
- Deals `1` damage

### Spikes

- Available from stage `3`
- Deals `1` damage

### Poison

- Available from stage `8`
- Deals `1` damage immediately
- Then applies `2` poison ticks
- Each poison tick deals `1` damage on later moves

### Arrows

- Available from stage `13`
- Deals `1` damage

### Fire

- Available from stage `18`
- Deals `1` damage immediately
- Then applies `2` burn ticks
- Each burn tick deals `1` damage on later moves

### Zombie

- Available from stage `23`
- Deals `1` damage
- Steals up to `20` loot

### Shield Interaction

If shield is active, it completely blocks one hazard:

- no direct damage
- no poison effect
- no burn effect
- no loot theft from zombie

## Visibility

### Dungeon Darkness

This can be toggled in Settings.

When enabled:

- Desktop/tablet uses local visibility around the player
- Flashlight temporarily overrides this with full vision

### Mobile Viewport

On small screens, the game uses a moving viewport:

- the stage still exists as a full `12x12` dungeon
- the player sees a `5x5` window around the character
- under Dungeon Darkness, the visible area is tighter until a flashlight is active

## Encroaching Flood / Sand

This can be toggled in Settings.

If enabled:

- starts on stage `4+`
- does not apply on looting template stages
- uses a grace period before the dungeon begins closing in
- after the grace period, the outer edge warns first
- then the enclosing wave advances every `2` moves

Current grace periods:

- stages `4-15`: `25` moves
- stages `16-25`: `35` moves
- stages `26-30`: `45` moves
- looting template stages: infinite grace period

Theme by stage:

- odd stages: water
- even stages: sand

Flood behavior:

- warning tiles tint before becoming blocked
- flooded tiles become inaccessible
- the player’s current tile is protected
- door tiles and their adjacent approach tiles are protected
- exit tile and its adjacent approach tiles are protected
- reserved progression path tiles are protected

When the grace period ends, a toast warns the player that the dungeon is closing in from the outside.

## Settings

Current settings:

- `Player Icon`
- `Dungeon Darkness`
- `Expansion Hazards / Items`
- `Encroaching Flood`

### Player Icon Options

- Wizard
- Elf
- Ninja
- King
- Princess

### Expansion Hazards / Items Toggle

When turned off, the following are removed from generation:

- Poison
- Fire
- Zombie
- Flashlight
- Shield
- Meat on Bone

Base content like traps, spikes, arrows, treasure, gems, keys, doors, and exits still remain.

## Mobile Controls

Mobile play currently supports:

- on-screen directional buttons
- swipe movement on the board
- tap-to-move for adjacent visible non-wall tiles

## UI Notes

- Status messages appear above the board
- Active effects appear as floating effect toasts near the board
- Restart is in the top header next to Settings
- Restart uses a confirmation modal

## Debug Helper

For testing in the browser console:

```js
goToStage(10)
```

This jumps directly to a stage number for testing.
