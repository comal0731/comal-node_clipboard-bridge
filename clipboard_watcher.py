import threading
import time
import io
import os
import sys
import hashlib
from PIL import ImageGrab
import pyperclip
from server import PromptServer

print("[ClipboardBridge] clipboard_watcher.py 파일이 로드됐습니다.", flush=True)

LATEST_CLIPBOARD_TEXT = ""
LATEST_CLIPBOARD_IMAGE_PATH = None

_last_text_hash = None
_last_image_hash = None
_last_image_filename = None
_last_seq = None

def _get_clipboard_sequence():
    if sys.platform == "win32":
        try:
            import ctypes
            return ctypes.windll.user32.GetClipboardSequenceNumber()
        except Exception:
            return None
    return None


class ClipboardWatcher(threading.Thread):
    def __init__(self, save_dir, poll_interval=0.5):
        super().__init__(daemon=True)
        self.save_dir = save_dir
        os.makedirs(save_dir, exist_ok=True)
        self.poll_interval = poll_interval
        self._stop_flag = False

    def stop(self):
        self._stop_flag = True

    def run(self):
        print("[ClipboardBridge] 감시 스레드 진입 성공, 루프 시작", flush=True)
        global _last_seq
        while not self._stop_flag:
            try:
                seq = _get_clipboard_sequence()
                if seq is not None:
                    if seq != _last_seq:
                        _last_seq = seq
                        self._check_text(force=True)
                        self._check_image(force=True)
                else:
                    self._check_text(force=False)
                    self._check_image(force=False)
            except Exception as e:
                print(f"[ClipboardBridge] 감시 중 오류: {e}", flush=True)
            time.sleep(self.poll_interval)

    def _check_text(self, force=False):
        global _last_text_hash, LATEST_CLIPBOARD_TEXT
        if pyperclip is None:
            return
        try:
            text = pyperclip.paste()
        except Exception:
            return
        if not text:
            return
        h = hashlib.md5(text.encode("utf-8", "ignore")).hexdigest()
        if not force and h == _last_text_hash:
            return
        _last_text_hash = h
        LATEST_CLIPBOARD_TEXT = text
        print(f"[ClipboardBridge] 새 텍스트 감지: {text[:30]!r}", flush=True)
        PromptServer.instance.send_sync("clipboard.text", {"text": text})

    def _save_new(self, data):
        filename = f"clip_{int(time.time()*1000)}.png"
        filepath = os.path.join(self.save_dir, filename)
        with open(filepath, "wb") as f:
            f.write(data)
        return filename

    def _check_image(self, force=False):
        global _last_image_hash, _last_image_filename, LATEST_CLIPBOARD_IMAGE_PATH
        try:
            img = ImageGrab.grabclipboard()
        except Exception:
            return
        if img is None or not hasattr(img, "save"):
            return

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()
        h = hashlib.md5(data).hexdigest()

        if h == _last_image_hash:
            if not force:
                return
            filename = _last_image_filename
            if filename is None or not os.path.exists(os.path.join(self.save_dir, filename)):
                filename = self._save_new(data)
        else:
            filename = self._save_new(data)

        _last_image_hash = h
        _last_image_filename = filename
        LATEST_CLIPBOARD_IMAGE_PATH = os.path.join(self.save_dir, filename)
        print(f"[ClipboardBridge] 새 이미지 감지: {filename}", flush=True)
        PromptServer.instance.send_sync("clipboard.image", {"filename": filename})


_watcher_instance = None


def start_watcher(save_dir):
    global _watcher_instance
    if _watcher_instance is None:
        _watcher_instance = ClipboardWatcher(save_dir)
        _watcher_instance.start()
        print("[ClipboardBridge] 클립보드 감시 시작됨", flush=True)
    return _watcher_instance
