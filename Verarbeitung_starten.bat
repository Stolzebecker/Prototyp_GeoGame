@echo off
:: EO Pipeline – Verarbeitung starten
:: Doppelklick auf diese Datei startet die Pipeline-GUI.
:: Python muss installiert sein (python.org).

echo Starte EO Pipeline ...
python "%~dp0pipeline.py"
if %errorlevel% neq 0 (
    echo.
    echo FEHLER: Pipeline konnte nicht gestartet werden.
    echo Bitte sicherstellen dass Python installiert ist.
    pause
)
