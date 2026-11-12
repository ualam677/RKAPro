/**
 * What a card is for. A card can have several (Afterglow = Extender + Combo piece);
 * none selected means "Other". "Brick" (dead if drawn) and "Never cut" are separate flags.
 */
export const ROLES = ["Starter", "Extender", "Combo piece", "Hand Trap", "Board Breaker"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_COLOURS: Record<string, string> = {
  Starter: "#2f9e44",
  Extender: "#1c7ed6",
  "Combo piece": "#0ca678",
  "Hand Trap": "#ae3ec9",
  "Board Breaker": "#e8590c",
  Brick: "#c92a2a",
  Other: "#868e96",
};

export const ROLE_HELP: Record<string, string> = {
  Starter: "Starts a combo from your hand (or fetches the card that does)",
  Extender: "Continues a combo / gives a second play",
  "Combo piece": "A card the combo uses — fetched, sent or summoned from the Deck, or fetched at the end. Cutting it breaks the lines that use it",
  "Hand Trap": "Interrupts your opponent from your hand",
  "Board Breaker": "Clears or negates a board (mostly for going 2nd)",
};

/** Common TCG hand traps, auto-tagged on import so new users see sensible numbers instantly. */
// Matched by name (via the card DB) so alt-art passcodes work too. Extend freely.
export const KNOWN_HAND_TRAPS = [
  "Ash Blossom & Joyous Spring", 'Maxx "C"', "Droll & Lock Bird", "Nibiru, the Primal Being",
  "Ghost Belle & Haunted Mansion", "Ghost Ogre & Snow Rabbit", "Ghost Mourner & Moonlit Chill",
  "Effect Veiler", "Infinite Impermanence", "PSY-Framegear Gamma", "Mulcharmy Fuwalos",
  "Mulcharmy Purulia", "Dimension Shifter", "D.D. Crow", "Bystial Druiswurm", "Bystial Magnamhut",
  "Dominus Spark", "Dominus Purge", "Dominus Impulse",
];
export const KNOWN_BOARD_BREAKERS = [
  "Harpie's Feather Duster", "Dark Ruler No More", "Evenly Matched", "Lightning Storm",
  "Raigeki", "Forbidden Droplet", "Triple Tactics Talent", "Cosmic Cyclone",
];
