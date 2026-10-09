# One headless screenshot with GPU (WebGL renders). usage: shot.ps1 <out.png> <url> [w,h]
param([string]$Out, [string]$Url, [string]$Size = "1440,900")
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$prof = Join-Path $env:TEMP ("bwshot_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$p = Start-Process $edge -ArgumentList "--headless=new", "--user-data-dir=$prof", "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--hide-scrollbars", "--window-size=$Size", "--virtual-time-budget=20000", "--run-all-compositor-stages-before-draw", "--screenshot=$Out", $Url -PassThru
$p.WaitForExit(90000) | Out-Null
Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
