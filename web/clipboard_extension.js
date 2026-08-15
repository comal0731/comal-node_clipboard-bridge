import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// 이 파일이 실제로 로드/적용됐는지 브라우저 콘솔(F12)에서 바로 확인하기 위한 버전 마커.
// 드래그 앤 드롭이 안 될 때 콘솔에 이 로그가 안 보이면, ComfyUI가 이 파일을 아예
// 로드하지 않은 것(경로/캐시/재시작 문제)이므로 로직을 고칠 필요가 없다는 뜻이다.
console.log("[ClipboardBridge] clipboard_extension.js loaded (drag-drop-diagnostic build 2026-08-15)");

const MAX_TEXT_HISTORY = 10;
const MAX_IMAGE_HISTORY = 5;
const CHECK_INTERVAL_MS = 10000;
const INTERNAL_COPY_WINDOW_MS = 2000;

let lastActivityTime = Date.now();
let lastInternalTextCopyTime = 0;
let lastInternalImageCopyTime = 0;

function findNodesByType(type) {
    return app.graph._nodes.filter((n) => n.type === type);
}

function hideWidget(widget) {
    if (!widget) return;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
}

function syncMaskEditorImageWidget(node, subpath) {
    const widget = node.widgets?.find((w) => w.name === "image");
    if (!widget) return;
    widget.value = subpath;
    widget.callback?.(subpath, app.canvas, node, [0, 0]);
}

// 버튼 두 개를 한 줄에 나란히 그려주는 커스텀 위젯
function addDualButtonWidget(node, leftText, rightText, onLeft, onRight) {
    const widget = {
        type: "dual_button",
        name: "dual_button_" + Math.random().toString(36).slice(2),
        value: null,
        _leftBox: null,
        _rightBox: null,
        draw(ctx, node, widgetWidth, y, widgetHeight) {
            const margin = 10;
            const gap = 6;
            // ComfyUI can pass a stale computed widget width after selecting a
            // node. Always lay the row out from the node's current visual width
            // so the buttons cannot grow past its right edge.
            const liveWidth = Math.max(80, Number(node.size?.[0]) || widgetWidth || 80);
            const halfWidth = Math.max(20, (liveWidth - margin * 2 - gap) / 2);
            const height = widgetHeight || 20;

            ctx.fillStyle = "#353535";
            ctx.strokeStyle = "#666";
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.roundRect(margin, y, halfWidth, height, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#ccc";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "12px Arial";
            ctx.fillText(leftText, margin + halfWidth / 2, y + height / 2 + 1);

            const rightX = margin + halfWidth + gap;
            ctx.fillStyle = "#353535";
            ctx.beginPath();
            ctx.roundRect(rightX, y, halfWidth, height, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#ccc";
            ctx.fillText(rightText, rightX + halfWidth / 2, y + height / 2 + 1);

            widget._leftBox = [margin, y, halfWidth, height];
            widget._rightBox = [rightX, y, halfWidth, height];
        },
        mouse(event, pos, node) {
            if (event.type !== "pointerdown" && event.type !== "mousedown") return false;
            const [x, y] = pos;
            const inBox = (box) =>
                box && x >= box[0] && x <= box[0] + box[2] && y >= box[1] && y <= box[1] + box[3];
            if (inBox(widget._leftBox)) {
                onLeft();
                return true;
            }
            if (inBox(widget._rightBox)) {
                onRight();
                return true;
            }
            return false;
        },
        computeSize() {
            // Returning the current node width here makes LiteGraph feed that
            // width back into the node's minimum size.  The surrounding widget
            // margins are then added again on every workflow reload, so the
            // Undo/Redo row (and eventually the node) keeps growing.
            // The buttons already use the live width passed to draw().
            return [0, 24];
        },
    };
    node.widgets = node.widgets || [];
    node.widgets.push(widget);
    return widget;
}

function getGlobalSettings() {
    const nodes = findNodesByType("ClipboardSafetyOptions");
    if (nodes.length === 0) {
        return {
            resetOnReload: true,
            autoOffMinutes: 30,
            acceptInternalText: false,
            acceptInternalImage: false,
            focusOnText: false,
            focusOnImage: false,
        };
    }
    const node = nodes[0];
    const resetWidget = node.widgets?.find((w) => w.name === "reset_listen");
    const minutesWidget = node.widgets?.find((w) => w.name === "idle_off_minutes");
    const internalTextWidget = node.widgets?.find((w) => w.name === "allow_comfy_text");
    const internalImageWidget = node.widgets?.find((w) => w.name === "allow_comfy_image");
    const focusTextWidget = node.widgets?.find((w) => w.name === "focus_text_tab");
    const focusImageWidget = node.widgets?.find((w) => w.name === "focus_image_tab");
    return {
        resetOnReload: resetWidget ? resetWidget.value : true,
        autoOffMinutes: minutesWidget ? minutesWidget.value : 30,
        acceptInternalText: internalTextWidget ? internalTextWidget.value : false,
        acceptInternalImage: internalImageWidget ? internalImageWidget.value : false,
        focusOnText: focusTextWidget ? focusTextWidget.value : false,
        focusOnImage: focusImageWidget ? focusImageWidget.value : false,
    };
}

function markInternalCopy(event) {
    const now = Date.now();
    const types = Array.from(event.clipboardData?.types || []);
    const hasImage = types.some((type) => type.startsWith("image/"));
    const hasText = types.some((type) => type.startsWith("text/"));

    // Some browser/native copy commands do not expose their MIME type to the
    // page. Mark both in that case so an internal copy cannot leak through.
    if (hasText || !hasImage) lastInternalTextCopyTime = now;
    if (hasImage || !hasText) lastInternalImageCopyTime = now;
}

function markInternalCopyShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key?.toLowerCase() !== "c") return;
    // LiteGraph may consume Ctrl/Cmd+C before the browser dispatches a copy
    // event (for example when copying nodes), so cover that path as unknown.
    const now = Date.now();
    lastInternalTextCopyTime = now;
    lastInternalImageCopyTime = now;
}

