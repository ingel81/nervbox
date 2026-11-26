@echo off
rem Nervbox Deployment - Wrapper fuer deploy.ps1
rem Nutzung: deploy.bat [-ForceDb] [-ForceSounds] [-ForceInstruments] [-SkipBuild]
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
if "%~1"=="" pause
