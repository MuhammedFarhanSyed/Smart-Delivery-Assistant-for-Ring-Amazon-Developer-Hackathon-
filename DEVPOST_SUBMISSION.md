<!--
DEVPOST SUBMISSION KIT
Project: Smart Delivery Assistant for Ring
Track: Ring | Mini challenge: AWS Builder
-->

# 1. Project description (paste into the Devpost description box)

**Smart Delivery Assistant for Ring** talks to the courier at your door, remembers where they left the package, watches the drop spot, and flags a possible risk if someone approaches it afterwards. It links everything into one delivery timeline.

## Inspiration
Missed deliveries and unclear drop-off spots are a daily annoyance, and they are harder for residents who can't hear the doorbell or can't get to the door quickly. We wanted a Ring app focused on delivery management and accessibility, not just another motion alert.

## What it does
- **Delivery Assistant:** when the doorbell rings, it speaks a greeting, captures the courier's spoken reply (with a typed fallback), and turns it into structured instructions: where the package was left, what was done with it, and whether a signature is needed. Residents can read live captions and type a reply that is spoken aloud to the courier.
- **Package Watch:** the resident draws a drop zone on the camera view. The app calibrates a baseline, detects when a package appears or disappears, and tracks status as Expected, Delivered or Removed, saving local snapshots.
- **Proximity notice:** if a person overlaps the drop zone after delivery, the app shows "Possible risk: a person approached the package", clearly labeled as a heuristic. It uses no face recognition and does no identification.
- **Busy Mode Visitor Assistant (`/visitor`):** when the homeowner is in meetings or away, 3 rings within 10 seconds engage an automated assistant. It speaks only the owner's configured instructions, transcribes messages onto the owner's phone mock, and escalates emergencies via red alert flashes, browser notifications, and optional Telegram bot messaging.
- **Audio Synthesis & Visualizer:** dual-tone Web Audio API Westminster chime ("Ding-Dong") on ring events, real-time decibel level visualizer meter, and one-click quick speech presets.
- **One timeline:** doorbell, greeting, courier reply, instructions, package status and notices appear in a single readable timeline.

## How we built it
Next.js, TypeScript and Tailwind, built on the `ring-api-helloworld` starter. 
- **Ring Partner API:** device discovery, device status, event history, and live video through WHEP/WebRTC, using the Ring Developer Playground token and simulated streams.
- **In-browser vision:** TensorFlow.js COCO-SSD for person detection and drop-zone frame differencing for package detection. Video stays on the user's machine.
- **Speech & Audio:** browser speech synthesis, Web Speech API speech-to-text, and Web Audio API for dual-tone chime sound synthesis and live microphone volume level metering.
- **AWS:** Amazon Bedrock (Amazon Nova Micro) converts courier transcripts into structured delivery instructions AND powers the Busy Mode visitor assistant conversation classification, with keyword safety-net fallbacks.
- **Two source modes:** a Ring API mode, and a simulator mode (webcam or uploaded video), plus a "Run Demo Scenario" button that plays the whole flow without any hardware or keys.

## What's new vs. the starter
The starter provided token handling, the WHEP stream route, the webhook receiver and the video-processor plugin system. We added the device-source layer, the Delivery Assistant, instruction extraction (keyword and Bedrock), Package Watch, the proximity notice, the session timeline and store, the Ring data panel, the Busy Mode visitor assistant (`/visitor`), native Web Audio chime synthesis and decibel visualizer, the demo scenario, and the unified dashboard. A detailed table is in the README.

## Challenges
- The Ring Playground's simulated streams are static (a box on a porch, birds at feeders), with no person or removal events. We built a two-mode design so the Ring API mode shows real API usage while the full story runs on test footage.
- COCO-SSD has no "package" class, so we used drop-zone differencing with baseline calibration, edge-margin masking for camera overlays, and a sensitivity slider.
- Keeping the alert honest: it is worded as a possible risk, and we avoided identity inference entirely.

## What's next
Real Ring webhooks and OAuth account linking, resident notifications, multi-camera support, and review against Ring's certification and Computer Vision Guidelines.

**Built with:** Next.js, TypeScript, Tailwind CSS, Ring Partner API, WebRTC (WHEP), TensorFlow.js COCO-SSD, Web Speech API, Amazon Bedrock (Amazon Nova Micro)

**Track:** Ring | **Mini challenge:** AWS Builder

---

# 2. Product Feedback

## Which developer tools, APIs and SDKs did you use, and for what?
- **Ring Developer Playground and Ring Partner API** (`api.amazonvision.com/v1`): device list, device status, event history, and live video via WHEP sessions, for the Ring mode of the app.
- **Ring simulated streams** (Package and Motion): as the Ring-mode video source for package watch and detection.
- **ring-api-helloworld starter:** as the base for authentication, WHEP streaming and the webhook receiver.
- **Amazon Bedrock (Converse API, Amazon Nova Micro):** to convert courier transcripts into structured delivery instructions (see the AWS section below).

## What worked well?
- Generating a token in the Playground needed no app registration or OAuth setup, so we could call real APIs within minutes.
- The Playground shows the exact curl command and response for each endpoint, which made the API shape easy to learn.
- The WHEP live stream worked on the first try in our app, using the starter's route.
- The starter repo was well organized, and its plugin-style video processors made it easy to run our own frame analysis on the stream.
- Event History and Device List returned real data for the Playground device.
- Bedrock's API key (bearer token) let us call the Converse API with a plain `fetch` and no SDK, which kept setup simple.

