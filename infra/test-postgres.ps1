$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$saved = @{}
try {
    foreach ($line in Get-Content (Join-Path $root '.local\database.env')) {
        if ($line -match '^([^=]+)=(.*)$') {
            $saved[$Matches[1]] = [Environment]::GetEnvironmentVariable($Matches[1], 'Process')
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
        }
    }
    $env:DB_DATABASE = 'testpilot_test'
    Push-Location (Join-Path $root 'backend')
    try { php artisan test; $result = $LASTEXITCODE } finally { Pop-Location }
} finally {
    foreach ($key in $saved.Keys) {
        if ($null -eq $saved[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    }
}
exit $result
