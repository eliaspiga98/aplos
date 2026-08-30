$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Aplos-Common.ps1")
Assert-AplosWindows
if (Request-AplosElevation $PSCommandPath) { exit }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object Windows.Forms.Form
$form.Text = "Aplo's"
$form.Size = New-Object Drawing.Size(470, 410)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [Drawing.Color]::FromArgb(246, 248, 250)

$title = New-Object Windows.Forms.Label
$title.Text = "Aplo's"
$title.Font = New-Object Drawing.Font("Segoe UI", 24, [Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object Drawing.Point(28, 20)
$form.Controls.Add($title)

$subtitle = New-Object Windows.Forms.Label
$subtitle.Text = "Gestionale locale con intelligenza artificiale"
$subtitle.Font = New-Object Drawing.Font("Segoe UI", 10)
$subtitle.AutoSize = $true
$subtitle.Location = New-Object Drawing.Point(31, 65)
$form.Controls.Add($subtitle)

$status = New-Object Windows.Forms.Label
$status.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
$status.AutoSize = $true
$status.Location = New-Object Drawing.Point(31, 100)
$form.Controls.Add($status)

$network = New-Object Windows.Forms.Label
$network.Font = New-Object Drawing.Font("Segoe UI", 9)
$network.AutoSize = $false
$network.Size = New-Object Drawing.Size(400, 38)
$network.Location = New-Object Drawing.Point(31, 122)
$form.Controls.Add($network)

function Update-LauncherStatus {
  $lanUrls = @(Get-AplosLanUrls)
  if ($lanUrls.Count -gt 0) {
    $network.Text = "Indirizzo per gli altri PC: $($lanUrls[0])"
  } else {
    $network.Text = "Indirizzo di rete non disponibile"
  }

  if (Test-AplosHttp "$script:AplosUrl/api/health" 1) {
    $status.Text = "Stato: pronto"
    $status.ForeColor = [Drawing.Color]::FromArgb(30, 130, 76)
  } else {
    $status.Text = "Stato: chiuso"
    $status.ForeColor = [Drawing.Color]::FromArgb(120, 120, 120)
  }
}

function New-LauncherButton([string]$Text, [int]$X, [int]$Y, [int]$Width) {
  $button = New-Object Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object Drawing.Point($X, $Y)
  $button.Size = New-Object Drawing.Size($Width, 45)
  $button.Font = New-Object Drawing.Font("Segoe UI", 10)
  return $button
}

function Run-LauncherScript([string]$Name) {
  if ($script:actionProcess -and -not $script:actionProcess.HasExited) {
    [Windows.Forms.MessageBox]::Show("Attendi il completamento dell'operazione in corso.", "Aplo's", "OK", "Information") | Out-Null
    return
  }

  $status.Text = "Operazione in corso..."
  $status.ForeColor = [Drawing.Color]::FromArgb(31, 78, 121)
  $form.Refresh()
  $path = Join-Path $PSScriptRoot $Name
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$path`""
  $script:actionProcess = Start-Process "powershell.exe" -ArgumentList $arguments -WorkingDirectory $script:AplosRoot -PassThru
}

$setupButton = New-LauncherButton "Prima configurazione / Aggiorna" 30 165 400
$setupButton.Add_Click({ Run-LauncherScript "Install-Aplos.ps1" })
$form.Controls.Add($setupButton)

$startButton = New-LauncherButton "Avvia Aplo's" 30 225 190
$startButton.Add_Click({ Run-LauncherScript "Start-Aplos.ps1" })
$form.Controls.Add($startButton)

$openButton = New-LauncherButton "Apri Aplo's" 240 225 190
$openButton.Add_Click({
  if (Test-AplosHttp "$script:AplosUrl/api/health" 2) {
    Start-Process $script:AplosUrl
  } else {
    [Windows.Forms.MessageBox]::Show("Aplo's e chiuso. Premi prima 'Avvia Aplo's'.", "Aplo's", "OK", "Information") | Out-Null
  }
})
$form.Controls.Add($openButton)

$copyButton = New-LauncherButton "Copia indirizzo rete" 30 285 190
$copyButton.Add_Click({
  $lanUrls = @(Get-AplosLanUrls)
  if ($lanUrls.Count -gt 0) {
    [Windows.Forms.Clipboard]::SetText($lanUrls[0])
    [Windows.Forms.MessageBox]::Show("Indirizzo copiato: $($lanUrls[0])", "Aplo's", "OK", "Information") | Out-Null
  } else {
    [Windows.Forms.MessageBox]::Show("Nessun indirizzo di rete disponibile.", "Aplo's", "OK", "Warning") | Out-Null
  }
})
$form.Controls.Add($copyButton)

$stopButton = New-LauncherButton "Chiudi tutto" 240 285 190
$stopButton.Add_Click({ Run-LauncherScript "Stop-Aplos.ps1" })
$form.Controls.Add($stopButton)

Update-LauncherStatus
$script:actionProcess = $null
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({
  if ($script:actionProcess) {
    if ($script:actionProcess.HasExited) {
      $exitCode = $script:actionProcess.ExitCode
      $script:actionProcess.Dispose()
      $script:actionProcess = $null
      Update-LauncherStatus
      if ($exitCode -ne 0) {
        [Windows.Forms.MessageBox]::Show("L'operazione non e riuscita. Controlla la finestra dei dettagli oppure var\logs.", "Aplo's", "OK", "Error") | Out-Null
      }
    }
  } else {
    Update-LauncherStatus
  }
})
$timer.Start()

[void]$form.ShowDialog()
$timer.Stop()
