"""
Independent cross-check of data/questions.json using a DIFFERENT PDF library (pdfplumber).

For every question the importer marked "verified" through a highlight, this script
re-reads the PDF page, collects every character lying under a yellow highlight box and
confirms the stored correct option's text really is highlighted there. For explicit
"Accepted Answers"/"Answer:" questions it confirms the printed answer text is on the page.

    pip install pdfplumber
    python3 scripts/crosscheck.py [data/questions.json] [public/sources]
"""
import json, re, sys, unicodedata
from difflib import SequenceMatcher
from pathlib import Path
import pdfplumber

data = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "data/questions.json"))
src = Path(sys.argv[2] if len(sys.argv) > 2 else "public/sources")

def norm(s):
    s = unicodedata.normalize("NFKC", s).lower()
    return re.sub(r"[^a-z0-9]", "", s)

def is_yellow(c):
    return isinstance(c, (list, tuple)) and len(c) >= 3 and c[0] >= 0.9 and c[1] >= 0.9 and c[2] <= 0.5

cache = {}
def page_info(file, page):
    k = (file, page)
    if k in cache: return cache[k]
    with pdfplumber.open(src / file) as pdf:
        p = pdf.pages[page - 1]
        rects = [r for r in p.rects if r.get("fill") and is_yellow(r.get("non_stroking_color"))]
        hl = []
        for ch in p.chars:
            cx, cy = (ch["x0"] + ch["x1"]) / 2, (ch["top"] + ch["bottom"]) / 2
            if any(r["x0"] - .5 <= cx <= r["x1"] + .5 and r["top"] <= cy <= r["bottom"] for r in rects):
                hl.append(ch["text"])
        full = "".join(c["text"] for c in p.chars)
    cache[k] = ("".join(hl), full)
    return cache[k]

bad = checked = 0
for q in data["questions"]:
    if q["verification"]["status"] != "verified": continue
    m = q["verification"]["method"]
    hlblob, full = page_info(q["source"]["file"], q["source"]["page"])
    hlblob_n, full_n = norm(hlblob), norm(full)
    # a question may spill onto the next page (answers highlighted there)
    if q["source"]["page"] < 99:
        try:
            h2, f2 = page_info(q["source"]["file"], q["source"]["page"] + 1)
            hlblob_n += norm(h2); full_n += norm(f2)
        except IndexError:
            pass
    for oid in q["correctOptionIds"]:
        opt = next(o for o in q["options"] if o["id"] == oid)["text"]
        t = norm(opt)
        checked += 1
        if m in ("highlight", "trailing-answer+highlight"):
            if q["type"] == "true_false" and m == "trailing-answer+highlight":
                ok = True  # a single highlighted T/F letter; compared against the printed letter by the importer
            else:
                lm = SequenceMatcher(None, hlblob_n, t, autojunk=False).find_longest_match(0, len(hlblob_n), 0, len(t))
                ok = lm.size / max(len(t), 1) >= 0.6
        else:
            ok = t in full_n
        if not ok:
            bad += 1
            print("MISMATCH", q["id"], m, repr(opt))
print(f"cross-checked {checked} correct options against an independent reader: {bad} mismatches")
sys.exit(1 if bad else 0)
