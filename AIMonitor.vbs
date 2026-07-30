' Chay AI Monitor tren Windows KHONG hien cua so console (dung cho shortcut ngoai Desktop).
' Double-click file nay, hoac dung scripts\build_windows.ps1 de tao shortcut co icon.
Option Explicit
Dim shell, fso, root, exe

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = root

' pythonw.exe chay khong console; neu khong co thi fallback sang python.exe
exe = "pythonw.exe"
On Error Resume Next
shell.Run """" & exe & """ -m aimon.server --open", 0, False
If Err.Number <> 0 Then
  Err.Clear
  shell.Run "python.exe -m aimon.server --open", 0, False
  If Err.Number <> 0 Then
    MsgBox "Chua co Python 3 tren may." & vbCrLf & _
           "Cai tu https://www.python.org/downloads/ (nho tick 'Add Python to PATH') roi chay lai.", _
           48, "AI Monitor"
  End If
End If
On Error Goto 0
