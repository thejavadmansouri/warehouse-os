import sqlite3
import sys
from pathlib import Path

db = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "AppData/Local/Temp/operator-catalog.db"
c = sqlite3.connect(str(db))
print("count", c.execute("select count(*) from catalog_product where deleted=0").fetchone()[0])
print("--- name/token matches ---")
q = """
select id, name, sku, replace(searchTokens, char(1), ' | ')
from catalog_product
where deleted=0 and (
  name like '%آرم%' or name like '%ارم%' or name like '%آراد%' or name like '%اراد%'
  or searchTokens like '%آرم%' or searchTokens like '%ارم%'
  or searchTokens like '%آراد%' or searchTokens like '%اراد%'
)
limit 25
"""
for r in c.execute(q):
    print(r[0][:8], "|", r[1], "|", r[2], "|", r[3][:180])
