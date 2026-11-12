# Deck knowledge, as taught by the user (Galaxy-Eyes / Photon / Galaxy)

Source of truth for how the user thinks about the deck. Update when corrected. Facts the user stated are marked [U]; my readings of them are marked [?] until confirmed.

## Priorities and objective
- [U] Everything is risk vs reward. A riskier non-Nibiru-proof line can end on a stronger board, but the user now prioritises a Nibiru-proof board, because Nibiru is a strong hand trap even though the deck does decently against it.
- [U] Hand-trap ratio is a tension: draw enough to play going 2nd, or to strengthen the board going 1st, but not so many that you draw all of them and no starters. The user doubts a single point system can capture this.
- Consequence: report several numbers per ratio instead of one score (P(Nibiru-proof board), P(no starter / brick), P(strong board), going-2nd interruption count, how often hand traps are live). Show the trade-off frontier and let the user pick.

## Nibiru-proof definition [U]
- On summon 5 you have Photon Lord on the field, OR Tachyon Dragon on the field so Transmigration is live.
- GORB example: Dragluxion summons Tachyon Dragon, so Transmigration is live. Two level 8s make Photon Lord. Photon Lord is a monster negate, so you climb to Photon Howling.
- Also a success: forcing the opponent to Nibiru on summon 5, because holding it lets you build a negate on summon 6. Model the opponent as choosing fire or hold at each chance, and search both (minimax), not just a fixed K.

## Photon Howling [U]
- Board-wide negate. Needs 3 materials and an Xyz to tribute.
- Not once per turn. With 6 materials it can be used twice, so 2 interruptions instead of 1. Not necessary, but some routes allow it.
- [card text] Each use: detach 3, tribute 1 OTHER Xyz you control, then negate every other face-up card's effects until end of turn. No once-per-turn clause, so two uses need 6 materials AND two other Xyz to tribute. (Ask the user only if a route claims otherwise.)
- [U] 6-material Howling comes from abusing Full Armor's alternate Xyz Summon (over a Galaxy-Eyes Xyz, NOT once per turn). Climb in a loop, e.g. Full Armor -> Antimatter -> Full Armor -> ... Each climb transfers materials and adds the previous Xyz as a material, so the pile grows, then Howling goes over a Rank 8 with the pile. Antimatter's alternate summon needs an Xyz with 3+ materials (once per turn), Full Armor needs a Galaxy-Eyes Xyz other than itself. This is why the user tests 2 Full Armor.
- [card text] Full Armor can attach up to 2 Equip Cards (Photon Orbital) as material and can be built from a Galaxy-Eyes Xyz; Howling can be built over any Rank 8 Xyz and keeps its materials. That is how materials pile up toward 6.
- Value of Howling = floor(materials / 3) negates, limited by Xyz available to tribute. This is why the user tests 2 Full Armor.

## Starters and engine
- Seventh Tachyon [U + card text]: 1.5CC. Reveal Number 101-107 in the Extra Deck (we have N104 and N107), add a Deck monster with the same Type OR Attribute and a Level equal to its Rank, then put 1 card from hand on top of the Deck; no Extra Deck Special Summons except Xyz for the rest of the turn.
  - Reveal N107 (rank 8, LIGHT Dragon): fetches any Level 8 LIGHT or Dragon: Infinity Dragon (DARK Dragon), Orbital 7, GEPD, Primal, Afterglow, Emperor.
  - Reveal N104 (rank 4, LIGHT Spellcaster): fetches any Level 4 LIGHT: Delta Wing, Wizard, Thrasher, War Drake, Photon Orbital, Summoner.
  - Cannot fetch Galaxy Soldier (Level 5), Veiler, Fuwalos, Ash, Ogre. Ash can hit the add.
  - The user usually searches Infinity Dragon, because Infinity can't be used later in a combo (its restriction), so it's best spent as a search. It can also extend.
  - The "place a card on top" is a way to hide a brick.
  - Model: a hand with Seventh Tachyon = a hand with Infinity Dragon, plus extension.
- Prosperity [U]: draw power only (a dig). The user takes it out after winning game 1 (damage nerf).
- Photon Thrasher [U]: a brick alone. Its value is in the GORB combo: it lets you combo without using your Normal Summon. User unsure how this compares with another Galaxy Wizard. Test: what does a free Normal Summon add to the board?
- Galaxy Soldier: 1.5CC with any LIGHT monster in hand.
- Crown: no longer played.

## Bricks and how they unbrick [U]
- Orbital 7 (note: Galaxy Defence Robot Orbital 7, not "Photon Orbital"; check naming): activates from hand if any monster is on the field it can equip to.
- Photon Emperor [U, confirmed by card text]: only unbricks if something can send it to the GY (not from the field) while another Photon/Galaxy monster is on the field or in the GY; then it Special Summons itself and gives an extra Normal Summon for a LIGHT monster. Senders: Galaxy Soldier (its cost sends a LIGHT monster from hand) and Orbital 7 (sends a Photon monster from the Deck; Orbital 7 itself in the GY satisfies the condition). Starliege Photon Blast Dragon only puts it on the field, which is not the same thing.
- Afterglow: needs a Galaxy-Eyes monster on the field.
- GEPD: could be summoned with Starliege, but it is the most annoying brick.
- Rule of thumb: a brick is only dead when there is no starter in hand. The hand-class model already covers this, but the engine should verify the unbrick conditions above on real hands.