function isRecentInternalCopy(kind) {
    const copiedAt = kind === "text" ? lastInternalTextCopyTime : lastInternalImageCopyTime;
    return Date.now() - copiedAt <= INTERNAL_COPY_WINDOW_MS;
}

function requestComfyTabFocus() {
    // Browsers may reject background-tab activation without a user gesture.
    // This is the strongest standards-based request available to a web
    // extension running inside the ComfyUI page.
    window.focus();
    app.canvas?.canvas?.focus?.({ preventScroll: true });
}

function turnOffAllListen() {
    findNodesByType("ClipboardTextReceiver").forEach((node) => {
        const w = node.widgets?.find((w) => w.name === "listen");
        if (w) w.value = false;
    });
    findNodesByType("ClipboardImageBridge").forEach((node) => {
        const w = node.widgets?.find((w) => w.name === "listen");
        if (w) w.value = false;
    });
    app.canvas.setDirty(true, true);
}

function forceListenOffIfNeeded(node) {
    const { resetOnReload } = getGlobalSettings();
    if (!resetOnReload) return;
    const listenWidget = node.widgets?.find((w) => w.name === "listen");
    if (listenWidget) listenWidget.value = false;
}

// ---------- 공용 히스토리 함수 (텍스트/이미지 둘 다 사용) ----------

function readHistory(node) {
    const histWidget = node.widgets?.find((w) => w.name === "history_json");
    if (!histWidget) return [];
    try {
        return JSON.parse(histWidget.value || "[]");
    } catch (e) {
        return [];
    }
}

function pushHistory(node, value, maxLen) {
    const histWidget = node.widgets?.find((w) => w.name === "history_json");
    const idxWidget = node.widgets?.find((w) => w.name === "history_index");
    if (!histWidget || !idxWidget) return;
    let history = readHistory(node);
    history.push(value);
    if (history.length > maxLen) {
        history = history.slice(history.length - maxLen);
    }
    histWidget.value = JSON.stringify(history);
    idxWidget.value = history.length - 1;
    node.graph?.change?.();
}

