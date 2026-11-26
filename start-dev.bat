@echo off
rem Nervbox Dev-Setup - Wrapper fuer start-dev.ps1 (Doppelklick = start)
rem Nutzung: start-dev.bat [start|stop|status|logs|restart] [-NoLogs]
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
