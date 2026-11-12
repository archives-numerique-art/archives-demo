@echo off
setlocal
cd /d "%~dp0"
rem IMF Archive - mode : tout le reseau
where py >nul 2>nul
if not errorlevel 1 (set "PY=py") else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python est introuvable. Installez Python puis relancez ce fichier.
    exit /b 1
  )
  set "PY=python"
)
if not defined IMF_DB set "IMF_DB=%~dp0backend\imf_archive_pro"
if not exist "%IMF_DB%" (
  echo Base SQLite introuvable : "%IMF_DB%"
  exit /b 1
)
if not defined IMF_PORT_BACKEND set "IMF_PORT_BACKEND=5001"
if not defined IMF_PORT_FRONTEND set "IMF_PORT_FRONTEND=5000"
set IMF_HOTE=0.0.0.0
%PY% -c "import flask" >nul 2>nul
if errorlevel 1 (
  echo Installation des dependances du backend...
  %PY% -m pip install -r backend\requirements.txt
  if errorlevel 1 (
    echo Echec de l'installation des dependances.
    exit /b 1
  )
)
start "IMF Archive - BACKEND" /D "%~dp0backend" cmd /k "%PY% serveur.py"
set "ESSAIS=0"
:attendre_backend
%PY% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:%IMF_PORT_BACKEND%/api/etat', timeout=1).read()" >nul 2>nul
if not errorlevel 1 goto backend_pret
set /a ESSAIS+=1
if %ESSAIS% GEQ 20 (
  echo Le backend ne repond pas. Consultez sa fenetre pour voir l'erreur.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto attendre_backend
:backend_pret
start "IMF Archive - FRONTEND" /D "%~dp0frontend" cmd /k "%PY% serveur.py"
echo.
echo Adresse a donner aux collegues (meme reseau) : http://VOTRE_ADRESSE_IPV4:%IMF_PORT_FRONTEND%/
ipconfig | findstr /i "IPv4"
timeout /t 2 /nobreak >nul
start "" "http://localhost:%IMF_PORT_FRONTEND%/"
