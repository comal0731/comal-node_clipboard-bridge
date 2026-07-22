@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   New Comal-style Node - Initial Setup
echo   Folder: %cd%
echo ============================================
echo.

if not exist "nodes.py" (
    echo 경고: nodes.py가 이 폴더에 없습니다. 먼저 노드 코드를 만들어두세요.
    pause
)
if not exist "__init__.py" (
    echo 경고: __init__.py가 이 폴더에 없습니다. 먼저 노드 코드를 만들어두세요.
    pause
)

echo [입력 1] 노드 패키지 이름 (예: my-cool-node, 소문자/하이픈만)
set /p PKGNAME="=== 여기만 타이핑 ==="

echo [입력 2] 한 줄 설명
set /p PKGDESC="=== 여기만 타이핑 ==="

echo [입력 3] GitHub 저장소 이름 (예: my-cool-node)
set /p REPONAME="=== 여기만 타이핑 ==="

echo [입력 4] 표시될 노드 이름 (DisplayName)
set /p DISPNAME="=== 여기만 타이핑 ==="

REM ---- Publisher는 기존에 만든 "comal" 재사용 (바꿀 필요 있을 때만 수정) ----
set PUBLISHERID=comal
set GITHUBUSER=comal0731

REM ---- pyproject.toml 생성 ----
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
echo pyproject.toml 생성 완료.

REM ---- .gitignore 생성 ----
(
echo __pycache__/
echo *.pyc
echo apikey.txt
) > .gitignore
echo .gitignore 생성 완료.

REM ---- LICENSE 생성 (MIT) ----
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
echo LICENSE 생성 완료.

echo.
echo ============================================
echo   이제 GitHub에서 아래 순서를 진행하세요:
echo   1. https://github.com/new 에서 저장소 이름 "!REPONAME!"으로 새 저장소 생성
echo      (README/License 등 아무것도 체크하지 말고 빈 저장소로 생성)
echo   2. 아래 git 명령이 자동 실행됩니다 (Enter만 누르면 진행)
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
echo   초기 설정 완료!
echo   이제부터는 publish_node.bat 파일을
echo   이 폴더에 복사해서 사용하시면 됩니다.
echo ============================================
pause
