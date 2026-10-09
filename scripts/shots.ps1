# Headless full-page screenshots of the console pages for visual checks.
# usage: powershell -File scripts\shots.ps1 <outdir> [baseUrl]
param([string]$Out, [string]$Base = "http://localhost:5180")
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$pages = [ordered]@{
  landing  = "/";
  usps     = "/console/usps";
  evidence = "/console/evidence?feed=nomad";
  evback   = "/console/evidence?feed=nomad&show=backed";
  results  = "/console/results";
  live     = "/console/live?feed=nomad&t=1659394800";
  arch     = "/docs/architecture";
}
New-Item -ItemType Directory -Force $Out | Out-Null
foreach ($k in $pages.Keys) {
  Start-Process $edge -ArgumentList "--headless=new", "--user-data-dir=$Out\prof", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--window-size=1440,2400", "--virtual-time-budget=12000", "--screenshot=$Out\$k.png", "$Base$($pages[$k])" -Wait
}
Get-ChildItem $Out\*.png | Select-Object Name, Length
