@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Comal Node Publisher
echo   Folder: %cd%
echo ============================================
echo.

:: ---- Step 0: apikey.txt를 .gitignore에 자동 등록 (실수로 커밋되는 것 방지) ----
findstr /x "apikey.txt" .gitignore >nul 2>&1
if errorlevel 1 (
    echo apikey.txt>> .gitignore
    echo (.gitignore에 apikey.txt 추가함 - API 키가 절대 커밋되지 않도록 보호)
)

:: ---- Step 1: 변경사항 확인 및 커밋 ----
echo [Step 1] 현재 변경된 파일 목록:
git status --short
echo.
set /p DOCOMMIT="변경사항을 지금 커밋할까요? (y/n): "
if /i "%DOCOMMIT%"=="y" (
    set /p COMMITMSG="=== 커밋 메시지를 입력하세요 (여기만 타이핑) ==="
    git add .
    git commit -m "!COMMITMSG!"
    echo 커밋 완료.
) else (
    echo 커밋 단계 건너뜀.
)
echo.

:: ---- Step 2: 버전 올리기 ----
echo [Step 2] pyproject.toml 버전 자동 증가
set /p DOBUMP="버전을 올릴까요? (patch +1) (y/n): "
if /i "%DOBUMP%"=="y" (
    for /f "delims=" %%A in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bump_version.ps1"') do set VERLINE=%%A
    echo 버전 변경: !VERLINE!
    git add pyproject.toml
    git commit -m "bump version !VERLINE!"
) else (
    echo 버전 올리기 건너뜀 - 이미 새 버전이면 그대로 진행합니다.
)
echo.

:: ---- Step 3: GitHub push ----
echo [Step 3] GitHub로 push 중...
git push
if errorlevel 1 (
    echo.
    echo !!! PUSH 실패 !!!
    echo 아래 명령을 직접 실행한 뒤 이 배치파일을 다시 실행하세요:
    echo     git pull origin main
    pause
    exit /b 1
)
echo push 완료.
echo.

:: ---- Step 4: API 키 준비 ----
echo [Step 4] Comfy Registry API 키
echo.
echo   키가 없다면 아래 순서로 새로 만드세요:
echo   1. https://registry.comfy.org/nodes 접속 (로그인 필요)
echo   2. 목록에서 "comal" Publisher 클릭
echo   3. "+ Create new key" 버튼 클릭 후 이름 입력, 발급된 키 즉시 복사
echo      (키는 그 순간에만 표시되며, 다시 볼 수 없습니다)
echo.
set KEYFILE=%~dp0apikey.txt
if exist "%KEYFILE%" (
    set /p USEEXISTING="저장된 API 키가 있습니다. 그걸 쓸까요? (y/n): "
) else (
    set USEEXISTING=n
)

if /i "!USEEXISTING!"=="y" (
    set /p COMFY_API_KEY=<"%KEYFILE%"
) else (
    set /p COMFY_API_KEY="=== 위 링크에서 발급받은 API 키를 붙여넣으세요 (여기만 타이핑) ==="
    set /p SAVEKEY="다음에 다시 안 치도록 로컬에 저장할까요? (y/n): "
    if /i "!SAVEKEY!"=="y" (
        echo !COMFY_API_KEY!> "%KEYFILE%"
        echo 저장 완료: %KEYFILE%  ^(.gitignore로 보호되어 있어 커밋되지 않습니다^)
    )
)
echo.


:: ---- Step 5: 실제 publish ----
echo [Step 5] registry.comfy.org로 노드 publish 중...
comfy node publish

echo.
echo ============================================
echo   완료. 위 메시지에서 성공/에러 여부를 확인하세요.
echo ============================================
pause
