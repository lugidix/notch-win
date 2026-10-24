# fullscreen.ps1 — foreground fullscreen detection (1s poll), Windows
# counterpart of FullscreenMediaDetection. Emits:
# {"type":"fullscreen","fullscreen":bool,"process":"name"}
param([int]$PollMs = 1000)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public static class Win {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr h, ref MONITORINFO i);
    [StructLayout(LayoutKind.Sequential)]
    public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@

function Out-Json($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

while ($true) {
  try {
    $h = [Win]::GetForegroundWindow()
    $fs = $false
    $proc = ''
    if ($h -ne [IntPtr]::Zero) {
      $r = New-Object RECT
      [void][Win]::GetWindowRect($h, [ref]$r)
      $mi = New-Object Win+MONITORINFO
      $mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
      $mon = [Win]::MonitorFromWindow($h, 1) # MONITOR_DEFAULTTONEAREST
      if ($mon -ne [IntPtr]::Zero -and [Win]::GetMonitorInfo($mon, [ref]$mi)) {
        $ww = $r.Right - $r.Left
        $wh = $r.Bottom - $r.Top
        $mw = $mi.rcMonitor.Right - $mi.rcMonitor.Left
        $mh = $mi.rcMonitor.Bottom - $mi.rcMonitor.Top
        $workW = $mi.rcWork.Right - $mi.rcWork.Left
        $workH = $mi.rcWork.Bottom - $mi.rcWork.Top
        # fullscreen: covers ~the whole MONITOR; maximized: covers ~the WORK
        # area (monitor minus taskbar) — both block the content under the pill.
        $isFull = $ww -ge [int]($mw * 0.98) -and $wh -ge [int]($mh * 0.98) -and $mw -gt 0
        $isMax = $workW -gt 0 -and $workH -gt 0 -and $ww -ge [int]($workW * 0.98) -and $wh -ge [int]($workH * 0.98)
        if ($isFull -or $isMax) { $fs = $true }
      }
      $pid2 = 0
      [void][Win]::GetWindowThreadProcessId($h, [ref]$pid2)
      if ($pid2 -gt 0) { $proc = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName }
      # the desktop shell is not "an app in fullscreen"
      if ($proc -eq 'explorer') { $fs = $false }
    }
    Out-Json @{ type = 'fullscreen'; fullscreen = $fs; maximized = $isMax; process = $proc }
  } catch {
    Out-Json @{ type = 'error'; where = 'fullscreen'; message = $_.Exception.Message }
  }
  Start-Sleep -Milliseconds $PollMs
}
