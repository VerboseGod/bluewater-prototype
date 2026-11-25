# Controls

Standard Gamepad, the mapping Edge on Xbox reports. The same button does the same thing in every mode, except the rows marked under Exceptions.

| Index | Button | Action |
| --- | --- | --- |
| Left stick X | LS | Steer the bow. Push right, the bow goes right. Settings can invert it. |
| Left stick Y | LS | Move through a menu. Up and down. |
| 7 | RT | Trim the sheet in. Analogue, so holding it keeps pulling. |
| 6 | LT | Ease the sheet out. Analogue. |
| 0 | A | Select in every menu. While sailing in Assisted, a press tacks. Holding A hikes out to windward. |
| 1 | B | Back in every menu. Skip the intro. While sailing, hold B to move in, across the boat, toward the leeward side. |
| 2 | X | Graphics, Low or High. One press. |
| 3 | Y | Assisted or Manual trim. One press. |
| 4 | LB | Cycle the wind in Docking and Harbour. One press. |
| 5 | RB | Throw or let go the mooring line. One press. In co-op the helm's RB calls the tack. |
| 8 | View | Controls diagram for the mode you are in. One press. Press again, or B, to close it. |
| 9 | Menu | Pause. Resume, Controls, Restart, Settings, Main menu. One press. |
| 10 | LS click | Toggle the light tide in Docking and Harbour. One press. |
| 11 | RS click | Drop or weigh the anchor. One press. |
| Right stick | RS | Orbit the camera. It eases back. |
| 12 | D-pad up | Menu: move up. Sailing: chase camera. Dock and Harbour: pay out anchor scope while held. |
| 13 | D-pad down | Menu: move down. Sailing: top-down camera. Dock and Harbour: take scope in while held. |
| 14 | D-pad left | Sailing: cinematic camera. Dock and Harbour: paddle while held. |
| 15 | D-pad right | Cockpit camera, except in a menu. |

Keyboard, for a desk, not the television:

| Key | Action |
| --- | --- |
| A D or arrows | Steer, or move a menu |
| W or Up | Trim in |
| S or Down | Ease |
| Space | Hike |
| B | Move in, or Back in a menu |
| Enter | Select |
| Y | Assisted / Manual |
| G or X | Graphics |
| Z | Cycle the wind |
| T | Tide |
| F | Anchor |
| M | Mooring line |
| Q | Paddle |
| H | Docking, from the pause screen |
| R | Restart |
| P or Esc | Pause. Esc is Back while a menu is open. |
| 1 2 3 4 or V | Chase, cockpit, top, cinematic |
| C | Cycle cameras |
| Tab | Controls diagram |

Assisted trims the sail for you. Manual trim is in Settings, and it unlocks after the three-step intro. The intro is steer, then trim, then tack. B skips it.

## What was wrong

These are the bindings that were dead, duplicated, or did something other than the words on screen.

1. **D-pad left duplicated chase.** In open water, D-pad up and D-pad left both selected the chase camera. The cinematic camera had no pad button. D-pad left is the cinematic camera now.
2. **View reset the boat.** The old legend said "View reset", so the wire matched that sentence, and a player still could not tell what had happened. View opens the controls diagram. Restart is in the pause menu, and the R key still resets.
3. **LB meant two different things.** While sailing it did nothing. On the debrief it jumped into docking. In the dock and the harbour it cycled the wind. LB now only cycles the wind, and only in Docking and Harbour. Docking is a main-menu item. H still opens it from pause.
4. **Harbour told you to paddle with the left side of the pad, and no button paddled.** Hold D-pad left. Q still paddles. That press used to switch the camera as well. It does not, in the dock and the harbour.
5. **A and B in a menu also hiked.** Confirming a lesson fed the same press into the sailor. A menu press no longer hikes or moves you in. The main menu holds the boat still until a place is chosen.
6. **Left stick Y did not move menus.** It does now, one step and then a repeat while you hold it. The D-pad does the same.
7. **Discrete buttons could have repeated every frame.** They were already rising edges. That is covered by unit tests now. The sheet, the hike, moving in, the paddle, and the anchor rode stay as levels, because holding them is the action.
8. **Edge on Xbox kept the cursor.** The page sets `navigator.gamepadInputEmulation = "gamepad"` as soon as the document starts, when that property exists. If a pad is connected and its timestamp never moves, the page says: Press Menu, then Use game controllers in Edge.

## Exceptions

- **A** selects in a menu, tacks on a press while Assisted, and hikes while held. Manual trim has no tack on A. You steer through the wind.
- **B** goes back in a menu and moves the sailor while sailing.
- **D-pad** moves a menu, changes the camera while sailing, and pays the rode or paddles in the dock and the harbour.
- **LB** cycles the wind only in Docking and Harbour. It does nothing in open water, on purpose, so it is not a secret mode change.
- **Co-op, second pad.** The crew's RT trims in, LT eases, A hikes, B moves in, Y means ready, X is the vang. The helm's RB calls the tack. Y on the helm pad still toggles assist. Two people, one boat, no network.
- **View and Menu cannot be remapped.** Settings can remap trim in, ease, hike, and move in. The new button is saved in `localStorage` under `bluewater.settings.v1`.

## Lessons

Wind and no-go zone, Stopping (lying-to), Beam reach, Points of sail, Tack, Out of irons, Return to the pontoon. Gybe and Capsize are extras, then Safety, Man overboard, and Right of way. Progress is stored by lesson id in `bluewater.learn.v1`, so an older save still marks the lessons you finished. New lessons start undone.
