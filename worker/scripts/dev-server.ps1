param(
  [Parameter(Position = 0)][string]$Action = 'spike',
  [int]$Port = 8787,
  [int]$MaxLifetimeSeconds = 180,
  [int]$ReadyTimeoutSeconds = 90,
  [string]$ClientCommand = 'node scripts\spike-client.mjs',
  [string]$SpikeUrl = ''
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerRoot = Split-Path -Parent $ScriptDir
Set-Location $WorkerRoot
$StateDir = Join-Path $WorkerRoot '.spike'
$LogFile = Join-Path $StateDir 'server.log'
$PidFile = Join-Path $StateDir 'server.pid'

function Test-PortListening {
  param([int]$P)
  try {
    $null = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction Stop
    return $true
  } catch { return $false }
}

function Get-PortOwnerPid {
  param([int]$P)
  try {
    $conn = Get-NetTCPConnection -LocalPort $P -State Listen -ErrorAction Stop | Select-Object -First 1
    return [int]$conn.OwningProcess
  } catch { return 0 }
}

function Read-PidFile {
  if (Test-Path $PidFile) {
    try { return [int](Get-Content $PidFile -TotalCount 1) } catch { return 0 }
  }
  return 0
}

function Stop-ServerTree {
  $stored = Read-PidFile
  if ($stored -gt 0) {
    cmd /c "taskkill /PID $stored /T /F >nul 2>&1" | Out-Null
  }
  if (Test-PortListening $Port) {
    $owner = Get-PortOwnerPid $Port
    if ($owner -gt 0 -and $owner -ne $PID) {
      cmd /c "taskkill /PID $owner /T /F >nul 2>&1" | Out-Null
    }
  }
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
}

function Start-Watchdog {
  param([int]$ServerPid, [int]$Lifetime)
  $cmd = 'Start-Sleep -Seconds ' + $Lifetime + '; cmd /c "taskkill /PID ' + $ServerPid + ' /T /F >nul 2>&1"'
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $cmd | Out-Null
}

function Start-Server {
  if (Test-PortListening $Port) {
    Write-Output "ERR: port $Port already in use; run 'dev-server.ps1 stop' first"
    exit 2
  }
  if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir | Out-Null }
  Set-Content -Path $LogFile -Value '' -Encoding ASCII
  $startArgs = "/c npx wrangler dev --port $Port >`"$LogFile`" 2>&1"
  $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList $startArgs -WorkingDirectory $WorkerRoot -WindowStyle Hidden -PassThru
  Set-Content -Path $PidFile -Value $proc.Id
  Start-Watchdog -ServerPid $proc.Id -Lifetime $MaxLifetimeSeconds
  Write-Output "started pid=$($proc.Id) log=$LogFile watchdog=${MaxLifetimeSeconds}s"
}

function Wait-Ready {
  param([int]$ServerPid)
  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-PortListening $Port) { return $true }
    $alive = $true
    try { $null = Get-Process -Id $ServerPid -ErrorAction Stop } catch { $alive = $false }
    if (-not $alive) {
      Write-Output 'ERR: server process exited before opening port'
      if (Test-Path $LogFile) { Get-Content $LogFile -Tail 15 | ForEach-Object { Write-Output $_ } }
      return $false
    }
  }
  Write-Output "ERR: timeout waiting for port $Port after ${ReadyTimeoutSeconds}s"
  return $false
}

switch ($Action.ToLower()) {
  'start' {
    Start-Server
    if (Wait-Ready -ServerPid (Read-PidFile)) {
      Write-Output "READY on $Port (auto-kill in ${MaxLifetimeSeconds}s unless stopped)"
      exit 0
    }
    Stop-ServerTree
    exit 1
  }
  'stop' {
    Stop-ServerTree
    Start-Sleep -Milliseconds 300
    if (Test-PortListening $Port) { Write-Output "ERR: port $Port still listening"; exit 1 }
    Write-Output 'stopped'
    exit 0
  }
  'status' {
    $p = Read-PidFile
    if (Test-PortListening $Port) { Write-Output "running (port $Port, pidfile=$p)" } else { Write-Output 'not running' }
    exit 0
  }
  'spike' {
    Start-Server
    $pidNow = Read-PidFile
    if (-not (Wait-Ready -ServerPid $pidNow)) { Stop-ServerTree; exit 1 }
    $clientCode = 1
    try {
      Write-Host '[spike] server ready; running client'
      if ($SpikeUrl -ne '') { $env:SPIKE_URL = $SpikeUrl }
      $prevEap = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      $out = & cmd.exe /c "$ClientCommand" 2>&1
      $ErrorActionPreference = $prevEap
      $clientCode = $LASTEXITCODE
      Write-Host "[spike] client exit=$clientCode"
      $out | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Output $_.ToString() }
        else { Write-Output $_ }
      }
    } finally {
      Write-Host '[spike] stopping server'
      Stop-ServerTree
    }
    if ($clientCode -ne 0) {
      Write-Output '--- server log tail ---'
      if (Test-Path $LogFile) { Get-Content $LogFile -Tail 40 | ForEach-Object { Write-Output $_ } }
    }
    exit $clientCode
  }
  default {
    Write-Output "unknown action '$Action'; use start|stop|status|spike"
    exit 2
  }
}
