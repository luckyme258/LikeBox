@echo off
chcp 65001 >nul
cd /d "%~dp0"
set LIKEBOX_OPEN=1
python app.py
if errorlevel 1 pause
