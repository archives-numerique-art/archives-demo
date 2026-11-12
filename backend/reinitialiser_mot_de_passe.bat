@echo off
cd /d %~dp0
py --version >nul 2>nul && (set PY=py) || (set PY=python)
%PY% reinitialiser_mot_de_passe.py
pause
