@echo off
chcp 65001 >nul
rem Trae la ultima version de Estudio BBS desde GitHub y la copia a la carpeta www de esta PC.
rem No borra nada de www (por ejemplo el archivo pose_landmarker_heavy.task); solo agrega y reemplaza.
cd /d "%~dp0"
set REPO=https://github.com/artprop/urbjfjPQb-FCFBBSIDV.git
set DEST=%~dp0_publicar

where git >nul 2>nul
if errorlevel 1 (
  echo Falta instalar Git. Se abre la pagina de descarga: instalalo con todo por defecto y volve a abrir actualizar.bat.
  start https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist "%DEST%\.git" (
  echo Preparando la carpeta por primera vez...
  git clone "%REPO%" "%DEST%"
  if errorlevel 1 goto :error
)

cd /d "%DEST%"
git fetch -q origin main
if errorlevel 1 goto :error
git checkout -q -B main origin/main
if errorlevel 1 goto :error

if not exist "%~dp0www" mkdir "%~dp0www"
rem /E copia todo; sin /MIR ni /PURGE, asi que no borra nada de www
robocopy "%DEST%" "%~dp0www" /E /XD .git /XF .nojekyll /NFL /NDL /NJH /NJS /NP >nul
if %errorlevel% GEQ 8 goto :error

echo.
echo Listo. www esta actualizado con lo ultimo de GitHub. Reinicia Estudio BBS si lo tenias abierto.
pause
exit /b 0

:error
echo.
echo Algo fallo. Saca una captura de esta ventana y mandasela a Claude.
pause
exit /b 1