function moveHistory(node, delta, applyFn) {
    const idxWidget = node.widgets?.find((w) => w.name === "history_index");
    if (!idxWidget) return;
    const history = readHistory(node);
    if (history.length === 0) return;
    let idx = idxWidget.value ?? history.length - 1;
    idx += delta;
    if (idx < 0) idx = 0;
    if (idx > history.length - 1) idx = history.length - 1;
    idxWidget.value = idx;
    applyFn(history[idx]);
    app.canvas.setDirty(true, true);
}

// ---------- 이미지 관련 ----------

function applyImageToNode(node, subpath) {
    const pathWidget = node.widgets?.find((w) => w.name === "image_path");
    if (pathWidget && pathWidget.value !== subpath) {
        pathWidget.value = subpath;
        pathWidget.callback?.(subpath, app.canvas, node, [0, 0]);
        // Make ComfyUI record the hidden path widget as a workflow change.
        node.graph?.change?.();
    }
    syncMaskEditorImageWidget(node, subpath);

    const annotation = subpath.match(/\s+\[(input|output|temp)\]$/i);
    const imageType = annotation?.[1]?.toLowerCase() || "input";
    const cleanSubpath = subpath.replace(/\s+\[(input|output|temp)\]$/i, "");
    let subfolder = "";
    let filename = cleanSubpath;
    if (cleanSubpath.includes("/")) {
        const idx = cleanSubpath.lastIndexOf("/");
        subfolder = cleanSubpath.slice(0, idx);
        filename = cleanSubpath.slice(idx + 1);
    }

    const img = new Image();
    img.src = `/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${encodeURIComponent(imageType)}&t=${Date.now()}`;
    img.onload = () => {
        node.imgs = [img];
        // Keep the size chosen by the user. setSizeForImage() recalculates and
        // overwrites it each time the workflow/image is restored.
        app.canvas.setDirty(true, true);
    };
}

async function uploadImageFile(file) {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("subfolder", "clipboard");
    formData.append("type", "input");
    const resp = await fetch("/upload/image", { method: "POST", body: formData });
    const data = await resp.json();
    const subpath = `${data.subfolder ? data.subfolder + "/" : ""}${data.name}`;
    return subpath;
}

function getSelectedImageBridge() {
    const selectedNodes = Object.values(app.canvas?.selected_nodes || {});
    return selectedNodes.find((node) => node.type === "ClipboardImageBridge");
}

function pasteImageIntoSelectedNode(event) {
    const target = event.target;
    if (target?.matches?.("input, textarea, [contenteditable='true']")) return;

    const node = getSelectedImageBridge();
    if (!node) return;

    const file = Array.from(event.clipboardData?.items || [])
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();
    if (!file) return;

    // 이 붙여넣기는 OS 클립보드 감시(clipboard.image 소켓 이벤트)와 별개로
    // 브라우저의 네이티브 paste 이벤트를 직접 잡는 경로다. 아래 두 안전장치를
    // 반드시 지켜야 한다:
    //   1) listen 스위치가 꺼져 있으면(기본값) 이 노드는 아무것도 받지 않는다.
    //   2) Global Options의 "Allow Comfy Image"가 꺼져 있으면(기본값) ComfyUI
    //      내부에서 복사한 이미지(예: 다른 노드/미리보기 이미지 복사)는 걸러낸다.
    // 이 체크들이 없으면 사용자가 캔버스에서 아무 이미지나 복사했을 때 의도치
    // 않게 노드에 꽂혀버린다.
    const listenWidget = node.widgets?.find((w) => w.name === "listen");
    if (!(listenWidget ? listenWidget.value : false)) return;

    const { acceptInternalImage } = getGlobalSettings();
    if (!acceptInternalImage && isRecentInternalCopy("image")) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    uploadImageFile(file).then((subpath) => {
        pushHistory(node, subpath, MAX_IMAGE_HISTORY);
        applyImageToNode(node, subpath);
    });
}

