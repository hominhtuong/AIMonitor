@echo off
REM Chay AI Monitor tren Windows. Mac dinh http://127.0.0.1:8899
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  py -m aimon.server --open %*
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m aimon.server --open %*
  goto :eof
)

echo Chua co Python 3 tren may. Cai tu https://www.python.org/downloads/ roi chay lai.
pause
