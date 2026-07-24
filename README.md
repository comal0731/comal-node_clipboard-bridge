# ComfyUI Clipboard Bridge

ComfyUI 캔버스에서 클립보드(복사한 텍스트/이미지)를 자동으로 감지해서 노드에 바로 붙여넣어주는 커스텀 노드 확장입니다. 텍스트는 Append / Replace / Fixed+New 방식으로 조합할 수 있고, 이미지·텍스트 모두 최근 히스토리를 저장해 Undo / Redo로 되돌릴 수 있습니다. 사용자가 실수로 스위치를 켜둔 채 방치하는 상황을 막기 위한 안전장치(재시작 시 자동 OFF, 일정 시간 비활동 시 자동 OFF)도 포함되어 있습니다.

## 주요 기능

- **클립보드 자동 감지**: OS 클립보드에 새 텍스트나 이미지가 복사되면 실시간으로 감지해서 연결된 노드에 전달합니다.
- **텍스트 처리 옵션**: `Clipboard Text Options` 노드로 Append(뒤에 이어붙이기), Replace(교체), Fixed+New(고정 문구 + 새 텍스트) 방식을 선택하고 구분자(separator)도 지정할 수 있습니다.
- **Undo / Redo 히스토리**: 텍스트는 최근 10개, 이미지는 최근 5개까지 저장되며 노드에 있는 Undo / Redo 버튼으로 과거 클립보드 내용을 다시 불러올 수 있습니다.
- **개별 ON/OFF 스위치**: 각 노드마다 `listen` 스위치가 있어 원하는 노드만 클립보드를 감지하도록 켜고 끌 수 있습니다.
- **전역 설정(Clipboard Global Options)**: ComfyUI를 새로고침하거나 재시작하면 모든 listen 스위치가 자동으로 꺼지고, 마우스/키보드 활동이 일정 시간(기본 30분) 없으면 자동으로 모든 listen 스위치가 꺼집니다. ComfyUI 내부에서 복사한 텍스트와 이미지를 받을지, 수신 시 ComfyUI 탭에 포커스를 요청할지를 각각 설정할 수 있으며 기본값은 모두 OFF입니다. 이 노드를 캔버스에 연결하지 않아도 전역으로 기본값이 적용됩니다.
- **이미지 드래그 앤 드롭**: 이미지를 노드 위로 드래그하면 자동으로 업로드되어 삽입됩니다.

## 노드 목록

| 노드 이름 | 설명 |
|---|---|
| Clipboard Text Options | 텍스트 결합 방식(Append/Replace/Fixed+New)과 구분자, 고정 문구를 설정 |
| Clipboard Global Options | `reset_listen`, `idle_off_minutes`, ComfyUI 내부 복사 허용 및 수신 시 탭 포커스 요청을 텍스트/이미지별로 설정. 추가 스위치는 기본 OFF이며 연결하지 않아도 기본값 적용됨 |
| Clipboard Text Receiver | 클립보드 텍스트를 받아 워크플로우에 전달, Undo/Redo 버튼 포함 |
| Load Image (Clipboard) | 클립보드 이미지를 받아 워크플로우에 전달, Undo/Redo 버튼 및 드래그 앤 드롭 지원 |

## 설치 방법

### 1. ComfyUI Manager 사용 (권장)
ComfyUI Manager의 "Install via Git URL" 기능으로 아래 저장소 주소를 입력해 설치할 수 있습니다.

### 2. 수동 설치

1. ComfyUI의 `custom_nodes` 폴더로 이동합니다.

```bash
이 저장소를 클론합니다.
Copygit clone https://github.com/yourname/comfyui-clipboard-bridge.git
클론한 폴더로 이동한 뒤, 필요한 의존성을 설치합니다.
Copycd comfyui-clipboard-bridge
pip install -r requirements.txt
Windows 환경에서 클립보드 감지를 위해 pywin32 패키지가 필요합니다. requirements.txt에 포함되어 있지만, 혹시 설치가 누락되었다면 아래 명령으로 별도 설치할 수 있습니다.

Copypip install pywin32
ComfyUI를 재시작합니다.
Copypython main.py
브라우저에서 강력 새로고침(Ctrl+Shift+R)을 한 번 실행해 확장이 정상적으로 로드되었는지 확인합니다.
사용 방법
캔버스에 Load Image (Clipboard) 또는 Clipboard Text Receiver 노드를 추가합니다.
노드의 listen 스위치를 켭니다(기본값은 OFF입니다).
아무 텍스트나 이미지를 복사(Ctrl+C)하면 자동으로 노드에 입력됩니다.
이전 클립보드 내용으로 되돌리고 싶다면 노드 안의 Undo / Redo 버튼을 사용합니다.
여러 노드에서 동일한 텍스트 조합 규칙을 쓰고 싶다면 Clipboard Text Options 노드를 만들어 연결하세요.
재시작 시 자동 OFF 여부, 비활동 자동 OFF 시간, ComfyUI 내부 복사 허용 여부를 조정하려면 Clipboard Global Options 노드를 캔버스에 추가하고 값을 설정하세요.
주의사항
노드의 Undo/Redo 히스토리는 이미지 최근 5장, 텍스트 최근 10개까지 유지됩니다. 워크플로가 참조하는 이미지 원본 파일은 새로고침이나 재시작 후에도 복원할 수 있도록 삭제하지 않습니다.
안전을 위해 워크플로우를 새로 열거나 ComfyUI를 재시작하면 모든 listen 스위치는 기본적으로 꺼진 상태로 시작합니다.
현재는 Windows 클립보드 API를 기준으로 구현되어 있어 macOS/Linux 환경에서는 일부 감지 기능이 정상 동작하지 않을 수 있습니다.
라이선스
MIT Licensecd ComfyUI/custom_nodes
