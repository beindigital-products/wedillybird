import seat_api as A
A.reset()
t=[A.mk_table(f"Table {i}") for i in (1,2,3)]
A.auto()
p=A.plan()
units=[g for tb in p["tables"] for g in tb["assigned"]]+list(p["unassigned"])
names={u["_id"]:u["fullName"] for u in units}
free=[u["_id"] for u in units if u["fullName"] in ("Aïcha Diallo","Ibrahima Diallo","Aicha Diallo")]
rest=[u["_id"] for u in units if u["_id"] not in free]
plan=[(rest[:6],t[0]),(rest[6:9],t[1]),(rest[9:],t[2])]
for ids,tb in plan:
    for uid in ids: A.assign(uid,tb)
for uid in free: A.assign(uid,None)
p=A.plan()
print({"stats":p["stats"],"tables":[(x["name"],x["occupancy"],x["capacity"]) for x in p["tables"]],"unassigned":[g["fullName"] for g in p["unassigned"]]})
