@echo off
cd /d "%~dp0"
echo Buka http://localhost:8000 di browser. Tekan Ctrl+C untuk berhenti.
start "" http://localhost:8000
python -m http.server 8000
