$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Aplos-Common.ps1")
Assert-AplosWindows
if (Request-AplosElevation $PSCommandPath) { exit }

Initialize-AplosDirectories
Update-AplosPath

Write-Host "==> Chiusura di Aplo's"
$apiPidFile = Join-Path $script:AplosRuntime "api.pid"
if (Test-Path $apiPidFile) {
  $apiPid = [int](Get-Content $apiPidFile -Raw).Trim()
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $apiPid" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -match "api[\\/]dist[\\/]server\.js") {
    & taskkill.exe /PID $apiPid /T /F | Out-Null
  } elseif ($process) {
    Write-Warning "PID Aplo's non valido: il processo non viene chiuso."
  }
  Remove-Item $apiPidFile -Force -ErrorAction SilentlyContinue
}

Write-Host "==> Scaricamento del modello AI dalla GPU"
$ollama = Get-AplosCommand "ollama.exe"
if ($ollama -and (Test-AplosHttp "$script:OllamaUrl/api/tags")) {
  & $ollama stop $script:AplosModel 2>$null
}

$ollamaPidFile = Join-Path $script:AplosRuntime "ollama.pid"
if (Test-Path $ollamaPidFile) {
  $ollamaPid = [int](Get-Content $ollamaPidFile -Raw).Trim()
  $ollamaProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ollamaPid" -ErrorAction SilentlyContinue
  if ($ollamaProcess -and $ollamaProcess.Name -like "ollama*") {
    & taskkill.exe /PID $ollamaPid /T /F | Out-Null
  } elseif ($ollamaProcess) {
    Write-Warning "PID Ollama non valido: il processo non viene chiuso."
  }
  Remove-Item $ollamaPidFile -Force -ErrorAction SilentlyContinue
}

$postgresFlag = Join-Path $script:AplosRuntime "postgres-started-by-aplos.txt"
$postgresManaged = Join-Path $script:AplosRuntime "postgres-managed-by-aplos.txt"
if ((Test-Path $postgresFlag) -or (Test-Path $postgresManaged)) {
  $serviceName = if (Test-Path $postgresFlag) {
    (Get-Content $postgresFlag -Raw).Trim()
  } else {
    $managedService = Get-AplosPostgresService
    if ($managedService) { $managedService.Name } else { $null }
  }
  $service = if ($serviceName) { Get-Service -Name $serviceName -ErrorAction SilentlyContinue } else { $null }
  if ($service -and $service.Status -eq "Running") {
    Write-Host "==> Arresto del database avviato da Aplo's"
    Stop-Service -Name $serviceName
    $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
  }
  Remove-Item $postgresFlag -Force -ErrorAction SilentlyContinue
}

Write-Host "Aplo's e stato chiuso."
