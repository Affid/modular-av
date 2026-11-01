# Voice channel routing

How the microphone travels from the device to the service. The shape and
the words come from Cubase's mixer, and differ where a voice call needs
something else. It grew out of issue #1: a reverb's tail was cut by the
voice gate, and held it open.

## The channel

```mermaid
flowchart LR
  mic[Microphone] --> pre["Pre-gate inserts<br/>noise suppression first"]
  pre --> gate[Voice gate]
  gate --> mute[Mute]
  mute --> feed[Post feed]
  feed --> post["Post-gate inserts<br/>post"]
  post --> channel["Channel level<br/>dry amount"]
  channel --> bus["Output bus<br/>capture.output.enabled"]

  post --> send[Send on/off]
  send --> fx1["FX channel<br/>send effect"]
  send --> fx2["FX channel<br/>send effect"]
  fx1 --> ret1["Return level<br/>wet amount"]
  fx2 --> ret2["Return level<br/>wet amount"]
  ret1 --> bus
  ret2 --> bus

  gate -. "post feed control" .-> feed
  gate -. "send control" .-> send
```

Solid lines carry sound. Dashed lines carry control, on the audio thread.

## One insert

Every insert can have a dry:wet setting the core owns. The effect outputs
only its processed signal, and the core mixes it with the dry one.

```mermaid
flowchart LR
  in[Signal in] --> delay["Dry delay<br/>effect's latency"]
  delay --> dry[Dry level]
  in --> effect["Effect<br/>the module's code"]
  effect --> wet[Wet level]
  dry --> sum((+))
  wet --> sum
  sum --> next[Next insert]
```

At 100% wet there is no dry branch and no extra node: the insert is a
plain link in the chain. An effect that doesn't declare its `latency` has
no dry:wet control and stays at 100% wet, because mixing it with an
undelayed dry signal would comb-filter the voice (a 10 ms delay puts
notches every 100 Hz).

An FX channel has no dry branch. Its dry signal is the channel itself, and
a dry branch inside it would double the voice.

## Terms

| Term                           | In our chain                                                 | Difference from Cubase                                            |
| ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Channel                        | The microphone's path, capture to output                     | In code, not `Channel`: that is the socket API type               |
| Pre-gate and post-gate inserts | The `pre-gate` and `post-gate` places, in series             | Our fader comes after all inserts, so the gate marks the boundary |
| Voice gate                     | The core's automatic on/off for speech                       | A fixed part, not a plug-in in a slot                             |
| Mute                           | The core's switch right after the gate                       | Stops what goes in; closing the output bus stops what comes out   |
| Post feed                      | A gain before the post-gate inserts, shut once the gate is   | Exists so native effects can sleep                                |
| Channel level                  | The dry amount, a core setting after the post-gate inserts   | Cubase's channel fader                                            |
| Send                           | A copy taken before Channel level, one per FX channel        | Always pre-fader; network audio is called outbound                |
| Send on/off                    | A gain at exactly 0 or 1 ahead of all sends, set by the gate | Exists so FX channels can sleep                                   |
| FX channel                     | Where an effect on a send runs, wet only                     | Our one channel feeds it; stacking effects in one is not built    |
| Return level                   | The wet amount of an FX channel, a core setting              | Cubase's FX channel fader                                         |
| Output bus                     | `capture.output.enabled`                                     | On or off, with no level                                          |

## Places

A slot belongs to the mixer, as in Cubase. An effect names a `defaultPlace`,
and `commands.setAudioEffectPlace` moves it, running or not, without restarting
it. Every plug is the same `{ input, output, dispose }`, so any effect can go
anywhere, in one place at a time. `commands.setAudioEffectOrder` sets the order
within a place; noise suppression runs first unless the order lists it.

Every effect outputs only its processed signal, and the core adds the dry.
That is what makes a move safe: the same effect gets a dry branch in an insert
(with a declared `latency`) and the dry channel beside it on a send.

| Place       | How it runs                                       | Fits                                  | Sounds wrong                                          |
| ----------- | ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `pre-gate`  | In series; the gate hears the result              | Noise suppression, EQ, compression    | A tail: it holds the gate open, then the gate cuts it |
| `post-gate` | In series; replaces the voice, later effects hear | A radio, a pitch shift, a demon voice |                                                       |
| `send`      | Beside the voice, on a copy; adds to it           | Reverb, delay, echo                   | Whatever changes the voice: both voices are heard     |

The last column is a warning for a UI to show, not a rule. The core refuses
nothing that merely sounds bad. A definition's `tail` is what a UI needs to
warn about the first row.

On a send, the voice never passes through the effect, so a failure or a slow
wake can't touch speech while Channel level is up, and its tail goes straight
to the output bus.

What depends on the place follows it: a `send` always has a wet amount, an
insert only with a declared `latency`; a tail ahead of Mute doesn't hold the
output bus, as Mute cuts it; each place has its own watchdog.

## What each event does

