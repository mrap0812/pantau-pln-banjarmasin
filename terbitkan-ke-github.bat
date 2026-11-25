@echo off
cd /d "%~dp0"
set /p AKUN=Nama akun GitHub Anda [mrap0812]: 
if "%AKUN%"=="" set AKUN=mrap0812
git remote remove origin 2>nul
git remote add origin https://github.com/%AKUN%/pantau-pln-banjarmasin.git
git push -u origin main
echo.
echo Selesai. Aktifkan Pages: Settings ^> Pages ^> Deploy from a branch ^> main / (root).
pause
