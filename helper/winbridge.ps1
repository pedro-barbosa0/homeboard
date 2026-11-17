# Homeboard window bridge: one PowerShell kept running by the helper (server.js), so Windows calls are quick.
# It reads one JSON request per line and answers one line: <<HBR:{json}>>
# It can list Start apps, monitors and windows, launch an app, give an app's icon, and move a window.
# It never closes or types into anything.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

namespace HB {
  public class Screen { public int index, x, y, w, h, wx, wy, ww, wh, dpi; public bool primary; }
  public class Win { public long hwnd; public string title; public int pid; public string exe; public int x, y, w, h; public bool min, max; }

  public static class Native {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    delegate bool MonProc(IntPtr m, IntPtr dc, ref RECT r, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public int dwFlags; }
    [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public short bmPlanes, bmBitsPixel; public IntPtr bmBits; }

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc p, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO i);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr m, int type, out uint x, out uint y);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr p, int flags, StringBuilder s, ref int n);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)] static extern void SHCreateItemFromParsingName(string path, IntPtr bc, ref Guid riid, out IShellItemImageFactory item);
    [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, out BITMAP b);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);

    [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemImageFactory { void GetImage(SIZE size, int flags, out IntPtr bmp); }

    public static void DpiAware() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } }   // real pixels on every monitor

    public static List<Screen> Screens() {
      var list = new List<Screen>();
      EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr dc, ref RECT r, IntPtr l) => {
        var i = new MONITORINFO(); i.cbSize = Marshal.SizeOf(i);
        GetMonitorInfo(m, ref i);
        uint dx = 96, dy = 96; try { GetDpiForMonitor(m, 0, out dx, out dy); } catch { }
        list.Add(new Screen { index = list.Count, x = i.rcMonitor.L, y = i.rcMonitor.T, w = i.rcMonitor.R - i.rcMonitor.L, h = i.rcMonitor.B - i.rcMonitor.T,
          wx = i.rcWork.L, wy = i.rcWork.T, ww = i.rcWork.R - i.rcWork.L, wh = i.rcWork.B - i.rcWork.T, dpi = (int)dx, primary = (i.dwFlags & 1) != 0 });
        return true;
      }, IntPtr.Zero);
      list.Sort((a, b) => a.primary == b.primary ? a.x - b.x : (a.primary ? -1 : 1));
      for (int k = 0; k < list.Count; k++) list[k].index = k;
      return list;
    }

    static string ExeOf(int pid) {
      IntPtr p = OpenProcess(0x1000, false, pid);       // PROCESS_QUERY_LIMITED_INFORMATION
      if (p == IntPtr.Zero) return "";
      try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(p, 0, sb, ref n) ? sb.ToString() : ""; }
      finally { CloseHandle(p); }
    }
    static RECT Frame(IntPtr h) {                       // the visible frame, without the invisible resize borders
      RECT r; if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(h, out r); return r;
    }

    /* Windows a person would call "open": visible, titled, not owned, not tool windows, not hidden by the shell. */
    public static List<Win> Windows() {
      var list = new List<Win>();
      EnumWindows((h, l) => {
        if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;        // GW_OWNER
        if ((GetWindowLong(h, -20) & 0x80) != 0) return true;                            // WS_EX_TOOLWINDOW
        int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
        int len = GetWindowTextLength(h); if (len == 0) return true;
        var sb = new StringBuilder(len + 1); GetWindowText(h, sb, sb.Capacity);
        int pid; GetWindowThreadProcessId(h, out pid);
        var r = Frame(h);
        list.Add(new Win { hwnd = h.ToInt64(), title = sb.ToString(), pid = pid, exe = ExeOf(pid), x = r.L, y = r.T, w = r.R - r.L, h = r.B - r.T, min = IsIconic(h), max = IsZoomed(h) });
        return true;
      }, IntPtr.Zero);
      return list;
    }

    /* Put a window's visible frame exactly on x,y,w,h (real pixels). */
    public static bool Place(long hwnd, int x, int y, int w, int h, bool front) {
      var hw = new IntPtr(hwnd);
      if (!IsWindow(hw)) return false;
      if (IsIconic(hw) || IsZoomed(hw)) ShowWindow(hw, 9);                                // SW_RESTORE
      RECT outer; GetWindowRect(hw, out outer); var vis = Frame(hw);
      int dl = vis.L - outer.L, dt = vis.T - outer.T, dr = outer.R - vis.R, db = outer.B - vis.B;
      bool ok = SetWindowPos(hw, IntPtr.Zero, x - dl, y - dt, w + dl + dr, h + dt + db, 0x0004 | 0x0010);   // NOZORDER | NOACTIVATE
      if (front) SetForegroundWindow(hw);
      return ok;
    }
    public static bool Front(long hwnd) { var hw = new IntPtr(hwnd); if (IsIconic(hw)) ShowWindow(hw, 9); return SetForegroundWindow(hw); }

    /* The icon Windows shows for a file, folder, or Start app ("shell:AppsFolder\<AppID>"), as PNG. */
    public static string Icon(string target, int size) {
      var guid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
      IShellItemImageFactory f; SHCreateItemFromParsingName(target, IntPtr.Zero, ref guid, out f);
      IntPtr hb; f.GetImage(new SIZE { cx = size, cy = size }, 0, out hb);
      try {
        BITMAP b; GetObject(hb, Marshal.SizeOf(typeof(BITMAP)), out b);
        using (var bmp = new Bitmap(b.bmWidth, Math.Abs(b.bmHeight), b.bmWidthBytes, PixelFormat.Format32bppPArgb, b.bmBits))
        using (var copy = new Bitmap(bmp))
        using (var ms = new System.IO.MemoryStream()) {
          if (b.bmHeight > 0) copy.RotateFlip(RotateFlipType.RotateNoneFlipY);          // bottom-up bitmaps
          copy.Save(ms, ImageFormat.Png);
          return Convert.ToBase64String(ms.ToArray());
        }
      } finally { DeleteObject(hb); }
    }
  }
}
'@
[HB.Native]::DpiAware()

