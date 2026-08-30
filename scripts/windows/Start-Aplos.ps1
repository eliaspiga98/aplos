param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Aplos-Common.ps1")
Assert-AplosWindows

$forwardArguments = @()
if ($NoBrowser) { $forwardArguments += "-NoBrowser" }
if (Request-AplosElevation $PSCommandPath $forwardArguments) { exit }

Initialize-AplosDirectories
Update-AplosPath

if (Test-AplosHttp "$script:AplosUrl/api/health") {
  Write-Host "Aplo's e gia avviato."
  if (-not $NoBrowser) { Start-Process $script:AplosUrl }
  exit 0
}

$envFile = Join-Path $script:AplosRoot ".env"
if (-not (Test-Path $envFile)) {
  throw "Prima configurazione non eseguita. Usa 'Aplos Launcher.cmd' e premi 'Prima configurazione'."
}

$node = Get-AplosCommand "node.exe"
$npm = Get-AplosCommand "npm.cmd"
$ollama = Get-AplosCommand "ollama.exe"
if (-not $node -or -not $npm -or -not $ollama) {
  throw "Mancano Node.js o Ollama. Esegui di nuovo la Prima configurazione."
}

Write-Host "==> Avvio del database"
$postgresService = Get-AplosPostgresService
if (-not $postgresService) { throw "Servizio PostgreSQL non trovato. Esegui di nuovo la Prima configurazione." }
if ($postgresService.Status -ne "Running") {
  Start-Service -Name $postgresService.Name
  $postgresService.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
  Set-Content -Path (Join-Path $script:AplosRuntime "postgres-started-by-aplos.txt") -Value $postgresService.Name -Encoding ASCII
}

Write-Host "==> Avvio di Ollama"
if (-not (Wait-AplosHttp "$script:OllamaUrl/api/tags" 5)) {
  $ollamaOut = Join-Path $script:AplosLogs "ollama-out.log"
  $ollamaErr = Join-Path $script:AplosLogs "ollama-error.log"
  $ollamaProcess = Start-Process -FilePath $ollama -ArgumentList @("serve") -WindowStyle Hidden -RedirectStandardOutput $ollamaOut -RedirectStandardError $ollamaErr -PassThru
  Set-Content -Path (Join-Path $script:AplosRuntime "ollama.pid") -Value $ollamaProcess.Id -Encoding ASCII
  if (-not (Wait-AplosHttp "$script:OllamaUrl/api/tags" 30)) {
    throw "Ollama non risponde. Controlla $ollamaErr"
  }
}

$tags = Invoke-RestMethod -Uri "$script:OllamaUrl/api/tags" -TimeoutSec 10
$installed = @($tags.models | ForEach-Object { $_.name })
if ($installed -notcontains $script:AplosModel) {
  Write-Host "==> Primo download del modello AI (circa 6,6 GB)"
  Invoke-AplosNative $ollama @("pull", $script:AplosModel)
}

$apiBuild = Join-Path $script:AplosRoot "api\dist\server.js"
$webBuild = Join-Path $script:AplosRoot "web\dist\index.html"
$revisionFile = Join-Path $script:AplosRuntime "build-revision.txt"
$currentRevision = Get-AplosGitRevision
$builtRevision = if (Test-Path $revisionFile) { (Get-Content $revisionFile -Raw).Trim() } else { $null }
if (-not (Test-Path $apiBuild) -or -not (Test-Path $webBuild) -or ($currentRevision -and $currentRevision -ne $builtRevision)) {
  Write-Host "==> Aggiornamento automatico di Aplo's"
  Push-Location $script:AplosRoot
  try {
    Invoke-AplosNative $npm @("ci")
    Invoke-AplosNative $npm @("run", "build")
  } finally {
    Pop-Location
  }
  Write-AplosBuildRevision
}

Write-Host "==> Aggiornamento del database"
Push-Location $script:AplosRoot
try {
  Invoke-AplosNative $npm @("run", "migrate")
} finally {
  Pop-Location
}

Write-Host "==> Avvio di Aplo's"
$apiOut = Join-Path $script:AplosLogs "aplos-out.log"
$apiErr = Join-Path $script:AplosLogs "aplos-error.log"
$apiProcess = Start-Process -FilePath $node -ArgumentList @("--env-file=.env", "api/dist/server.js") -WorkingDirectory $script:AplosRoot -WindowStyle Hidden -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
Set-Content -Path (Join-Path $script:AplosRuntime "api.pid") -Value $apiProcess.Id -Encoding ASCII

if (-not (Wait-AplosHttp "$script:AplosUrl/api/health" 45)) {
  $details = if (Test-Path $apiErr) { (Get-Content $apiErr -Tail 20 | Out-String) } else { "Nessun dettaglio disponibile." }
  throw "Aplo's non si e avviato. Dettagli:`n$details"
}

Write-Host "Aplo's e pronto: $script:AplosUrl"
if (-not $NoBrowser) { Start-Process $script:AplosUrl }
