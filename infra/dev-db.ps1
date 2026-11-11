param(
    [ValidateSet('start', 'stop', 'status')][string]$Action = 'start',
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $root '.local\postgres'
if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) { throw 'Local cluster missing. See docs/DEVELOPMENT_SETUP.md.' }
$pgctl = Join-Path $PostgresBin 'pg_ctl.exe'
switch ($Action) {
    'start' { & $pgctl -D $data -l (Join-Path $root '.local\postgres.log') -o '-h 127.0.0.1 -p 55432' start }
    'stop' { & $pgctl -D $data -m fast stop }
    'status' { & $pgctl -D $data status }
}
exit $LASTEXITCODE
