@echo off
cd /d %~dp0
py --version >nul 2>nul && (set PY=py) || (set PY=python)
%PY% -m pip install -r requirements.txt
%PY% donnees_demo.py
pause
