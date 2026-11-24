Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run("powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""E:\TikSaver\worker\run-local.ps1""", 0, True)
WScript.Quit exitCode
