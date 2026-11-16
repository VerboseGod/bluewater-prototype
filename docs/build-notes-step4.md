# Step 4 — Learn mode

Two questions from Alexey, answered after the lessons were in and the autopilot had sailed them.

## Can a total non-sailor sail a tack and get back to the dock in 10 minutes?

Plausible, and I have not watched one do it.

The course is six short lessons, one line at a time, with the controller buttons drawn on the line. The sim, not a timer, decides when a lesson is done. Stuck in irons for more than five seconds, the coach says to push the stick away from the sail and wait. The scripted helm finishes "where the wind comes from" and the beam reach with no page errors in about 35 seconds of the smoke test, and it finishes the tack lesson, from the first line to the debrief, in about 45 seconds. A person who has never held a tiller will be slower than that. Lessons 1 to 5 are the sort of thing you can fumble through inside ten minutes if you follow the line on the screen. Lesson 6 is the one that can spill. Stopping head-to-wind and making fast uses the real docking score, and the pontoon is a short reach away, but throwing the line inside a metre and under half a knot is the part a first-timer is most likely to miss and retry. I would not sign a measured "yes" until someone who does not sail has sat down with a pad.

## Would a real sailor trust what it teaches?

The words, yes. As a whole Stage 1 course, no.

The calls are the RYA ones this step asked for: ready about, then lee-oh, and gybe rather than jibe. ASA 101 teaches the same manoeuvres and says hard alee, and jibe. The points of sail are this dinghy's own bands, not a poster: inside about 35° is the no-go zone and the sail luffs, close-hauled sits near 45°, a beam reach is the wind on the side, a run is the wind aft of about 150°. Telltales match the boat that is already here: they stream aft when the sheet is right, and the leeward one lifts when the sail is stalled. A tack is graded by the speed kept through the turn and by the tack-quality term the forces already use. That term treats 0.55 as a clean tack, which is also the drive bonus in the sim, and the debrief says a clean one keeps about 60% of entry speed. That is the same "about 4.9 kn down to 3.0 kn" already written up for this boat. By the lee is the boom's own test: past about 170° true, with the wind already on the boom's side, so the boom can come across on its own. The death-roll line is the eased-sheet roll on a run. In this lesson the wind stays at 11 kn, where that roll is a warning and not the capsize the boat does at about 16 kn, so a sailor would be right to say the lesson names the danger a step before this breeze will throw you in.

The tack the scripted helm sailed for the recording kept 59% and scored 0.38. The debrief gave it two stars and said why it was not clean. That is the part I would trust: it does not congratulate a scruffy tack.

What it does not teach, and should not pretend to: rules of the road, man overboard, a real capsize drill, or a gybe in a breeze that can knock the boat over. It is the first hour, on one dinghy, in flat water and 11 kn.

## Sources

- RYA Level 1 / Start Sailing (Stage 1): where the wind comes from, the no-go zone, points of sail, going about ("ready about", "lee-oh"), gybing, and stopping head-to-wind. RYA says gybe.
- ASA 101, Basic Keelboat Sailing: the same points of sail, no-go zone, tacking, jibing, and coming alongside under sail. The helm call there is hard alee. This lesson keeps the RYA calls.
- This repository's own dinghy, unchanged: `README.md` feel section, `tackQuality` in `src/sim/sim.ts` (0.55 is the clean-tack threshold the forces already use), and the by-the-lee test in `updateBoom` (`|twa| > 2.97` and the wind on the boom's side). The docking lesson grades with the existing docking score, including its 1.5 kn hot-approach line and its hard-hit class.
