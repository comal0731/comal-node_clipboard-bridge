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

echo [Input 1] Node package name (e.g. my-cool-node, lowercase/hyphens only)
set /p PKGNAME="=== Type here ==="

echo [Input 2] One-line description
set /p PKGDESC="=== Type here ==="

echo [Input 3] GitHub repository name (e.g. my-cool-node)
set /p REPONAME="=== Type here ==="

echo [Input 4] Display name for the node
set /p DISPNAME="=== Type here ==="

REM ---- Reuse the existing "comal" publisher (only edit if you need to change it) ----
set PUBLISHERID=comal
set GITHUBUSER=comal0731

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
echo PublisherId = "!PUBLISHERID!"
echo DisplayName = "!DISPNAME!"
echo Icon = ""
) > pyproject.toml
echo pyproject.toml created.

REM ---- Generate .gitignore ----
(
echo __pycache__/
echo *.pyc
echo apikey.txt
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
echo   Now go to GitHub and follow these steps:
echo   1. Go to https://github.com/new and create a new repository named "!REPONAME!"
echo      (Do NOT check README/License etc. Create it as an empty repository.)
echo   2. The git commands below will run automatically (just press Enter to continue)
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