// ---------- 전역 드래그 앤 드롭 (캔버스 히트테스트 우회용 백업 경로) ----------
//
// ComfyUI 프론트엔드 버전에 따라(특히 이미지가 이미 세팅된 노드 위에서) LiteGraph/Vue의
// dragover/drop 히트테스트가 노드를 못 찾는 경우가 있어 node.onDragOver/onDragDrop이
// 아예 호출되지 않는 문제가 있다. 여기서는 커서의 캔버스 좌표로 직접 노드를 찾아서
// 처리하므로 프론트엔드 내부 렌더링 방식(캔버스 vs DOM/Vue)과 무관하게 항상 동작한다.
function getImageBridgeAtEvent(event) {
    // Position-based lookup only (unlike paste, a drop has a real cursor
    // location) so we never hijack a drop meant for the empty canvas or a
    // different node just because a ClipboardImageBridge happens to be
    // selected elsewhere.
    try {
        app.canvas.adjustMouseEvent(event);
        const node = app.canvas.graph?.getNodeOnPos?.(event.canvasX, event.canvasY);
        console.log("[ClipboardBridge][dnd] getImageBridgeAtEvent ->", {
            canvasX: event.canvasX,
            canvasY: event.canvasY,
            foundNodeType: node?.type,
            foundNodeId: node?.id,
        });
        if (node && node.type === "ClipboardImageBridge") return node;
    } catch (e) {
        console.log("[ClipboardBridge][dnd] getImageBridgeAtEvent threw", e);
    }
    return null;
}

// text/uri-list (또는 구형 text/x-moz-url) 로만 이미지 URL을 넘겨주는 사이트를 위한 폴백.
// ComfyUI 코어(extractFilesFromDragEvent)도 Files가 없을 때 동일한 방식으로 처리하는데,
// 그 경로를 타면 우리 노드가 아니라 캔버스에 새 Load Image 노드가 생성되어 버리므로,
// 커서가 우리 노드 위에 있을 때는 우리가 먼저 가로채서 그 노드에 바로 넣어준다.
const URI_LIST_TYPES = ["text/uri-list", "text/x-moz-url"];

function getDroppedImageUrl(dataTransfer) {
    const type = URI_LIST_TYPES.find((t) => dataTransfer?.types?.includes(t));
    if (!type) return null;
    // text/uri-list can contain multiple lines (comments start with '#');
    // text/x-moz-url is "<url>\n<title>". Either way the first non-comment
    // line is the URL we want.
    const raw = dataTransfer.getData(type) || "";
    const url = raw.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    return url || null;
}

async function extractDroppedImageFile(dataTransfer) {
    const files = dataTransfer?.files;
    if (files && files.length > 0) {
        const file = files[0];
        return file.type.startsWith("image/") ? file : null;
    }

    const url = getDroppedImageUrl(dataTransfer);
    if (!url) return null;
    try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        if (!blob.type.startsWith("image/")) {
            console.log("[ClipboardBridge][dnd] uri-list fetch was not an image", url, blob.type);
            return null;
        }
        const name = url.split("/").pop()?.split("?")[0] || "dropped_image";
        return new File([blob], name, { type: blob.type });
    } catch (e) {
        console.log("[ClipboardBridge][dnd] failed to fetch dropped image url", url, e);
        return null;
    }
}

// dragover 시점에는 보안상 브라우저가 dataTransfer.getData()에 빈 문자열만
// 돌려주는 경우가 많다(types 목록만 미리보기 가능, 실제 값은 drop에서만 읽힘).
// 그래서 dragover에서는 타입 존재 여부만 보고, 실제 URL 추출은 drop에서 한다.
function dragEventTypesLookDroppable(dataTransfer) {
    return !!(
        dataTransfer?.types?.includes("Files") ||
        URI_LIST_TYPES.some((t) => dataTransfer?.types?.includes(t))
    );
}

function handleGlobalDragOver(event) {
    if (!dragEventTypesLookDroppable(event.dataTransfer)) {
        console.log("[ClipboardBridge][dnd] dragover ignored: no Files/uri-list type", Array.from(event.dataTransfer?.types || []));
        return;
    }
    if (!getImageBridgeAtEvent(event)) return;
    // Claim the event so both the legacy canvas handler and the Vue drop
    // zone leave it alone; without this the browser may show "no drop" and
    // the subsequent drop event can be cancelled by the default handler.
    event.preventDefault();
    event.stopPropagation();
}

