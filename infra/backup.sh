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
# Private evidence files exist only in the private_storage volume; archive them with the same timestamp.
evidence="$destination/testpilot-evidence-$stamp.tar.gz.partial"
docker compose exec -T api sh -c 'mkdir -p storage/app/private/evidence && tar -C storage/app/private -czf - evidence' > "$evidence"
test -s "$evidence"
mv "$evidence" "$destination/testpilot-evidence-$stamp.tar.gz"
printf '%s\n' "Evidence backup complete: testpilot-evidence-$stamp.tar.gz"
