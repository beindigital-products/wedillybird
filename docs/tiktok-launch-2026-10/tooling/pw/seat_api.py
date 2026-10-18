import json, subprocess, sys
E="00000000000000000000010001events"; O="000000000000000000000010000users"
def call(t, path, args):
    body=json.dumps({"type":t,"path":path,"args":args})
    out=subprocess.run(["curl","-s","-m","60","-X","POST","http://127.0.0.1:3210/__test__/call","-H","content-type: application/json","-d",body],capture_output=True,text=True).stdout
    return json.loads(out)
def plan():
    return call("query","seating:getSeatingPlan",{"eventId":E,"requesterId":O})["value"]
def reset():
    for t in plan()["tables"]:
        call("mutation","seating:deleteTable",{"tableId":t["_id"],"requesterId":O})
def mk_table(name=None,capacity=None):
    a={"eventId":E,"requesterId":O}
    if name: a["name"]=name
    if capacity: a["capacity"]=capacity
    return call("mutation","seating:createTable",a)["value"]["tableId"]
def auto(mode=None):
    a={"eventId":E,"requesterId":O}
    if mode: a["mode"]=mode
    return call("mutation","seating:autoAssignGuests",a)
def assign(unit_id, table_id):
    gid,_,mi=unit_id.partition(":")
    return call("mutation","seating:assignSeat",{"eventId":E,"guestId":gid,"memberIndex":int(mi or 0),"tableId":table_id,"requesterId":O})
if __name__=="__main__":
    p=plan()
    print(list(p.keys()))
    print("tables",len(p["tables"]),"unassigned",len(p.get("unassigned",[])))
    for g in p.get("unassigned",[]): print(" ",g["_id"][-8:], g["fullName"], "|", g.get("hostName"), "|", g.get("category"))