# Explorer windows know their folder; other apps are recognised by their program file.
function Get-ExplorerFolders {
  $map = @{}
  try { foreach ($w in (New-Object -ComObject Shell.Application).Windows()) { try { if ($w.LocationURL -like 'file:*') { $map[[int64]$w.HWND] = ([Uri]$w.LocationURL).LocalPath } } catch {} } } catch {}
  return $map
}

function Invoke-Request($req) {
  switch ($req.op) {
    'screens' { return @{ screens = [HB.Native]::Screens() } }
    'windows' {
      $folders = Get-ExplorerFolders
      $list = foreach ($w in [HB.Native]::Windows()) { $w | Add-Member -NotePropertyName folder -NotePropertyValue ($folders[[int64]$w.hwnd]) -PassThru }
      return @{ windows = @($list) }
    }
    'apps' { return @{ apps = @(Get-StartApps | ForEach-Object { @{ name = $_.Name; id = $_.AppID } }) } }
    'icon' { return @{ png = [HB.Native]::Icon([string]$req.target, [int]$req.size) } }
    'icons' {
      $out = @{}
      foreach ($t in @($req.targets)) { try { $out[[string]$t] = [HB.Native]::Icon([string]$t, [int]$req.size) } catch { $out[[string]$t] = '' } }
      return @{ icons = $out }
    }
    'launch' {
      if ($req.appId) { Start-Process ('shell:AppsFolder\' + $req.appId) }
      elseif ($req.path -and $req.args) { Start-Process -FilePath $req.path -ArgumentList $req.args }
      elseif ($req.path) { Start-Process -FilePath $req.path }
      else { throw 'nothing to launch' }
      return @{ ok = $true }
    }
    'place' { return @{ ok = [HB.Native]::Place([int64]$req.hwnd, [int]$req.x, [int]$req.y, [int]$req.w, [int]$req.h, [bool]$req.front) } }
    'front' { return @{ ok = [HB.Native]::Front([int64]$req.hwnd) } }
    default { throw "unknown request $($req.op)" }
  }
}

[Console]::Out.WriteLine('<<HBR:{"ready":true}>>')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  try { $out = Invoke-Request ($line | ConvertFrom-Json) }
  catch { $out = @{ error = $_.Exception.Message } }
  [Console]::Out.WriteLine('<<HBR:' + ($out | ConvertTo-Json -Depth 6 -Compress) + '>>')
}