| Event                    | Mute             | Send on/off | Output bus        | What is heard                                       |
| ------------------------ | ---------------- | ----------- | ----------------- | --------------------------------------------------- |
| Speech                   | Open             | Open        | Open              | Voice and effects                                   |
| Voice activity pause     | Open             | Closes      | Open              | The tail rings out, then effects sleep              |
| Always on, pause         | Open             | Closes      | Open              | Room sound passes, without sends; FX channels sleep |
| Push to talk release     | Closes           | Closes      | Open for the tail | The tail rings out, then the bus closes             |
| Mute or deafen           | Closes           | Closes      | Open for the tail | The same, unless the player cuts tails              |
| Unmute during the tail   | Opens            | Follows     | Stays open        | The voice carries on                                |
| GM block, or device lost | Closes           | Closes      | Closes at once    | Silence, whatever the player chose                  |
| The gate can't run       | Follows outbound | Open        | Follows outbound  | Sends stay open, so effects keep working            |

The hold on the output bus lasts as long as the longest declared `tail` of
a running effect, at most 3 s, and only while a tail effect runs. With no
tail effect, the bus closes at once. "Cut reverb and delay when my microphone closes" in the voice
settings makes every release close at once. Nothing said after the Mute
closes can reach an effect, so a tail only carries speech that already went
out.

## When effects run

The browser calls a worklet on every block, so an effect can only skip work
if something decides for it.

- **Hosted effects**: the author writes `render()` and declares a `tail`.
  The core's worklet calls `render()` only while there is sound or a tail
  still ringing. This is the way to write a worklet effect, and the early
  return is built in. It only pays after the gate: ahead of it, a microphone
  is rarely at digital silence.
- **Native nodes**: the browser skips them once their input is silent and
  their tail has passed. The post feed and Send on/off give them that
  silence, driven by the gate on the audio thread, so a busy page can't
  delay it.
  Firefox has no k-rate gains, and a gain following a signal never lets a
  native node sleep there. So in Firefox the post feed stays open and
  native post-gate effects keep running, while Send on/off follows a message
  from the gate: it sleeps, but a busy page can start a reverb late.
- **Worklets an author brings**: these can't be blocked or measured at
  runtime. The effect contract fails one that works on silence, for modules
  that run the contract.

## When an effect goes wrong

Thrown errors aren't enough, so the core also watches the sound.

- Each FX channel's output, before its Return level, is compared with what
  enters the sends. Digital silence while sound goes in counts as a stall.
  A level ratio wouldn't work, because a healthy reverb can be far quieter
  than the voice.
- Post-gate inserts get the same check against the post feed.
- A level far above full scale, or a non-number, counts as a failure at
  once.
- A failed FX channel is silenced as a whole. A failed insert is bypassed.
- If no FX channel is running with a Return level above 0, Channel level
  acts as full, so a player at 0 is never left silent. The core knows that
  at once for an effect that is off or starting, and within the stall time
  for one that went quiet.

## Writing a reverb

A hosted effect is a kernel in a worklet file of its own, and a definition:

```js
// worklet.js: loaded into the audio thread, so it can't import anything.
modularAV.registerAudioKernel(
  "my-reverb",
  class {
    constructor({ sampleRate, options }) {}
    render(input, output) {} // mono Float32Arrays, one block each
    configure(value) {} // optional
  },
);
```

```ts
api.effects.register({
  id: "my-reverb",
  kind: "audio",
  label: "Reverb",
  defaultPlace: "send",
  cost: "medium",
  tail: 2.5, // seconds it keeps sounding: the core keeps rendering that long
  defaultMix: 0.3, // where its wet amount starts
  isSupported: () => "audioWorklet" in AudioContext.prototype,
  create: ({ host }) =>
    host({
      module: api.assetUrl("my-module", "worklet.js"),
      name: "my-reverb",
    }),
});
```

Output only the processed signal: the core adds the dry one. Don't add a
dry:wet control, and don't write an early return. Native nodes work too:
`create` returns their `{ input, output, dispose }`.

## Limits

- Only digital silence, a runaway level and a non-number can be detected.
  An effect that sounds wrong but keeps sounding passes.
- A stall is blamed on the first silent effect of a series, once its time is
  up. If that effect still has a declared tail to wait out, one behind it can
  be blamed first. Effects behind one that `silencesNoise` aren't watched, as
  they may hear exact zeros.
- An effect runs once. Two reverbs at once are two definitions.
- Moving a running effect isn't smoothed: the path changes between two blocks,
  which can click.
- While a tail rings after mute, the player shows as muted. A service's own
  speaking detection may show them speaking for that moment.
- A hung `render()` can't be stopped: it holds the audio thread.
- In Firefox, with Channel level at 0, a busy page can clip the start of
  speech, because the voice then depends on a late Send on/off.
- Each hosted effect has a worklet node of its own. One node for all of
  them would save a little more, and the API doesn't show the difference.
