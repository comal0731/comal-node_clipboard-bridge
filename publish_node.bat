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
    if not exist "bump_version.ps1" (
        echo *** WARNING: bump_version.ps1 not found. Skipping version bump. ***
    ) else (
        set "VERLINE="
        for /f "usebackq delims=" %%A in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bump_version.ps1"`) do set "VERLINE=%%A"
        if "!VERLINE!"=="" (
            echo *** WARNING: Version bump script returned no output. Skipping commit of version. ***
        ) else (
            echo Version changed: !VERLINE!
            git add pyproject.toml
            git commit -m "bump version !VERLINE!"
        )
    )
) else (
    echo Skipping version bump - proceeding as-is if already a new version.
)
echo.

:: ---- Step 3: Check remote URL, then push to GitHub ----
echo [Step 3] Checking remote origin URL...

set "CURRENT_REMOTE="
for /f "usebackq delims=" %%U in (`git remote get-url origin 2^>nul`) do set "CURRENT_REMOTE=%%U"

if "!CURRENT_REMOTE!"=="" (
    echo *** WARNING: No "origin" remote is configured. ***
    set /p FIXURL="Paste the correct GitHub repo URL (e.g. https://github.com/USER/REPO): "
    if not "!FIXURL!"=="" (
        git remote add origin "!FIXURL!"
    )
) else (
    echo Current remote: !CURRENT_REMOTE!
    set "CHECKURL=!CURRENT_REMOTE!"
    set "CHECKURL=!CHECKURL:https://github.com/=!"
    set "CHECKURL=!CHECKURL:http://github.com/=!"
    set "CHK_USER="
    set "CHK_REPO="
    for /f "tokens=1,2 delims=/" %%A in ("!CHECKURL!") do (
        set "CHK_USER=%%A"
        set "CHK_REPO=%%B"
    )
    if "!CHK_REPO!"=="" (
        echo *** WARNING: origin URL looks malformed - missing repository name. ***
        echo Current value: !CURRENT_REMOTE!
        set /p FIXURL="Paste the correct GitHub repo URL to fix it (or press Enter to skip): "
        if not "!FIXURL!"=="" (
            git remote set-url origin "!FIXURL!"
            echo Remote URL updated.
        )
    )
)
echo.

echo Pushing to GitHub...
git push
if errorlevel 1 (
    echo No upstream branch set yet, or push failed. Trying with --set-upstream...
    git push --set-upstream origin main
    if errorlevel 1 (
        echo.
        echo *** PUSH FAILED ***
        echo Check that the remote URL above points to a repo that actually exists on GitHub.
        echo You can fix it manually with:
        echo     git remote set-url origin https://github.com/USER/REPO.git
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
set "KEYFILE=%~dp0apikey.txt"
if exist "%KEYFILE%" (
    set /p USEEXISTING="A saved API key was found. Use it? (y/n): "
) else (
    set "USEEXISTING=n"
)

if /i "!USEEXISTING!"=="y" (
    set /p COMFY_API_KEY=<"%KEYFILE%"
) else (
    set /p COMFY_API_KEY="Paste the API key from the link above: "
    set /p SAVEKEY="Save it locally so you don't need to type it again? (y/n): "
    if /i "!SAVEKEY!"=="y" (
        echo !COMFY_API_KEY!> "%KEYFILE%"
        echo Saved: %KEYFILE% - protected by .gitignore, will not be committed
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
