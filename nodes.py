import os
import numpy as np
import torch
import folder_paths
from PIL import Image
from . import clipboard_watcher as cw


class ClipboardTextOptions:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": (["Append", "Replace", "Fixed+New"],),
                              "separator": ("STRING", {"default": ", "}),
                              "fixed_text": ("STRING", {"multiline": True, "default": ""})}}
    RETURN_TYPES = ("CLIP_OPT",)
    RETURN_NAMES = ("options",)
    FUNCTION = "build"
    CATEGORY = "clipboard_bridge"

    def build(self, mode, separator, fixed_text):
        return ({"mode": mode, "separator": separator, "fixed_text": fixed_text},)


class ClipboardSafetyOptions:
    """캔버스에 하나만 놓아두면 전역으로 적용되는 안전 설정 노드.
    다른 노드와 연결할 필요 없음 (JS가 캔버스에서 찾아서 전역 규칙으로 사용)."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
                    "reset_on_reload": ("BOOLEAN", {"default": True, "label_on": "Reset ON", "label_off": "Reset OFF"}),
                    "auto_off_minutes": ("INT", {"default": 30, "min": 0, "max": 999, "step": 1}),
                }}
    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "clipboard_bridge"

    def noop(self, reset_on_reload=True, auto_off_minutes=30):
        return ()


class ClipboardTextReceiver:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
                    "current_text": ("STRING", {"multiline": True, "default": ""}),
                    "listen": ("BOOLEAN", {"default": False, "label_on": "Listening", "label_off": "Paused"}),
                    "history_json": ("STRING", {"default": "[]"}),
                    "history_index": ("INT", {"default": 0}),
                },
                "optional": {"options": ("CLIP_OPT",)}}
    RETURN_TYPES = ("STRING",)
    FUNCTION = "combine"
    CATEGORY = "clipboard_bridge"

    def combine(self, current_text, listen=False, history_json="[]", history_index=0, options=None):
        return (current_text,)


class ClipboardImageBridge:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
                    "listen": ("BOOLEAN", {"default": False, "label_on": "Listening", "label_off": "Paused"}),
                    "image_path": ("STRING", {"default": ""}),
                    "history_json": ("STRING", {"default": "[]"}),
                    "history_index": ("INT", {"default": 0}),
                }}
    RETURN_TYPES = ("IMAGE", "MASK")
    FUNCTION = "load"
    CATEGORY = "clipboard_bridge"

    def load(self, listen=False, image_path="", history_json="[]", history_index=0):
        full_path = None
        if image_path:
            candidate = os.path.join(folder_paths.get_input_directory(), image_path)
            if os.path.exists(candidate):
                full_path = candidate
        if full_path is None and cw.LATEST_CLIPBOARD_IMAGE_PATH:
            full_path = cw.LATEST_CLIPBOARD_IMAGE_PATH

        if full_path is None or not os.path.exists(full_path):
            img = Image.new("RGB", (512, 512), color=(0, 0, 0))
        else:
            img = Image.open(full_path).convert("RGB")

        arr = np.array(img).astype(np.float32) / 255.0
        tensor = torch.from_numpy(arr)[None,]
        mask = torch.zeros((1, img.height, img.width), dtype=torch.float32)
        return (tensor, mask)


NODE_CLASS_MAPPINGS = {
    "ClipboardTextOptions": ClipboardTextOptions,
    "ClipboardSafetyOptions": ClipboardSafetyOptions,
    "ClipboardTextReceiver": ClipboardTextReceiver,
    "ClipboardImageBridge": ClipboardImageBridge,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ClipboardTextOptions": "Clipboard Text Options Comal",
    "ClipboardSafetyOptions": "Clipboard Safety Options Comal",
    "ClipboardTextReceiver": "Clipboard Text Receiver Comal",
    "ClipboardImageBridge": "Load Image Comal",
}
