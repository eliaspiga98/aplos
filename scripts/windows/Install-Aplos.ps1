param(
  [switch]$SkipPrerequisites,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Aplos-Common.ps1")
Assert-AplosWindows

$forwardArguments = @()
if ($SkipPrerequisites) { $forwardArguments += "-SkipPrerequisites" }
if ($NoStart) { $forwardArguments += "-NoStart" }
if (Request-AplosElevation $PSCommandPath $forwardArguments) { exit }

Initialize-AplosDirectories
Update-AplosPath

function Install-WingetPackage([string]$Id, [string]$Label, [switch]$Interactive) {
  Write-Host "==> Installazione di $Label"
  $arguments = @("install", "--id", $Id, "-e", "--accept-package-agreements", "--accept-source-agreements")
  if ($Interactive) {
    $arguments += "--interactive"
  } else {
    $arguments += "--silent"
  }
  Invoke-AplosNative "winget.exe" $arguments
  Update-AplosPath
}

if (-not $SkipPrerequisites) {
  if (-not (Get-AplosCommand "winget.exe")) {
    Start-Process "ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1"
    throw "Windows Package Manager non e disponibile. Installa 'App Installer' dalla finestra aperta e riprova."
  }

  if (-not (Get-AplosCommand "node.exe")) {
    Install-WingetPackage "OpenJS.NodeJS.LTS" "Node.js LTS"
  }

  if (-not (Get-AplosCommand "ollama.exe")) {
    Install-WingetPackage "Ollama.Ollama" "Ollama"
  }

  if (-not (Get-AplosPostgresService)) {
    Write-Host ""
    Write-Host "PostgreSQL mostrera una breve installazione guidata."
    Write-Host "Lascia le opzioni predefinite e conserva la password scelta."
    Install-WingetPackage "PostgreSQL.PostgreSQL.17" "PostgreSQL 17" -Interactive
    Set-Content -Path (Join-Path $script:AplosRuntime "postgres-managed-by-aplos.txt") -Value "installed-by-aplos" -Encoding ASCII
  }
}

Update-AplosPath
$node = Get-AplosCommand "node.exe"
$npm = Get-AplosCommand "npm.cmd"
$ollama = Get-AplosCommand "ollama.exe"
$psql = Get-AplosCommand "psql.exe"
$createdb = Get-AplosCommand "createdb.exe"
$postgresService = Get-AplosPostgresService

if (-not $node -or -not $npm) { throw "Node.js non trovato. Riapri Windows e riprova la configurazione." }
if (-not $ollama) { throw "Ollama non trovato. Riapri Windows e riprova la configurazione." }
if (-not $psql -or -not $createdb -or -not $postgresService) {
  throw "PostgreSQL non trovato. Completa l'installazione di PostgreSQL 17 e riprova."
}

if (Get-AplosCommand "nvidia-smi.exe") {
  Write-Host "==> GPU NVIDIA rilevata"
  & nvidia-smi.exe --query-gpu=name,memory.total,driver_version --format=csv,noheader
} else {
  Write-Warning "GPU NVIDIA non rilevata. Aggiorna il driver NVIDIA prima di usare il modello AI."
}

if ($postgresService.Status -ne "Running") {
  Start-Service -Name $postgresService.Name
  $postgresService.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  Set-Content -Path (Join-Path $script:AplosRuntime "postgres-started-by-aplos.txt") -Value $postgresService.Name -Encoding ASCII
}

$envFile = Join-Path $script:AplosRoot ".env"
if (-not (Test-Path $envFile)) {
  Write-Host ""
  Write-Host "Serve solo la password scelta durante l'installazione di PostgreSQL."
  $securePassword = Read-Host "Password dell'utente postgres" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $postgresPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }

  $env:PGPASSWORD = $postgresPassword
  try {
    Invoke-AplosNative $psql @("-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1;")

    function New-HexSecret([int]$Bytes) {
      $buffer = New-Object byte[] $Bytes
      $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
      try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
      return ([BitConverter]::ToString($buffer)).Replace("-", "").ToLowerInvariant()
    }

    $appPassword = New-HexSecret 24
    $readonlyPassword = New-HexSecret 24
    $jwtSecret = New-HexSecret 48

    $appRole = (& $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='aplos';" | Out-String).Trim()
    if ($appRole -eq "1") {
      Invoke-AplosNative $psql @("-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "ALTER ROLE aplos WITH LOGIN PASSWORD '$appPassword';")
    } else {
      Invoke-AplosNative $psql @("-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE ROLE aplos LOGIN PASSWORD '$appPassword';")
    }

    $readonlyRole = (& $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='aplos_readonly';" | Out-String).Trim()
    if ($readonlyRole -eq "1") {
      Invoke-AplosNative $psql @("-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "ALTER ROLE aplos_readonly WITH LOGIN PASSWORD '$readonlyPassword';")
    } else {
      Invoke-AplosNative $psql @("-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE ROLE aplos_readonly LOGIN PASSWORD '$readonlyPassword';")
    }

    $database = (& $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='aplos';" | Out-String).Trim()
    if ($database -ne "1") {
      Invoke-AplosNative $createdb @("-h", "127.0.0.1", "-U", "postgres", "-O", "aplos", "aplos")
    }

    $rootForEnv = $script:AplosRoot.Replace("\", "/")
    $environment = @"
DATABASE_URL=postgresql://aplos:$appPassword@127.0.0.1:5432/aplos
READONLY_DATABASE_URL=postgresql://aplos_readonly:$readonlyPassword@127.0.0.1:5432/aplos
API_HOST=0.0.0.0
API_PORT=3001
JWT_SECRET=$jwtSecret
SESSION_TTL_SECONDS=28800
COOKIE_SECURE=false
WEB_ORIGIN=http://127.0.0.1:3001
VITE_API_BASE_URL=
UPLOADS_DIR=$rootForEnv/var/uploads
UPLOAD_MAX_BYTES=52428800
NODE_ENV=production
"@
    [IO.File]::WriteAllText($envFile, $environment, (New-Object Text.UTF8Encoding($false)))
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $postgresPassword = $null
  }
} else {
  Write-Host "==> Configurazione .env gia presente: viene conservata"
  $null = Set-AplosEnvValue $envFile "API_HOST" "0.0.0.0"
  $null = Set-AplosEnvValue $envFile "COOKIE_SECURE" "false"
}

Write-Host "==> Configurazione dell'accesso dalla rete locale"
Enable-AplosLanFirewall

Write-Host "==> Installazione delle dipendenze Aplo's"
Push-Location $script:AplosRoot
try {
  Invoke-AplosNative $npm @("ci")
  Invoke-AplosNative $npm @("run", "build")
  Invoke-AplosNative $npm @("run", "migrate")
  Invoke-AplosNative $npm @("run", "seed")
} finally {
  Pop-Location
}
Write-AplosBuildRevision

try {
  # I grant vengono applicati anche alle tabelle appena create dalle migrazioni.
  $databaseUrl = (Get-Content $envFile | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1).Substring(13)
  Invoke-AplosNative $psql @($databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", "GRANT CONNECT ON DATABASE aplos TO aplos_readonly; GRANT USAGE ON SCHEMA public TO aplos_readonly; GRANT SELECT ON ALL TABLES IN SCHEMA public TO aplos_readonly; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO aplos_readonly;")
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "==> Creazione dei collegamenti sul Desktop"
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
foreach ($shortcutData in @(
  @{ Name = "Aplo's.lnk"; Target = "Aplos Launcher.cmd" },
  @{ Name = "Avvia Aplo's.lnk"; Target = "Avvia Aplos.cmd" },
  @{ Name = "Chiudi Aplo's.lnk"; Target = "Chiudi Aplos.cmd" }
)) {
  $shortcut = $shell.CreateShortcut((Join-Path $desktop $shortcutData.Name))
  $shortcut.TargetPath = Join-Path $script:AplosRoot $shortcutData.Target
  $shortcut.WorkingDirectory = $script:AplosRoot
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,14"
  $shortcut.Save()
}

Write-Host ""
Write-Host "Configurazione completata. Utente iniziale: Admin - PIN: 0000"
Write-Warning "Cambia il PIN 0000 al primo accesso."

if (-not $NoStart) {
  & (Join-Path $PSScriptRoot "Start-Aplos.ps1")
}
