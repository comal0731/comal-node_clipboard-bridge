import os
import folder_paths
from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .clipboard_watcher import start_watcher

WEB_DIRECTORY = "web"

save_dir = os.path.join(folder_paths.get_input_directory(), "clipboard")
start_watcher(save_dir)

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
