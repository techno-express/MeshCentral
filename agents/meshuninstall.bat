@echo off
reg Query "HKLM\Hardware\Description\System\CentralProcessor\0" | find /i "x86" > NUL && set OS_bit= || set OS_bit=64
rename MeshService%OS_bit%.exe meshagent.exe
meshagent.exe -fulluninstall
if exist "C:\Program Files\Mesh Agent\" rmdir /Q /S "C:\Program Files\Mesh Agent\"
if exist "C:\Program Files (x86)\Mesh Agent\" rmdir /Q /S "C:\Program Files (x86)\Mesh Agent\"
reg delete HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\MeshAgent /f
reg delete "HKLM\System\CurrentControlSet\services\Mesh Agent" /f
reg delete "HKLM\System\ControlSet001\services\Mesh Agent" /f
