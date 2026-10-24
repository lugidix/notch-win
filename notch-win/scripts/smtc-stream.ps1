# smtc-stream.ps1 — Windows counterpart of boring.notch's mediaremote-adapter.
# Streams System Media Transport Controls (SMTC) state as JSON lines on stdout
# (1 Hz) and accepts playback commands over a localhost TCP socket (polling the
# listener with Pending() keeps the loop non-blocking).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File smtc-stream.ps1 [-PollMs 1000] [-Port 0]
param(
  [int]$PollMs = 500,
  [int]$Port = 0
)

$ErrorActionPreference = 'Continue'
# UTF-8 on the redirected stdout pipe — otherwise accents come out as OEM garbage.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# --- artwork helper (compiled once, cached) ----------------------------------
# PowerShell 5.1 cannot consume the IRandomAccessStream COM object directly,
# so a tiny pure-WinRT C# helper (csc.exe ships with Windows) reads it.
$HelperDir = Join-Path $env:TEMP 'notch-win'
$HelperDll = Join-Path $HelperDir 'SmtcArtHelper.dll'
if (-not (Test-Path $HelperDll)) {
  New-Item -ItemType Directory -Force -Path $HelperDir | Out-Null
  $HelperCs = Join-Path $HelperDir 'SmtcArtHelper.cs'
  @'
using System;
using System.IO;
using System.Threading.Tasks;
using Windows.Storage.Streams;

public static class SmtcArtHelper {
    public static byte[] ReadAll(object thumbRef) {
        var thumb = (IRandomAccessStreamReference)thumbRef;
        var stream = Wait(thumb.OpenReadAsync());
        var reader = new DataReader(stream);
        var ms = new MemoryStream();
        while (true) {
            uint n = Wait(reader.LoadAsync(65536));
            if (n == 0) break;
            var buf = new byte[n];
            reader.ReadBytes(buf);
            ms.Write(buf, 0, (int)n);
        }
        return ms.ToArray();
    }

    private static T Wait<T>(Windows.Foundation.IAsyncOperation<T> op) {
        var tcs = new TaskCompletionSource<T>();
        op.Completed = (o, status) => {
            if (status == Windows.Foundation.AsyncStatus.Completed) tcs.SetResult(o.GetResults());
            else tcs.SetException(new InvalidOperationException("winrt status: " + status));
        };
        return tcs.Task.GetAwaiter().GetResult();
    }
}
'@ | Set-Content -Path $HelperCs -Encoding ASCII
  $csc = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  $winmd1 = Join-Path $env:windir 'System32\WinMetadata\Windows.Storage.winmd'
  $winmd2 = Join-Path $env:windir 'System32\WinMetadata\Windows.Foundation.winmd'
  $fwDir = Split-Path $csc
  & $csc /nologo /target:library "/out:$HelperDll" "/r:$(Join-Path $fwDir 'System.Runtime.dll')" "/r:$winmd1" "/r:$winmd2" $HelperCs | Out-Null
}
try { [void][Reflection.Assembly]::LoadFrom($HelperDll) } catch { }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function AwaitOp($winRtOp, $resultType) {
  $netTask = $AsTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($winRtOp))
  $netTask.Wait()
  return $netTask.Result
}

