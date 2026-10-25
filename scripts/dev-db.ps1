# Start / stop / back up the project-local development PostgreSQL cluster (port 5433).
# Usage:  .\scripts\dev-db.ps1 start | stop | status | backup
param([ValidateSet('start', 'stop', 'status', 'backup')][string]$Action = 'start')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$data = Join-Path $root '.pgdata'

switch ($Action) {
  'start'  { & "$pgBin\pg_ctl.exe" -D $data -l (Join-Path $data 'server.log') -o '-p 5433 -c listen_addresses=localhost' start }
  'stop'   { & "$pgBin\pg_ctl.exe" -D $data stop }
  'status' { & "$pgBin\pg_ctl.exe" -D $data status }
  'backup' {
    $envFile = Join-Path $root 'backend\.env'
    $url = (Get-Content $envFile | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
    $dir = Join-Path $root 'backups'
    New-Item -ItemType Directory -Force $dir | Out-Null
    $file = Join-Path $dir ("pruspect-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    & "$pgBin\pg_dump.exe" --format=custom --no-owner --dbname=$url --file=$file
    Write-Output "Backup written: $file"
  }
}
