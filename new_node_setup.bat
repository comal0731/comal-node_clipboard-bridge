@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   New Comal-style Node - Initial Setup
echo   Folder: %cd%
echo ============================================
echo.

if not exist "nodes.py" (
    echo WARNING: nodes.py was not found in this folder. Please create your node code first.
    pause
)
if not exist "__init__.py" (
    echo WARNING: __init__.py was not found in this folder. Please create your node code first.
    pause
)
if not exist "extract_defaults.ps1" (
    echo ERROR: extract_defaults.ps1 was not found in this folder.
    echo Please place it next to this .bat file and try again.
    pause
    exit /b 1
)

echo ============================================
echo   First, create an empty repository on GitHub:
echo   https://github.com/new
echo   (Do NOT check README/License/.gitignore. Leave it empty.)
echo   Then paste the repository URL below.
echo ============================================
echo.
echo [Input] Paste the repository URL here
echo         (e.g. https://github.com/comal0731/comal-clipboard-bridge
echo          or with /tree/main, .git, trailing slash, etc. - all fine)
set /p REPOURL=URL: 

if "!REPOURL!"=="" (
    echo ERROR: No URL entered. Aborting.
    pause
    exit /b 1
)

REM ---- Parse GITHUBUSER and REPONAME out of the pasted URL ----
set "PARSEURL=!REPOURL!"
set "PARSEURL=!PARSEURL:https://=!"
set "PARSEURL=!PARSEURL:http://=!"
set "PARSEURL=!PARSEURL:github.com/=!"

for /f "tokens=1,2 delims=/" %%A in ("!PARSEURL!") do (
    set "GITHUBUSER=%%A"
    set "REPONAME=%%B"
)
set "REPONAME=!REPONAME:.git=!"

if "!GITHUBUSER!"=="" (
    echo ERROR: Could not parse GitHub username from the URL. Aborting.
    pause
    exit /b 1
)
if "!REPONAME!"=="" (
    echo ERROR: Could not parse repository name from the URL. Aborting.
    pause
    exit /b 1
)

echo.
echo   Parsed -^> User: !GITHUBUSER!  /  Repo: !REPONAME!
echo.

REM ---- Call the external PS1 helper to derive defaults (no inline PowerShell here) ----
set "DEFAULT_PKGNAME="
set "DEFAULT_DISPNAME="
set "DEFAULT_DESC="

for /f "usebackq delims=" %%L in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0extract_defaults.ps1" -RepoName "!REPONAME!" -NodesPath "%cd%\nodes.py"`) do (
    set "LINE=%%L"
    if "!LINE:~0,8!"=="PKGNAME=" set "DEFAULT_PKGNAME=!LINE:~8!"
    if "!LINE:~0,9!"=="DISPNAME=" set "DEFAULT_DISPNAME=!LINE:~9!"
    if "!LINE:~0,5!"=="DESC=" set "DEFAULT_DESC=!LINE:~5!"
)

echo [Input 1] Node package name
echo           Detected default: !DEFAULT_PKGNAME!
set /p PKGNAME=Press Enter to accept, or type a new name: 
if "!PKGNAME!"=="" set "PKGNAME=!DEFAULT_PKGNAME!"

echo.
echo [Input 2] One-line description
echo           Detected default: !DEFAULT_DESC!
set /p PKGDESC=Press Enter to accept, or type a new description: 
if "!PKGDESC!"=="" set "PKGDESC=!DEFAULT_DESC!"

echo.
echo [Input 3] Display name for the node
echo           Detected default: !DEFAULT_DISPNAME!
set /p DISPNAME=Press Enter to accept, or type a new name: 
if "!DISPNAME!"=="" set "DISPNAME=!DEFAULT_DISPNAME!"

if "!PKGNAME!"=="" (
    echo ERROR: Package name is empty. Aborting.
    pause
    exit /b 1
)
if "!DISPNAME!"=="" (
    echo ERROR: Display name is empty. Aborting.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Final values:
echo   Package name : !PKGNAME!
echo   Description  : !PKGDESC!
echo   Display name : !DISPNAME!
echo   GitHub repo  : https://github.com/!GITHUBUSER!/!REPONAME!
echo ============================================
pause

REM ---- Generate pyproject.toml ----
(
echo [project]
echo name = "!PKGNAME!"
echo description = "!PKGDESC!"
echo version = "1.0.0"
echo license = { file = "LICENSE" }
echo.
echo [project.urls]
echo Repository = "https://github.com/!GITHUBUSER!/!REPONAME!"
echo.
echo [tool.comfy]
echo PublisherId = "comal"
echo DisplayName = "!DISPNAME!"
echo Icon = ""
) > pyproject.toml
echo pyproject.toml created.

REM ---- Generate .gitignore ----
(
echo __pycache__/
echo *.pyc
echo apikey.txt
echo new_node_setup.bat
echo publish_node.bat
echo bump_version.ps1
echo extract_defaults.ps1
) > .gitignore
echo .gitignore created.


REM ---- Generate LICENSE (MIT) ----
(
echo MIT License
echo.
echo Copyright ^(c^) 2026 !GITHUBUSER!
echo.
echo Permission is hereby granted, free of charge, to any person obtaining a copy
echo of this software and associated documentation files ^(the "Software"^), to deal
echo in the Software without restriction, including without limitation the rights
echo to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
echo copies of the Software, and to permit persons to whom the Software is
echo furnished to do so, subject to the following conditions:
echo.
echo The above copyright notice and this permission notice shall be included in all
echo copies or substantial portions of the Software.
echo.
echo THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
echo IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
echo FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
echo AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
echo LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
echo OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
echo SOFTWARE.
) > LICENSE
echo LICENSE created.

echo.
echo ============================================
echo   Pushing to: https://github.com/!GITHUBUSER!/!REPONAME!.git
echo   Press Enter to continue, or Ctrl+C to cancel.
echo ============================================
pause

git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/!GITHUBUSER!/!REPONAME!.git
git push -u origin main

echo.
echo ============================================
echo   Initial setup complete!
echo   From now on, just copy publish_node.bat
echo   into this folder and use it.
echo ============================================
pause