## What needs work?
- **The Package simulation is a static scene.** The box never moves and nobody appears, so it can't be used to test person-approach or package-removal logic. A scenario with a delivery, a drop and a pickup would be far more useful.
- **There is no doorbell-press simulation** (only Package, Vehicle and Motion), so ding-based flows can't be tested.
- **Event History for the Playground device returned only `on_demand` events** in our tests, so there were no event types to build triggers around.
- **The Playground token lasts about 30 minutes** and must be regenerated by hand, which interrupts long development sessions.
- **Docs and hackathon pages are slightly inconsistent:** the Ring getting-started page lists a physical Ring device as a requirement for testing, while the hackathon says no device is required; and on the Devpost resources page, the "Get started with Ring" and "API reference" links point to the same page.
- **On the AWS side:** Anthropic models on Bedrock required a use-case submission our account was not authorized to make, so we switched to Amazon Nova. The new Bedrock console (mantle endpoint) sits alongside the older runtime console, which made it unclear at first which one to use.

## How was your onboarding experience (zero to hello world)?
Getting a token and calling the device list took minutes through the Playground, and the starter ran locally with a couple of commands. The slower part was working out what the simulated streams actually contain, because that wasn't clear until we opened each one.

## Would you build with these devices and services again?
**Yes.** The Ring API gives access to real camera video and device data with very little setup, and the delivery and accessibility use cases are a good fit for an Appstore app. It would be much easier to build on with richer simulated scenarios and event types.

## AWS services used and how (AWS Builder mini-challenge)
**Amazon Bedrock** (Converse API, Amazon Nova Micro, called from `lib/aws/bedrock.ts` via a plain `fetch` with a Bedrock API key). It converts the courier's transcribed reply into structured delivery instructions (location, action, signature needed, notes), which are then shown on the dashboard timeline. Only transcript text is sent; video and snapshots stay local. If Bedrock is unavailable or returns an unusable response, the app falls back to a local keyword extractor, and the UI shows which method produced each result.

---

# 3. Friction log entries (optional, up to 10% bonus)

**FL-1: Package simulation is static**
- **Task:** test package-removal / person-approach logic on the Ring stream.
- **Steps:** Playground > Simulate live view event > Package; watched the full stream, then ran it in our app.
- **Expected:** a delivery or pickup, or some activity around the box. **Actual:** a static scene where only the timestamp overlay changes.
- **Severity:** High. **Workaround:** our own test footage in a simulator mode.
- **Suggestion:** add scenario variants (package dropped, person approaches, package removed) with matching events.

**FL-2: No doorbell-press simulation**
- **Task:** trigger a doorbell flow from a Ring event.
- **Steps:** looked through the Simulate live view options.
- **Expected:** a doorbell press option. **Actual:** only Package, Vehicle and Motion.
- **Severity:** Medium. **Workaround:** a "Simulate Doorbell" button in the app.
- **Suggestion:** add a doorbell-press scenario and event.

**FL-3: Event History returns only `on_demand` events**
- **Task:** use Ring event history as triggers on the timeline.
- **Steps:** called the Event History endpoint for the Playground device.
- **Expected:** motion, ding or package events. **Actual:** the events we saw were all `on_demand`.
- **Severity:** Medium. **Workaround:** displayed them in a data panel and drove the flow from our own simulator.
- **Suggestion:** seed synthetic motion, ding and package events for the Playground device.

**FL-4: Short-lived Playground token**
- **Task:** keep the app connected during development.
- **Steps:** generated a token and used it in `.env.local`.
- **Expected:** a longer-lived dev token or an easy refresh. **Actual:** expires after about 30 minutes, requiring a manual restart.
- **Severity:** Low. **Workaround:** regenerate and restart.
- **Suggestion:** a refresh option for Playground tokens.

**FL-5: Docs mismatch on the device requirement**
- **Task:** decide whether a physical device is needed.
- **Steps:** read the Ring getting-started page and the hackathon page.
- **Expected:** consistent guidance. **Actual:** the getting-started page lists a Ring device as required for testing, while the hackathon says it is not.
- **Severity:** Low. **Workaround:** followed the hackathon page.
- **Suggestion:** mention the simulator and Playground path on the getting-started page.

**FL-6: Bedrock model access and console confusion (AWS)**
- **Task:** call a Claude model through Bedrock.
- **Steps:** searched the console; opened the model catalog.
- **Expected:** quick access. **Actual:** Anthropic models needed a use-case submission our account could not complete; the console also offers a separate "mantle" console next to the runtime one.
- **Severity:** Medium. **Workaround:** switched to Amazon Nova Micro.
- **Suggestion:** clearer in-console guidance on which models work immediately, and which console to use for Converse calls.

---

# 4. Feature requests (optional)

1. **Scenario-based simulator** (delivery, pickup, person approach, doorbell press) with matching events. *Why:* allows testing delivery and security flows without hardware. **Priority: Critical.**
2. **Synthetic webhook events sent from the Playground to a URL we provide.** *Why:* lets us test webhook handling end to end. **Priority: Important.**
3. **Refreshable or longer-lived Playground tokens.** **Priority: Nice-to-have.**
4. **Longer simulated stream sessions.** *Why:* 30 to 60 seconds is short for testing detection logic. **Priority: Nice-to-have.**
