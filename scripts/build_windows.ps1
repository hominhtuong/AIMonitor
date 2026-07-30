# Đóng gói AI Monitor trên Windows: tạo shortcut có icon ở Desktop + Start Menu.
# Chạy:  powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ico  = Join-Path $root 'assets\icon.ico'
$vbs  = Join-Path $root 'AIMonitor.vbs'

if (-not (Test-Path $ico)) {
  Write-Host 'Chua co assets\icon.ico - dang sinh logo...'
  & python (Join-Path $root 'scripts\make_icons.py') | Out-Null
}

function New-Shortcut($path) {
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($path)
  $sc.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
  $sc.Arguments        = "`"$vbs`""
  $sc.WorkingDirectory = $root
  $sc.IconLocation     = $ico
  $sc.Description      = 'AI Monitor - theo doi tien trinh va agent AI tren may'
  $sc.Save()
  Write-Host "Da tao shortcut: $path"
}

New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'AI Monitor.lnk')

$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
if (Test-Path $startMenu) { New-Shortcut (Join-Path $startMenu 'AI Monitor.lnk') }

Write-Host ''
Write-Host 'Xong. Double-click "AI Monitor" tren Desktop de chay (khong hien cua so console).'
Write-Host 'Muon chay trong terminal:  run.cmd'
