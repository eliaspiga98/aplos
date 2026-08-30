Set-StrictMode -Version 2.0

$script:AplosRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:AplosRuntime = Join-Path $script:AplosRoot "var\runtime"
$script:AplosLogs = Join-Path $script:AplosRoot "var\logs"
$script:AplosUrl = "http://127.0.0.1:3001"
$script:OllamaUrl = "http://127.0.0.1:11434"
$script:AplosModel = "qwen3.5:9b-q4_K_M"

function Assert-AplosWindows {
  if ($env:OS -ne "Windows_NT") {
    throw "Questi script sono destinati a Windows."
  }
}

function Test-AplosAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Request-AplosElevation([string]$ScriptPath, [string[]]$Arguments = @()) {
  if (Test-AplosAdministrator) {
    return $false
  }

  $quotedScript = $ScriptPath.Replace('"', '\"')
  $argumentLine = "-NoProfile -ExecutionPolicy Bypass -File `"$quotedScript`""
  foreach ($argument in $Arguments) {
    $argumentLine += " `"$($argument.Replace('"', '\"'))`""
  }

  Start-Process -FilePath "powershell.exe" -ArgumentList $argumentLine -Verb RunAs
  return $true
}

function Initialize-AplosDirectories {
  New-Item -ItemType Directory -Force -Path $script:AplosRuntime | Out-Null
  New-Item -ItemType Directory -Force -Path $script:AplosLogs | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $script:AplosRoot "var\uploads") | Out-Null
}

function Update-AplosPath {
  $paths = @(
    [Environment]::GetEnvironmentVariable("Path", "Machine"),
    [Environment]::GetEnvironmentVariable("Path", "User"),
    (Join-Path $env:ProgramFiles "nodejs"),
    (Join-Path $env:LOCALAPPDATA "Programs\Ollama")
  )

  $postgresRoot = Join-Path $env:ProgramFiles "PostgreSQL"
  if (Test-Path $postgresRoot) {
    $postgresBins = Get-ChildItem $postgresRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName "bin" }
    $paths += $postgresBins
  }

  $env:Path = ($paths | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique) -join ";"
}

function Get-AplosCommand([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  return $null
}

function Get-AplosPostgresService {
  return Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "postgresql*" -or $_.DisplayName -like "PostgreSQL*" } |
    Sort-Object Name -Descending |
    Select-Object -First 1
}

function Test-AplosHttp([string]$Url, [int]$TimeoutSeconds = 3) {
  try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds
    return $true
  } catch {
    return $false
  }
}

function Wait-AplosHttp([string]$Url, [int]$TimeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-AplosHttp $Url 2) {
      return $true
    }
    Start-Sleep -Milliseconds 750
  }
  return $false
}

function Invoke-AplosNative([string]$Program, [string[]]$Arguments) {
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Comando fallito: $Program $($Arguments -join ' ') (codice $LASTEXITCODE)"
  }
}

function Get-AplosGitRevision {
  $git = Get-AplosCommand "git.exe"
  if (-not $git) {
    $git = Get-AplosCommand "git"
  }
  if (-not $git) {
    return $null
  }

  $revision = & $git -C $script:AplosRoot rev-parse HEAD 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }
  return ($revision | Out-String).Trim()
}

function Write-AplosBuildRevision {
  $revision = Get-AplosGitRevision
  if ($revision) {
    Set-Content -Path (Join-Path $script:AplosRuntime "build-revision.txt") -Value $revision -Encoding ASCII
  }
}
