# Headless full-page screenshots of every page (visual checks, PDF guide).
# usage: powershell -File scripts\shots.ps1 <outdir> [baseUrl]
param([string]$Out, [string]$Base = "http://localhost:5180")
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$pages = [ordered]@{
  landing   = "/|1440,2900";
  live      = "/console/live?feed=nomad&t=1659393500|1440,1500";
  map       = "/console/map?t=1659393500|1440,1000";
  budget    = "/console/budget|1440,1300";
  contagion = "/console/contagion|1440,1300";
  signers   = "/console/signers|1440,1300";
  pairing   = "/console/pairing|1440,1500";
  evidence  = "/console/evidence?feed=nomad|1440,1500";
  results   = "/console/results|1440,1800";
  arch      = "/docs/architecture|1440,1800";
}
New-Item -ItemType Directory -Force $Out | Out-Null
foreach ($k in $pages.Keys) {
  $path, $size = $pages[$k].Split("|")
  Start-Process $edge -ArgumentList "--headless=new", "--user-data-dir=$Out\prof", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--window-size=$size", "--virtual-time-budget=15000", "--screenshot=$Out\$k.png", "$Base$path" -Wait
}
Get-ChildItem $Out\*.png | Select-Object Name, Length
