# Homeboard console host: runs a shell inside a Windows pseudo-console (ConPTY, the same thing Windows Terminal
# and VS Code use), so full-screen programs (Claude Code, vim, progress bars, colours) work in a console card.
# Started by the helper (server.js) with pipes:
#   stdout  everything the console shows, as the raw bytes a terminal expects (xterm.js draws them on the board)
#   stdin   messages: 1 byte kind, 4 bytes length (little-endian), then the payload
#             'd' keys / pasted text (UTF-8)    'r' new size: 2 bytes columns, 2 bytes rows
# Based on Microsoft's ConPTY sample (MiniTerm). Exits with the shell's exit code.
param([string]$Shell = 'powershell', [string]$Cwd = '', [int]$Cols = 100, [int]$Rows = 30)
$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace HBPty {
  public static class Host {
    [StructLayout(LayoutKind.Sequential)] struct COORD { public short X, Y; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct STARTUPINFO {
      public int cb; public string lpReserved, lpDesktop, lpTitle;
      public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
      public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId; }

    [DllImport("kernel32.dll", SetLastError = true)] static extern int CreatePseudoConsole(COORD size, SafeFileHandle hInput, SafeFileHandle hOutput, uint flags, out IntPtr hPC);
    [DllImport("kernel32.dll")] static extern int ResizePseudoConsole(IntPtr hPC, COORD size);
    [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr hPC);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out SafeFileHandle r, out SafeFileHandle w, IntPtr sa, int size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
    [DllImport("kernel32.dll", SetLastError = true)] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessW(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    static int ReadFull(Stream s, byte[] buf, int n) { int got = 0; while (got < n) { int r = s.Read(buf, got, n - got); if (r <= 0) return got; got += r; } return got; }

    public static int Run(string cmdline, string cwd, short cols, short rows) {
      SafeFileHandle inRead, inWrite, outRead, outWrite;
      if (!CreatePipe(out inRead, out inWrite, IntPtr.Zero, 0) || !CreatePipe(out outRead, out outWrite, IntPtr.Zero, 0)) throw new Exception("pipes: " + Marshal.GetLastWin32Error());
      IntPtr hPC;
      int hr = CreatePseudoConsole(new COORD { X = cols, Y = rows }, inRead, outWrite, 0, out hPC);
      if (hr != 0) throw new Exception("CreatePseudoConsole failed: 0x" + hr.ToString("x"));
      inRead.Dispose(); outWrite.Dispose();                 // the pseudo-console holds its own copies

      IntPtr size = IntPtr.Zero;
      InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
      IntPtr list = Marshal.AllocHGlobal(size);
      if (!InitializeProcThreadAttributeList(list, 1, 0, ref size)) throw new Exception("attributes: " + Marshal.GetLastWin32Error());
      if (!UpdateProcThreadAttribute(list, 0, (IntPtr)0x00020016, hPC, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) throw new Exception("attribute: " + Marshal.GetLastWin32Error());
      var si = new STARTUPINFOEX();
      si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
      si.StartupInfo.dwFlags = 0x00000100;                  // STARTF_USESTDHANDLES with none: the shell must use the pseudo-console, not our pipes
      si.lpAttributeList = list;
      PROCESS_INFORMATION pi;
      if (!CreateProcessW(null, cmdline, IntPtr.Zero, IntPtr.Zero, false, 0x00080000, IntPtr.Zero, string.IsNullOrEmpty(cwd) ? null : cwd, ref si, out pi))
        throw new Exception("could not start " + cmdline + ": " + Marshal.GetLastWin32Error());

      var ptyOut = new FileStream(outRead, FileAccess.Read, 1, false);
      var ptyIn = new FileStream(inWrite, FileAccess.Write, 1, false);
      var stdout = Console.OpenStandardOutput();
      var stdin = Console.OpenStandardInput();

      var pump = new Thread(() => {                         // what the console shows -> the helper
        var buf = new byte[32768];
        try { int n; while ((n = ptyOut.Read(buf, 0, buf.Length)) > 0) { stdout.Write(buf, 0, n); stdout.Flush(); } } catch { }
      });
      pump.IsBackground = true; pump.Start();

      var keys = new Thread(() => {                         // keys and sizes <- the helper
        var head = new byte[5];
        try {
          while (ReadFull(stdin, head, 5) == 5) {
            int len = BitConverter.ToInt32(head, 1);
            if (len < 0 || len > 4 * 1024 * 1024) break;
            var data = new byte[len];
            if (ReadFull(stdin, data, len) != len) break;
            if (head[0] == (byte)'d') { ptyIn.Write(data, 0, len); ptyIn.Flush(); }
            else if (head[0] == (byte)'r' && len >= 4) ResizePseudoConsole(hPC, new COORD { X = Math.Max((short)2, BitConverter.ToInt16(data, 0)), Y = Math.Max((short)1, BitConverter.ToInt16(data, 2)) });
          }
        } catch { }
        TerminateProcess(pi.hProcess, 1);                   // the helper went away: so does the console
      });
      keys.IsBackground = true; keys.Start();

      WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
      uint code; GetExitCodeProcess(pi.hProcess, out code);
      ClosePseudoConsole(hPC);                              // lets the last output through, then ends the output pipe
      pump.Join(2000);
      CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
      DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list);
      return (int)code;
    }
  }
}
'@

# compiled once, then reused from the cache
$cache = Join-Path ([IO.Path]::GetTempPath()) 'homeboard-conpty-v1.dll'
if (-not ('HBPty.Host' -as [type])) {
  if (-not (Test-Path $cache)) { Add-Type -TypeDefinition $source -OutputAssembly $cache -OutputType Library }
  Add-Type -Path $cache
}

$cmd = switch ($Shell) {
  'pwsh' { 'pwsh.exe -NoLogo' }
  'cmd' { 'cmd.exe' }
  default { 'powershell.exe -NoLogo' }
}
if (-not $Cwd -or -not (Test-Path -LiteralPath $Cwd -PathType Container)) { $Cwd = $env:USERPROFILE }
exit [HBPty.Host]::Run($cmd, $Cwd, [int16]$Cols, [int16]$Rows)
