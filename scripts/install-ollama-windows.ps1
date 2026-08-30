param(
  [string]$Model = "qwen3.5:9b-q4_K_M",
  [string]$OllamaUrl = "http://127.0.0.1:11434"
)

$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  throw "Questo script e destinato a Windows. Su macOS/Linux usa Ollama o MLX seguendo deploy/DEPLOY.md."
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  throw "Ollama non trovato. Installa OllamaSetup.exe da https://ollama.com/download/windows e riapri PowerShell."
}

Write-Host "==> Verifica GPU NVIDIA"
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
} else {
  Write-Warning "nvidia-smi non trovato: aggiorna il driver NVIDIA prima di usare il modello."
}

Write-Host "==> Scarico il modello Ollama: $Model"
ollama pull $Model
if ($LASTEXITCODE -ne 0) {
  throw "Download del modello fallito (exit code $LASTEXITCODE)."
}

Write-Host "==> Provo l'API Ollama con thinking disabilitato"
$payload = @{
  model = $Model
  messages = @(@{ role = "user"; content = "Rispondi solo con ok." })
  stream = $false
  think = $false
  keep_alive = -1
  options = @{ temperature = 0.1; num_predict = 4 }
} | ConvertTo-Json -Depth 6

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "$OllamaUrl/api/chat" `
  -ContentType "application/json" `
  -Body $payload

if (-not $response.message.content) {
  throw "Ollama risponde, ma il modello non ha restituito contenuto."
}

Write-Host "OK: $($response.message.content.Trim())"
Write-Host ""
Write-Host "Configura Aplo's da Impostazioni > Modello AI:"
Write-Host "  Provider: Ollama"
Write-Host "  Modello:  $Model"
Write-Host "  URL:      $OllamaUrl"
Write-Host ""
Write-Host "Per verificare che l'inferenza usi la GPU: ollama ps"
