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

set "NEED_FIX=0"

if "!CURRENT_REMOTE!"=="" (
    echo *** WARNING: No "origin" remote is configured at all. ***
    set "NEED_FIX=1"
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
    if "!CHK_REPO!"=="" set "NEED_FIX=1"
    if "!CHK_REPO:~0,1!"=="." set "NEED_FIX=1"
)

if "!NEED_FIX!"=="1" (
    echo.
    echo *** The saved GitHub address is missing the repository name. ***
    echo Go to your GitHub profile, find the correct repository, copy its URL,
    echo and paste it below.
    set /p FIXURL="Correct GitHub repo URL: "
    if not "!FIXURL!"=="" (
        git remote remove origin >nul 2>&1
        git remote add origin "!FIXURL!"
        echo Remote URL set to: !FIXURL!
    ) else (
        echo No URL entered. Cannot continue.
        pause
        exit /b 1
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
        echo The remote repository already has some content that your
        echo local folder does not have (e.g. a README/License created on GitHub).
        echo Attempting to automatically merge it in...
        git pull origin main --allow-unrelated-histories --no-edit
        if errorlevel 1 (
            echo.
            echo *** MERGE FAILED - there are conflicting files. ***
            echo Open the files git lists above, resolve the conflict markers
            echo ^(lines starting with ^<^<^<^<^<^<^<, =======, ^>^>^>^>^>^>^>^),
            echo then run:
            echo     git add .
            echo     git commit -m "merge"
            echo and re-run this batch file.
            pause
            exit /b 1
        )
        echo Merge succeeded. Retrying push...
        git push --set-upstream origin main
        if errorlevel 1 (
            echo.
            echo *** PUSH STILL FAILED ***
            echo If you are SURE the remote repo has nothing important,
            echo you can overwrite it with:
            echo     git push --force --set-upstream origin main
            pause
            exit /b 1
        )
    )
)
echo Push complete.
echo.

:: ---- Step 4: Prepare API key ----
echo [Step 4] Comfy Registry API key
echo.
echo   If you don't have a key yet, create one as follows:
echo   1. Go to https://registry.comfy.org/nodes (login required)
echo   2. Click your Publisher in the list
echo   3. Click "+ Create new key", enter a name, and copy the key immediately
echo      (the key is shown only once and cannot be viewed again)
echo.
echo   IMPORTANT: Do NOT paste with Ctrl+V. Right-click to paste instead,
echo   otherwise Windows may silently add a hidden control character
echo   to the end of the key and cause "Invalid personal access token".
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
    set /p COMFY_API_KEY="Right-click to paste the API key here: "
    set /p SAVEKEY="Save it locally so you don't need to type it again? (y/n): "
    if /i "!SAVEKEY!"=="y" (
        echo !COMFY_API_KEY!> "%KEYFILE%"
        echo Saved: %KEYFILE% - protected by .gitignore, will not be committed
    )
)

:: ---- Clean the key: strip whitespace, CR/LF, and the Windows SYN (0x16) artifact ----
set "CLEANKEY="
for /f "usebackq delims=" %%K in (`powershell -NoProfile -Command "$k = '!COMFY_API_KEY!'; $k = $k -replace [char]0x16,''; $k.Trim()"`) do set "CLEANKEY=%%K"
set "COMFY_API_KEY=!CLEANKEY!"

:: ---- Sanity check: show key length ----
set "KEYLEN=0"
set "TMPKEY=!COMFY_API_KEY!"
:countloop
if not "!TMPKEY!"=="" (
    set /a KEYLEN+=1
    set "TMPKEY=!TMPKEY:~1!"
    goto countloop
)
echo Loaded API key length after cleanup: !KEYLEN! characters
if !KEYLEN! LSS 10 (
    echo *** WARNING: The key looks too short. It may be empty or corrupted. ***
)
echo.

echo Current PublisherId in pyproject.toml:
findstr /i "PublisherId" pyproject.toml
echo.

:: ---- Step 5: Actual publish (use --token so the CLI never re-prompts) ----
echo [Step 5] Publishing node to registry.comfy.org...
comfy node publish --token "!COMFY_API_KEY!"

echo.
echo ============================================
echo   Done. Check the messages above for success or errors.
echo ============================================
pause
