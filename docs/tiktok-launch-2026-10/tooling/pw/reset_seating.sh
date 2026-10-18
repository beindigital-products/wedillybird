#!/bin/bash
E=00000000000000000000010001events; O=000000000000000000000010000users
call() { curl -s -m 60 -X POST http://127.0.0.1:3210/__test__/call -H 'content-type: application/json' -d "$1"; }
ids=$(call "{\"type\":\"query\",\"path\":\"seating:getSeatingPlan\",\"args\":{\"eventId\":\"$E\",\"requesterId\":\"$O\"}}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(t['_id'] for t in d['value']['tables']))")
for id in $ids; do call "{\"type\":\"mutation\",\"path\":\"seating:deleteTable\",\"args\":{\"tableId\":\"$id\",\"requesterId\":\"$O\"}}" >/dev/null; done
echo "tables left: $(call "{\"type\":\"query\",\"path\":\"seating:getSeatingPlan\",\"args\":{\"eventId\":\"$E\",\"requesterId\":\"$O\"}}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['value']['tables']))")"
