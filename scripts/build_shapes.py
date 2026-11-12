"""Convert the AISC Shapes Database v16.0 workbook into the app's JSON dataset.

Usage:  python3 -m pip install openpyxl && python3 scripts/build_shapes.py
Input:  data-source/aisc-shapes-database-v16.0.xlsx  (sheet "Database v16.0")
Output: src/data/aisc-shapes-v16.json

US customary columns only (A..CF); metric values are derived in-app from
unit factors. The metric designation (column CH) is kept for display.
"""
import json
import pathlib
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data-source" / "aisc-shapes-database-v16.0.xlsx"
OUT = ROOT / "src" / "data" / "aisc-shapes-v16.json"

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["Database v16.0"]
rows = ws.iter_rows(values_only=True)
header = list(next(rows))
US_END = header.index("WGo") + 1  # last US customary column
METRIC_LABEL_COL = header.index("AISC_Manual_Label", US_END)

TEXT = {"Type", "EDI_Std_Nomenclature", "AISC_Manual_Label", "T_F"}
RENAME = {"Type": "type", "EDI_Std_Nomenclature": "edi", "AISC_Manual_Label": "label", "T_F": "note"}

shapes = []
strays = set()
for row in rows:
    if not row or not row[0]:
        continue
    rec = {}
    for key, val in zip(header[:US_END], row[:US_END]):
        if val is None or val == "–" or val == "-":
            continue
        if key in TEXT:
            rec[RENAME[key]] = str(val).strip()
        elif isinstance(val, (int, float)):
            rec[key] = val
        else:
            try:
                rec[key] = float(val)
            except ValueError:
                strays.add((key, val))
    rec["note"] = rec.get("note") == "T"
    if not rec["note"]:
        del rec["note"]
    ml = row[METRIC_LABEL_COL]
    if ml and ml != "–":
        rec["metricLabel"] = str(ml).strip()
    shapes.append(rec)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(shapes, separators=(",", ":"), ensure_ascii=False))
print(f"wrote {len(shapes)} shapes -> {OUT.relative_to(ROOT)}")
if strays:
    print("non-numeric values skipped:", sorted(strays)[:20])
