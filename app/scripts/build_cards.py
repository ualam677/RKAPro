"""
Build src/data/cards.json from EDOPro's card database (ProjectIgnis/BabelCDB)
and TCG banlist (ProjectIgnis/LFLists), so the app works with no network calls.

  git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB /tmp/babel
  git clone --depth 1 https://github.com/ProjectIgnis/LFLists  /tmp/lfl
  python3 scripts/build_cards.py /tmp/babel /tmp/lfl/0TCG.lflist.conf

Output shape (kept tiny):
  { "list": "2026.10 TCG",
    "cards": [[id, name, kind, type, attribute, race, level], ...]
             kind: 1 monster, 2 spell, 3 trap, 4 extra deck; type/attribute/race are EDOPro bitmasks
    "alias": {altArtId: baseId, ...},
    "ban":   {id: 0|1|2, ...} }
"""
import glob, json, os, re, sqlite3, sys

babel, lflist = sys.argv[1], sys.argv[2]
TYPE_MONSTER, TYPE_SPELL, TYPE_TRAP, TYPE_TOKEN = 0x1, 0x2, 0x4, 0x4000
TYPE_EXTRA = 0x40 | 0x2000 | 0x800000 | 0x4000000  # fusion | synchro | xyz | link

files = [os.path.join(babel, "cards.cdb")] + sorted(
    f for f in glob.glob(os.path.join(babel, "*.cdb"))
    if re.search(r"(^|/)(pre)?release-", f) and "rush" not in f
)

cards, alias = {}, {}
for f in files:
    db = sqlite3.connect(f)
    for cid, name, typ, al, attr, race, level in db.execute(
        "select d.id, t.name, d.type, d.alias, d.attribute, d.race, d.level from datas d join texts t on t.id = d.id"
    ):
        if typ & TYPE_TOKEN:
            continue
        if al and abs(cid - al) < 20:  # alt art: same card, different passcode
            alias[cid] = al
            continue
        kind = 4 if typ & TYPE_EXTRA else 1 if typ & TYPE_MONSTER else 2 if typ & TYPE_SPELL else 3 if typ & TYPE_TRAP else 0
        if kind:
            is_mon = bool(typ & TYPE_MONSTER)
            cards[cid] = [cid, name, kind, typ, attr if is_mon else 0, race if is_mon else 0, (level & 0xFF) if is_mon else 0]

ban, list_name = {}, ""
for line in open(lflist, encoding="utf-8"):
    if line.startswith("!") and not list_name:
        list_name = line[1:].strip()
    m = re.match(r"^(\d+)\s+([0-2])\b", line)
    if m:
        ban[int(m.group(1))] = int(m.group(2))

os.makedirs("src/data", exist_ok=True)
out = {"list": list_name, "cards": sorted(cards.values()), "alias": alias, "ban": ban}
with open("src/data/cards.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
print(f"{len(cards)} cards, {len(alias)} alt arts, {len(ban)} banlist entries ({list_name})")
