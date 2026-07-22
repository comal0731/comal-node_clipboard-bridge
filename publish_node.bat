@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Comal Node Publisher
echo   Folder: %cd%
echo ============================================
echo.

:: ---- Step 0: Auto-add apikey.txt to .gitignore (prevent accidental commit) ----
findstr /x "apikey.txt" .gitignore >nul 2>&1
if errorlevel 1 (
    echo apikey.txt>> .gitignore
    echo (Added apikey.txt to .gitignore - API key will never be committed)
)

:: ---- Step 1: Review and commit changes ----
echo [Step 1] Currently changed files:
git status --short
echo.
set /p DOCOMMIT="Commit these changes now? (y/n): "
if /i "%DOCOMMIT%"=="y" (
    set /p COMMITMSG="Enter commit message: "
    git add .
    git commit -m "!COMMITMSG!"
    echo Commit complete.
) else (
    echo Skipping commit step.
)
echo.

:: ---- Step 2: Bump version ----
echo [Step 2] Auto-increment pyproject.toml version
set /p DOBUMP="Bump the version? (patch +1) (y/n): "
if /i "%DOBUMP%"=="y" (
    for /f "delims=" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bump_version.ps1"') do set VERLINE=%%A
    echo Version changed: !VERLINE!
    git add pyproject.toml
    git commit -m "bump version !VERLINE!"
) else (
    echo Skipping version bump - proceeding as-is if already a new version.
)
echo.

:: ---- Step 3: Push to GitHub ----
echo [Step 3] Pushing to GitHub...
git push
if errorlevel 1 (
    echo No upstream branch set yet. Attempting to set it automatically...
    git push --set-upstream origin main
    if errorlevel 1 (
        echo.
        echo *** PUSH FAILED ***
        echo This may be because the remote has commits you don't have locally.
        echo Open a new terminal in this folder and run:
        echo     git pull origin main --rebase
        echo Then re-run this batch file.
        pause
        exit /b 1
    )
)
echo Push complete.
echo.


:: ---- Step 4: Prepare API key ----
echo [Step 4] Comfy Registry API key
echo.
echo   If you don't have a key yet, create one as follows:
echo   1. Go to https://registry.comfy.org/nodes (login required)
echo   2. Click the "comal" Publisher in the list
echo   3. Click "+ Create new key", enter a name, and copy the key immediately
echo      (the key is shown only once and cannot be viewed again)
echo.
set KEYFILE=%~dp0apikey.txt
if exist "%KEYFILE%" (
    set /p USEEXISTING="A saved API key was found. Use it? (y/n): "
) else (
    set USEEXISTING=n
)

if /i "!USEEXISTING!"=="y" (
    set /p COMFY_API_KEY=<"%KEYFILE%"
) else (
    set /p COMFY_API_KEY="Paste the API key from the link above: "
    set /p SAVEKEY="Save it locally so you don't need to type it again? (y/n): "
    if /i "!SAVEKEY!"=="y" (
        echo !COMFY_API_KEY!> "%KEYFILE%"
        echo Saved: %KEYFILE%  ^(protected by .gitignore, will not be committed^)
    )
)
echo.


:: ---- Step 5: Actual publish ----
echo [Step 5] Publishing node to registry.comfy.org...
comfy node publish

echo.
echo ============================================
echo   Done. Check the messages above for success or errors.
echo ============================================
pause