## Finish [U]
- Eternal Galaxy ranks up a GPD (which can do nothing on the opponent's turn) into Photon Lord: a monster negate, and it searches a Photon/Galaxy monster for follow-up.
- When siding to go first, the user adds an extra Transmigration and Primal. Primal can be searched off Photon Lord, which gives a second negate for free if Tachyon Dragon is on the field.

## Hand traps and plays-around [U]
- Ash hits: add from Deck to hand, Special Summon from Deck, send from Deck to GY.
- Ash on Dragluxion's search: play through it. Its other effect (detach 2, Special Summon a 3000-ATK Rank 8 Dragon Xyz from the Extra Deck) is not hit by Ash.
- Ash on Infinity Dragon: its single effect is the Deck Special Summon, and the self-summon is part of the same effect, so Ash leaves Infinity stuck in hand and kills the line. Bait the Ash first with Seventh Tachyon (an add from Deck), then play Infinity. Orbital 7, Photon Orbital, Galaxy Photon Dragon, Photon Lord's search and Prosperity are other Ash targets.
- Costs still pay out when an effect is negated. If Afterglow is attached to Dragluxion and detached as its cost, Afterglow's trigger still resolves (GEPD summoned or attached) even if Dragluxion's effect gets Ashed or Imperm'd. Ash most likely hits Dragluxion's search; its detach effect is separate and goes through.
- If Dragluxion itself is Imperm'd: go straight to Photon Howling (can be built over any Rank 8 Xyz) and carry on from there.
- Ash on Infinity Dragon: it becomes a dead card, but it costs no Normal Summon and has no LIGHT-only lock, so the rest of the turn is intact (Orbital 7 and Delta Wing do lock you to LIGHT, and Infinity is DARK).
- Ordering rule: Infinity Dragon always goes before Orbital 7's effect (after Orbital 7 you can't Special Summon a DARK Infinity). Infinity is always the first card played among starters.
- Opponent hand traps to play around: Droll, Nibiru, Ash, Imperm, Dominus cards, whatever is meta.

## Sideboard [U] — PARKED
- Main deck has Imperm as its only non-engine hand trap. Side deck comes in for game 2 after winning game 1.
- Do NOT work on siding or tech cards yet. The user says it depends on the meta and even the local area. Revisit only after I understand where the deck is weak and how to compensate for it, and the user brings it up.

## Rulings
- [U, corrected] Galaxy-Eyes Antimatter Dragon's detach effect can NOT be activated turn 1 (needs a possible Battle Phase). EDOPro is right; YGO Omega wrongly allows it, so Omega replays may contain illegal plays. The user's Soldier replay used it (detach Starliege → War Drake Deck→GY). YGO_OMEGA_RULINGS=1 copies Omega only for replaying.
- General: when a replay step fails in EDOPro, check the card script before assuming the follower is wrong, and tell the user — Omega can be wrong.

## Ratio decisions so far
- [U+maths] Keep 1 Wizard + 1 Thrasher over 2 Wizard. Wizard alone = GORB combo minus the late Delta Wing body (Starliege etc.). Thrasher's job is mostly as Orbital 7's Deck target (NS-free route keeps the NS for Delta at the end). 2nd Wizard only cuts no-starter hands 8.6% → 7.1%.
- Soldier needs another LIGHT in hand (2nd Soldier, Veiler, Ogre, any LIGHT monster; ~16 LIGHTs in the 43). Soldier with no LIGHT ≈ 0.2% of hands — Soldier practically never bricks. Count Soldier as a starter only with another LIGHT.
- [engine] Thrasher + any Level 4 (incl. Mulcharmy Fuwalos) → Galaxy Photon Dragon; with Eternal Galaxy in hand reaches a full board. Summoner/War Drake/Thrasher + Photon Orbital = full board (Orbital equips from hand).
- [model] Each starter ↔ hand trap swap costs ~1.5% full boards and ~3% Nibiru-proof boards, gains ~4% "full board + 2 hand traps" and ~4% "≥2 hand traps going 2nd".

## Hand-trap play (engine-tested)
- Infinity Dragon must come first: once you control a monster its summon condition fails, so leading with anything else lets Ash wait and strand Infinity.
- Seventh Tachyon's put-back: return a hand trap or a brick, never the backup starter.
- One-starter hands: Ash on the starter's first search ends the turn. Delta lines have three such points (Delta, GPD's search, the Orb7 it fetches). From Photon Lord onward, Lord negates Ash.