function Out-Json($obj) {
  $json = $obj | ConvertTo-Json -Compress -Depth 5
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

# --- command channel ---------------------------------------------------------
$Listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$Listener.Start()
$ActualPort = $Listener.LocalEndpoint.Port
Out-Json @{ type = 'ready'; port = $ActualPort }

function Invoke-Command($line) {
  $req = $line | ConvertFrom-Json
  $sessions = @($Manager.GetSessions())
  if ($sessions.Count -eq 0) { return }
  $session = $Manager.CurrentSession
  if ($null -eq $session) { $session = $sessions[0] }
  switch ($req.cmd) {
    'play' { [void](AwaitOp ($session.TryPlayAsync()) ([bool])) }
    'pause' { [void](AwaitOp ($session.TryPauseAsync()) ([bool])) }
    'togglePlay' {
      # No TryTogglePlayAsync in the SMTC API — inspect the current status.
      $st = [int]$session.GetPlaybackInfo().PlaybackStatus
      if ($st -eq 4) { [void](AwaitOp ($session.TryPauseAsync()) ([bool])) }
      else { [void](AwaitOp ($session.TryPlayAsync()) ([bool])) }
    }
    'next' { [void](AwaitOp ($session.TrySkipNextAsync()) ([bool])) }
    'previous' { [void](AwaitOp ($session.TrySkipPreviousAsync()) ([bool])) }
    'seek' {
      $ticks = [int64]([double]$req.value * 1e7)
      $before = [math]::Round($session.GetTimelineProperties().Position.TotalSeconds, 1)
      [void](AwaitOp ($session.TryChangePlaybackPositionAsync($ticks)) ([bool]))
      $script:SeekCheck = @{ src = $session.SourceAppUserModelId; req = [double]$req.value; before = $before; deadline = (Get-Date).AddSeconds(4) }
    }
  }
}

# --- manager -----------------------------------------------------------------
$Manager = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
  ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-ArtB64($props) {
  if ($null -eq $props.Thumbnail) { return $null }
  try {
    $bytes = [SmtcArtHelper]::ReadAll($props.Thumbnail)
    if ($bytes -and $bytes.Length -gt 0) {
      return [Convert]::ToBase64String($bytes)
    }
    return $null
  } catch { return $null }
}

$LastTrackKey = $null
$SeekFailedBySource = @{}
$SeekCheck = $null

while ($true) {
  try {
    # non-blocking command intake — one connection per command; never block the
    # polling loop (a blocking ReadLine here would freeze media streaming).
    while ($Listener.Pending()) {
      $client = $Listener.AcceptTcpClient()
      try {
        $ms = New-Object System.IO.MemoryStream
        $buf = New-Object byte[] 4096
        $deadline = [DateTime]::UtcNow.AddMilliseconds(500)
        while ([DateTime]::UtcNow -lt $deadline) {
          if ($client.Available -gt 0) {
            $n = $client.GetStream().Read($buf, 0, $buf.Length)
            if ($n -le 0) { break }
            $ms.Write($buf, 0, $n)
            if ([Text.Encoding]::UTF8.GetString($ms.ToArray()).Contains("`n")) { break }
          } else {
            Start-Sleep -Milliseconds 20
          }
        }
        $line = [Text.Encoding]::UTF8.GetString($ms.ToArray()).Trim()
        if ($line) { Invoke-Command $line }
      } catch { Out-Json @{ type = 'error'; where = 'command'; message = $_.Exception.Message } }
      finally { $client.Close() }
    }

    $sessions = @($Manager.GetSessions())
    $session = $Manager.CurrentSession
    if ($null -eq $session) {
      foreach ($s in $sessions) {
        if ([int]$s.GetPlaybackInfo().PlaybackStatus -eq 4) { $session = $s; break } # Playing
      }
    }
    if ($null -eq $session -and $sessions.Count -gt 0) { $session = $sessions[0] }

    if ($null -eq $session) {
      $LastTrackKey = $null
$SeekFailedBySource = @{}
$SeekCheck = $null
      Out-Json @{ type = 'media'; status = 'idle'; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    } else {
      $props = AwaitOp ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $timeline = $session.GetTimelineProperties()
      $info = $session.GetPlaybackInfo()
      $statusNum = [int]$info.PlaybackStatus
      $status = switch ($statusNum) {
        4 { 'playing'; break }
        5 { 'paused'; break }
        3 { 'stopped'; break }
        default { 'paused'; break }
      }

      # seek-support detection: 4s after a seek, if playback simply continued
      # from the old position, the source ignored the command.
      if ($SeekCheck -and (Get-Date) -gt $SeekCheck.deadline) {
        $posNow = [math]::Round($timeline.Position.TotalSeconds, 1)
        $expectedCont = $SeekCheck.before + 4
        if ($status -eq 'playing' -and [math]::Abs($posNow - $expectedCont) -lt 2.5) {
          $SeekFailedBySource[$SeekCheck.src] = $true
        }
        $SeekCheck = $null
      }

      $trackKey = "$($props.Title)|$($props.Artist)|$($props.AlbumTitle)"
      $payload = @{
        type = 'media'
        status = $status
        ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        sourceId = $session.SourceAppUserModelId
        track = @{
          title = [string]$props.Title
          artist = [string]$props.Artist
          album = [string]$props.AlbumTitle
          positionSec = [math]::Round($timeline.Position.TotalSeconds, 3)
          durationSec = [math]::Round($timeline.EndTime.TotalSeconds, 3)
          rate = 1.0
        }
        seekable = -not $SeekFailedBySource.ContainsKey($session.SourceAppUserModelId)
      }
      if ($trackKey -ne $LastTrackKey) {
        $LastTrackKey = $trackKey
        $b64 = Get-ArtB64 $props
        if ($b64) { $payload.artB64 = $b64 }
      }
      Out-Json $payload
    }
  } catch {
    Out-Json @{ type = 'error'; where = 'poll'; message = $_.Exception.Message }
  }
  Start-Sleep -Milliseconds $PollMs
}
