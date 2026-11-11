#!/bin/sh
# Invoke from infra/ with a private backup directory as argument.
set -eu
umask 077
destination=${1:?Pass an existing private backup directory}
test -d "$destination"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$destination/testpilot-$stamp.dump.partial"
docker compose exec -T database pg_dump -U postgres -d testpilot -Fc > "$temporary"
test -s "$temporary"
mv "$temporary" "$destination/testpilot-$stamp.dump"
printf '%s\n' "Database backup complete: testpilot-$stamp.dump"
