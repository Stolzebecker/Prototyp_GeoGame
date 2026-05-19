@echo off
echo ═══════════════════════════════════════════════
echo  EO Pipeline – .exe bauen
echo ═══════════════════════════════════════════════
echo.

echo [1/3] Abhaengigkeiten installieren ...
pip install rasterio numpy pillow requests geopandas shapely pyinstaller --quiet
if %errorlevel% neq 0 (
    echo FEHLER bei pip install.
    pause & exit /b 1
)

echo.
echo [2/3] .exe kompilieren ...
pyinstaller --onefile --noconsole --name "Verarbeitung_starten" pipeline.py
if %errorlevel% neq 0 (
    echo FEHLER beim Kompilieren.
    pause & exit /b 1
)

echo.
echo [3/3] .exe kopieren + input-Ordner anlegen ...
copy /Y dist\Verarbeitung_starten.exe Verarbeitung_starten.exe
if not exist input mkdir input

echo.
echo ✅  Fertig!
echo    Verarbeitung_starten.exe liegt im Projektordner.
echo    TIF-Dateien in input\ legen und exe doppelklicken.
echo.
pause