async function handleGlobalDrop(event) {
    console.log("[ClipboardBridge][dnd] drop event fired, target=", event.target, "types=", Array.from(event.dataTransfer?.types || []));
    if (!dragEventTypesLookDroppable(event.dataTransfer)) return;
    const node = getImageBridgeAtEvent(event);
    if (!node) {
        console.log("[ClipboardBridge][dnd] drop ignored: no ClipboardImageBridge node under cursor");
        return;
    }

    // Snapshot dataTransfer synchronously: it becomes unusable once the drop
    // event handler returns, but the uri-list fallback needs to await fetch().
    const dataTransfer = event.dataTransfer;
    event.preventDefault();
    event.stopImmediatePropagation();

    const file = await extractDroppedImageFile(dataTransfer);
    if (!file) {
        console.log("[ClipboardBridge][dnd] drop ignored: could not resolve an image file", dataTransfer?.files?.[0]?.type);
        return;
    }

    console.log("[ClipboardBridge][dnd] uploading dropped file to node", node.id);
    uploadImageFile(file).then((subpath) => {
        pushHistory(node, subpath, MAX_IMAGE_HISTORY);
        applyImageToNode(node, subpath);
    });
}

app.registerExtension({
    name: "clipboard.bridge.live",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ClipboardImageBridge") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);

                hideWidget(this.widgets?.find((w) => w.name === "image_path"));
                hideWidget(this.widgets?.find((w) => w.name === "image"));
                hideWidget(this.widgets?.find((w) => w.name === "history_json"));
                hideWidget(this.widgets?.find((w) => w.name === "history_index"));

                addDualButtonWidget(
                    this,
                    "◀ Undo",
                    "Redo ▶",
                    () => moveHistory(this, -1, (subpath) => applyImageToNode(this, subpath)),
                    () => moveHistory(this, 1, (subpath) => applyImageToNode(this, subpath))
                );

                this.onDragOver = function (e) {
                    const ok = !!(e.dataTransfer && e.dataTransfer.types.includes("Files"));
                    console.log("[ClipboardBridge][dnd] node.onDragOver called, node=", this.id, "ok=", ok);
                    return ok;
                };
                this.onDragDrop = function (e) {
                    console.log("[ClipboardBridge][dnd] node.onDragDrop called, node=", this.id);
                    const files = e.dataTransfer?.files;
                    if (!files || files.length === 0) return false;
                    const file = files[0];
                    if (!file.type.startsWith("image/")) return false;
                    uploadImageFile(file).then((subpath) => {
                        pushHistory(this, subpath, MAX_IMAGE_HISTORY);
                        applyImageToNode(this, subpath);
                    });
                    return true;
                };
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                onConfigure?.apply(this, arguments);
                requestAnimationFrame(() => {
                    const pathWidget = this.widgets?.find((w) => w.name === "image_path");
                    const imageWidget = this.widgets?.find((w) => w.name === "image");
                    const currentPath = imageWidget?.value || pathWidget?.value;
                    if (currentPath) {
                        applyImageToNode(this, currentPath);
                    }
                    forceListenOffIfNeeded(this);
                });
            };
        }

        if (nodeData.name === "ClipboardTextReceiver") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);

                hideWidget(this.widgets?.find((w) => w.name === "history_json"));
                hideWidget(this.widgets?.find((w) => w.name === "history_index"));

                addDualButtonWidget(
                    this,
                    "◀ Undo",
                    "Redo ▶",
                    () =>
                        moveHistory(this, -1, (text) => {
                            const w = this.widgets?.find((w) => w.name === "current_text");
                            if (w) w.value = text;
                        }),
                    () =>
                        moveHistory(this, 1, (text) => {
                            const w = this.widgets?.find((w) => w.name === "current_text");
                            if (w) w.value = text;
                        })
                );
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                onConfigure?.apply(this, arguments);
                requestAnimationFrame(() => {
                    forceListenOffIfNeeded(this);
                });
            };
        }
    },

    async setup() {
        document.addEventListener("copy", markInternalCopy, true);
        document.addEventListener("keydown", markInternalCopyShortcut, true);
        document.addEventListener("paste", pasteImageIntoSelectedNode, true);
        document.addEventListener("dragover", handleGlobalDragOver, true);
        document.addEventListener("drop", handleGlobalDrop, true);
        console.log("[ClipboardBridge] dragover/drop listeners registered");

        ["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach((evt) => {
            document.addEventListener(
                evt,
                () => {
                    lastActivityTime = Date.now();
                },
                { passive: true }
            );
        });

        setInterval(() => {
            const { autoOffMinutes } = getGlobalSettings();
            if (!autoOffMinutes || autoOffMinutes <= 0) return;
            const elapsedMs = Date.now() - lastActivityTime;
            if (elapsedMs >= autoOffMinutes * 60 * 1000) {
                turnOffAllListen();
            }
        }, CHECK_INTERVAL_MS);

        api.addEventListener("clipboard.text", (event) => {
            const { acceptInternalText, focusOnText } = getGlobalSettings();
            if (!acceptInternalText && isRecentInternalCopy("text")) return;

            const newText = event.detail.text;
            const receivers = findNodesByType("ClipboardTextReceiver");
            let delivered = false;
            receivers.forEach((node) => {
                const textWidget = node.widgets?.find((w) => w.name === "current_text");
                if (!textWidget) return;

                const listenWidget = node.widgets?.find((w) => w.name === "listen");
                const isListening = listenWidget ? listenWidget.value : false;
                if (!isListening) return;

                const optionsInput = node.inputs?.find((inp) => inp.name === "options");
                let mode = "Replace";
                let separator = ", ";
                let fixedText = "";
                if (optionsInput && optionsInput.link != null) {
                    const link = app.graph.links[optionsInput.link];
                    const optionsNode = app.graph.getNodeById(link.origin_id);
                    if (optionsNode) {
                        const modeWidget = optionsNode.widgets?.find((w) => w.name === "mode");
                        const sepWidget = optionsNode.widgets?.find((w) => w.name === "separator");
                        const fixedWidget = optionsNode.widgets?.find((w) => w.name === "fixed_text");
                        mode = modeWidget?.value ?? mode;
                        separator = sepWidget?.value ?? separator;
                        fixedText = fixedWidget?.value ?? fixedText;
                    }
                }

                const currentText = textWidget.value ?? "";
                let result;
                if (mode === "Append") {
                    const base = currentText.trim();
                    result = base ? `${base}${separator}${newText}` : newText;
                } else if (mode === "Fixed+New") {
                    const base = fixedText.trim();
                    result = base ? `${base}${separator}${newText}` : newText;
                } else {
                    result = newText;
                }

                // 클립보드 내용이 실제로 바뀌지 않았다면(중복 이벤트 등) 히스토리를
                // 건드리지 않는다. 그렇지 않으면 Undo로 과거 내용을 선택해둔
                // 상태에서 중복 이벤트가 오는 순간 포인터가 다시 최신으로
                // 튕겨나가버린다.
                if (result === currentText) return;

                pushHistory(node, result, MAX_TEXT_HISTORY);
                textWidget.value = result;
                delivered = true;
            });
            if (delivered && focusOnText) requestComfyTabFocus();
            app.canvas.setDirty(true, true);
        });

        api.addEventListener("clipboard.image", (event) => {
            const { acceptInternalImage, focusOnImage } = getGlobalSettings();
            if (!acceptInternalImage && isRecentInternalCopy("image")) return;

            const filename = event.detail.filename;
            const subpath = `clipboard/${filename}`;
            const bridges = findNodesByType("ClipboardImageBridge");
            let delivered = false;
            bridges.forEach((node) => {
                const listenWidget = node.widgets?.find((w) => w.name === "listen");
                const isListening = listenWidget ? listenWidget.value : false;
                if (!isListening) return;

                // 이미 히스토리의 최신 항목과 동일한 이미지라면(중복 이벤트 등)
                // 다시 push하지 않는다. Undo로 과거 이미지를 선택해둔 상태에서
                // 같은 최신 이미지 이벤트가 재수신되면 히스토리 인덱스가 다시
                // 맨 끝(최신)으로 튕겨나가는 문제를 막는다.
                const history = readHistory(node);
                if (history.length > 0 && history[history.length - 1] === subpath) return;

                pushHistory(node, subpath, MAX_IMAGE_HISTORY);
                applyImageToNode(node, subpath);
                delivered = true;
            });
            if (delivered && focusOnImage) requestComfyTabFocus();
        });
    },
});
