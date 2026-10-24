# battery.ps1 — battery state as JSON lines (2s poll) via kernel32
# GetSystemPowerStatus. Windows counterpart of IOPowerSources polling.
# Output: {"type":"battery","ac":bool,"charging":bool,"percent":int}
param([int]$PollMs = 2000)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct POWER_STATUS {
    public byte ACLineStatus;
    public byte BatteryFlag;
    public byte BatteryLifePercent;
    public byte Reserved1;
    public int BatteryLifeTime;
    public int BatteryFullLifeTime;
}
public static class Pwr {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetSystemPowerStatus(out POWER_STATUS status);
}
'@

function Out-Json($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

while ($true) {
  try {
    $s = New-Object POWER_STATUS
    if ([Pwr]::GetSystemPowerStatus([ref]$s)) {
      $ac = $s.ACLineStatus -eq 1
      $charging = ($s.BatteryFlag -band 8) -ne 0
      $percent = [int]$s.BatteryLifePercent
      Out-Json @{ type = 'battery'; ac = $ac; charging = $charging; percent = $percent }
    } else {
      Out-Json @{ type = 'error'; where = 'battery'; message = 'GetSystemPowerStatus failed' }
    }
  } catch {
    Out-Json @{ type = 'error'; where = 'battery'; message = $_.Exception.Message }
  }
  Start-Sleep -Milliseconds $PollMs
}
