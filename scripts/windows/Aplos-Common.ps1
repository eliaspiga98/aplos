Set-StrictMode -Version 2.0

$script:AplosRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:AplosStateRoot = Join-Path $env:ProgramData "Aplos"
$script:AplosRuntime = Join-Path $script:AplosStateRoot "runtime"
$script:AplosLogs = Join-Path $script:AplosStateRoot "logs"
$script:AplosDefaultConfigDirectory = Join-Path $script:AplosStateRoot "config"
$script:AplosDefaultUploads = Join-Path $script:AplosStateRoot "uploads"
$script:AplosDefaultBackups = Join-Path $script:AplosStateRoot "backups"
$script:AplosConfigPointer = Join-Path $script:AplosStateRoot "config-location.txt"
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
  New-Item -ItemType Directory -Force -Path $script:AplosStateRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $script:AplosRuntime | Out-Null
  New-Item -ItemType Directory -Force -Path $script:AplosLogs | Out-Null
  New-Item -ItemType Directory -Force -Path $script:AplosDefaultConfigDirectory | Out-Null
  New-Item -ItemType Directory -Force -Path $script:AplosDefaultUploads | Out-Null
  New-Item -ItemType Directory -Force -Path $script:AplosDefaultBackups | Out-Null

  # Migrazione trasparente dalle vecchie versioni, nelle quali configurazione
  # e allegati vivevano dentro il repository. Copiamo (non cancelliamo) per
  # mantenere l'operazione recuperabile.
  $legacyEnv = Join-Path $script:AplosRoot ".env"
  $defaultEnv = Join-Path $script:AplosDefaultConfigDirectory ".env"
  $migrationMarker = Join-Path $script:AplosStateRoot "legacy-storage-migrated.txt"
  if ((Test-Path $legacyEnv) -and -not (Test-Path $defaultEnv) -and -not (Test-Path $script:AplosConfigPointer)) {
    Copy-Item -LiteralPath $legacyEnv -Destination $defaultEnv
  }
  $legacyUploads = Join-Path $script:AplosRoot "var\uploads"
  if ((Test-Path $legacyUploads) -and -not (Test-Path $migrationMarker)) {
    Get-ChildItem -LiteralPath $legacyUploads -Force -ErrorAction SilentlyContinue |
      Copy-Item -Destination $script:AplosDefaultUploads -Recurse -Force -ErrorAction Stop
    Set-Content -Path $migrationMarker -Value (Get-Date -Format "o") -Encoding ASCII
  }
  $legacyBackups = Join-Path $script:AplosRoot "var\backups"
  $backupMigrationMarker = Join-Path $script:AplosStateRoot "legacy-backups-migrated.txt"
  if ((Test-Path $legacyBackups) -and -not (Test-Path $backupMigrationMarker)) {
    Get-ChildItem -LiteralPath $legacyBackups -Force -ErrorAction SilentlyContinue |
      Copy-Item -Destination $script:AplosDefaultBackups -Recurse -Force -ErrorAction Stop
    Set-Content -Path $backupMigrationMarker -Value (Get-Date -Format "o") -Encoding ASCII
  }

  # Anche un semplice "Avvia" dopo l'aggiornamento deve usare le nuove
  # cartelle persistenti, senza obbligare l'utente a rilanciare l'installer.
  if ((Test-Path $defaultEnv) -and -not (Test-Path $script:AplosConfigPointer)) {
    $legacyUploadsForEnv = $legacyUploads.Replace("\", "/")
    $configuredUploads = Get-Content $defaultEnv | Where-Object { $_ -like "UPLOADS_DIR=*" } | Select-Object -First 1
    if (-not $configuredUploads -or $configuredUploads.Substring(12).Replace("\", "/") -eq $legacyUploadsForEnv) {
      $null = Set-AplosEnvValue $defaultEnv "UPLOADS_DIR" ($script:AplosDefaultUploads.Replace("\", "/"))
    }
    $null = Set-AplosEnvValue $defaultEnv "APLOS_DEFAULT_BACKUP_DIR" ($script:AplosDefaultBackups.Replace("\", "/"))
  }
}

function Get-AplosEnvFile {
  if (Test-Path $script:AplosConfigPointer) {
    $pointed = (Get-Content $script:AplosConfigPointer -Raw).Trim()
    if ($pointed -and (Test-Path $pointed)) { return $pointed }
  }
  return (Join-Path $script:AplosDefaultConfigDirectory ".env")
}

function Invoke-AplosDatabaseScript([string]$ScriptName, [string]$EnvFile) {
  $tsx = Join-Path $script:AplosRoot "node_modules\.bin\tsx.cmd"
  if (-not (Test-Path $tsx)) { throw "Runtime TypeScript non trovato. Esegui npm ci." }
  $target = switch ($ScriptName) {
    "migrate" { "api/src/db/migrate.ts" }
    "seed" { "api/src/db/seed.ts" }
    default { throw "Script database non supportato: $ScriptName" }
  }
  Invoke-AplosNative $tsx @("--env-file=$EnvFile", $target)
}

function Set-AplosEnvValue([string]$Path, [string]$Key, [string]$Value) {
  if (-not (Test-Path $Path)) {
    return $false
  }

  $lines = @(Get-Content $Path)
  $prefix = "$Key="
  $replacement = "$prefix$Value"
  $found = $false
  $changed = $false

  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index].StartsWith($prefix, [StringComparison]::Ordinal)) {
      $found = $true
      if ($lines[$index] -ne $replacement) {
        $lines[$index] = $replacement
        $changed = $true
      }
    }
  }

  if (-not $found) {
    $lines += $replacement
    $changed = $true
  }

  if ($changed) {
    [IO.File]::WriteAllLines($Path, [string[]]$lines, (New-Object Text.UTF8Encoding($false)))
  }
  return $changed
}

function Enable-AplosLanFirewall {
  $ruleName = "Aplos-Web-LAN-3001"
  $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($rule) {
    $rule | Set-NetFirewallRule -Enabled True -Action Allow -Profile Any | Out-Null
    $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 3001 | Out-Null
    $rule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress LocalSubnet | Out-Null
    return
  }

  New-NetFirewallRule `
    -Name $ruleName `
    -DisplayName "Aplo's - accesso web dalla rete locale" `
    -Description "Consente l'accesso ad Aplo's sulla porta TCP 3001 soltanto dalla sottorete locale." `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 3001 `
    -RemoteAddress LocalSubnet `
    -Profile Any | Out-Null
}

function Get-AplosLanUrls {
  $addresses = @()
  $ipConfigurations = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPv4DefaultGateway -and
      $_.IPv4Address -and
      $_.InterfaceAlias -notlike "*vEthernet*" -and
      $_.InterfaceAlias -notlike "*VPN*" -and
      $_.InterfaceAlias -notlike "*Loopback*" -and
      $_.InterfaceAlias -notlike "*Bluetooth*"
    }

  foreach ($configuration in $ipConfigurations) {
    foreach ($address in $configuration.IPv4Address) {
      if ($address.IPAddress -and $address.IPAddress -notlike "169.254.*") {
        $addresses += $address.IPAddress
      }
    }
  }

  if ($addresses.Count -eq 0) {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
      Where-Object {
        -not $_.SkipAsSource -and
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notlike "169.254.*"
      } |
      ForEach-Object { $_.IPAddress }
  }

  return @($addresses | Select-Object -Unique | ForEach-Object { "http://$($_):3001" })
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
      Sort-Object @{ Expression = { [int]($_.Name -replace '\D.*$', '') }; Descending = $true } |
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
