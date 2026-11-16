# Step 5 — Co-op crewing

Two questions from Alexey, answered after the drill was in and two scripted pads had sailed it. This is one computer and two controllers. Nothing here talks to a server.

## Can a total non-sailor sail it in 10 minutes?

The drill, once you are moving, is short. The scripted helm and crew finish three tacks, both marks, and the run home in about 47 seconds of sim time, with no page errors. A person who has never held a tiller will not be that script.

What they have to learn on top of the boat is the split. Helm's stick does not touch the sheet. Crew's triggers do not steer. The tack does not start until someone says ready. That is four new ideas before the first mark. Two people who already did the learn-mode lessons could fumble through the beat inside ten minutes, including a couple of tacks where the helm turns early and the crew is late. Someone who has never sailed, handed a second pad and told "press A", is going to spend the ten minutes on the join screen and the first call. I would not sign a measured yes.

## Would a real sailor trust it to teach?

The calls, yes. The boat, only as the dinghy they already know.

Helm says ready about, waits, then lee-oh. Downwind the same button says stand by to gybe. That is the RYA order this project already used in the lessons. The tiller is held until the crew answers, which is the part of a real tack that singlehanded sailing cannot show. Crew sync is a separate number from the tack-quality term the forces already use. On the scripted run that term peaked around 0.92 and sync around 0.90. Those are the script hitting the metric it was written against: rudder under half a stick, sheet eased, weight moving as the bow goes through. A person's first try will be lower, and the debrief should say so. I would trust that split. I would not trust the 0.92 as what a crew usually sails.

What a sailor would mark down: there is no jib. The kicker is a brake on the mainsheet command, not a leach. Both bodies draw on screen, and the physics still has one weight, the same offset and the same rate as the singlehanded boat. The AI crew, if you press Enter, answers and crosses on its own. It is a stand-in, and the debrief says so. Rules of the road, a real trapeze, and a gybe that can put you in are still out of scope.

## What real online co-op would need

Xbox Live or an Unreal dedicated server is a different program.

- One sim, owned by a server or a listen host. Two browsers each stepping the boat will not agree about who said ready.
- Inputs replicated, not boats. Helm sends rudder, hike, and the call. Crew sends sheet, vang, and the answer. The host applies them in one tick.
- The call and the answer are events with a host timestamp. A 200 ms argument about whether crew was ready makes the tack window, which is about two seconds, into a coin flip.
- Prediction for the helm's tiller, and a correction when the host's sheet does not match what the crew thought they eased.
- A session: invites, join-in-progress, and the AI crew taking the sheet if the second player drops. That is the same fallback as the one-controller path here, except the dropout is a network event.
- Xbox Live sign-in, privacy, and voice. A call you cannot hear is not a call. Text on a HUD is the stand-in this build uses because both players are looking at one screen.
- NAT, QoS, and a tick rate the tack window can survive. GitHub Pages cannot host any of that. This step does not open a socket.

## Sources

- RYA Level 1 calls, already used in step 4: ready about, lee-oh, gybe rather than jibe.
- This repository's own dinghy, unchanged: `tackQuality` in `src/sim/sim.ts`, `SHEET_RATE` and `CREW_RATE` in `src/sim/constants.ts`. Co-op composes the same `Controls` object. The vang only scales the crew's sheet-out command before it gets there.
