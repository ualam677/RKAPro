// The Soldier replay only reproduces with Omega's (wrong) Antimatter ruling; node --test gives this file its own process.
import { golden } from "./golden.mjs";
process.env.YGO_OMEGA_RULINGS = "1";
await golden([3]);
