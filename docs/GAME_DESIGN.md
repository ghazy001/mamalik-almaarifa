# Game design

An original fantasy knowledge-and-conquest game for three Arabic-speaking players. The intended loop is: choose a neighboring target, answer a question, resolve ownership, plan the next move. Knowledge determines outcomes; map position determines available choices. Modern Standard Arabic is the default, with future locale dictionaries anticipated but no premature French/English release.

The MVP aims for 10–15-minute matches; M1's 36 turns and timers are provisional and have not been playtested. A correct answer wins a neutral territory. Occupied targets create a shared-question duel. Capturing an original home castle eliminates its owner and transfers their lands. Castle control and a bounded turn limit ensure completion; joint score ties avoid arbitrary seat-based winners. See GAME_RULES for exact precedence.

## Experience foundation

Ink/navy surfaces, teal/sapphire faction accents, restrained gold, locally bundled Noto Sans Arabic, and original geometric heraldry establish the M1 direction. There is no borrowed game branding or artwork. The shell explains the loop and explicitly labels itself a foundation; its links lead to real page sections rather than simulated lobby actions.

`tokens.css` owns colors/radius; Tailwind and a customized shadcn-style Button own reusable interaction styles. Native RTL, logical margins/borders, isolated LTR identifiers, visible focus and a skip link form the accessibility baseline. Decorative heraldry is hidden from assistive technology; critical information is real DOM text. Motion respects reduced-motion preferences. Noto Sans Arabic is supplied by the `@fontsource` package with its bundled open-font license. Radix/shadcn patterns are MIT licensed.

## Milestone boundaries

M1 tests the rules without a renderer. M2 adds a complete offline match with original Phaser isometric terrain, accessible DOM targets and question overlays. Its bots remain explicitly scripted. M3 introduces actual room coordination and timers. Reviewed sourced questions and identity/persistence belong to M4. Audio and the full art pass belong to M5.

No power-up economy, pay-to-win mechanics, live generated questions, public chat or deferred social systems are included. Cosmetic polish must never hide uncertain rules or create a misleading multiplayer claim.
