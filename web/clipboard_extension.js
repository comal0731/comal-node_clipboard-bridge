import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const MAX_TEXT_HISTORY = 10;
const MAX_IMAGE_HISTORY = 5;
const CHECK_INTERVAL_MS = 10000;

let lastActivityTime = Date.now();

function findNodesByType(type) {
    return app.graph._nodes.filter((n) => n.type === type);
}

function hideWidget(widget) {
    if (!widget) return;
    widget.computeSize = () => [0, -4];
    widget.draw = () => {};
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
            const halfWidth = (widgetWidth - margin * 2 - gap) / 2;
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
        computeSize(width) {
            return [width, 24];
        },
    };
    node.widgets = node.widgets || [];
    node.widgets.push(widget);
    return widget;
}

function getSafetySettings() {
    const nodes = findNodesByType("ClipboardSafetyOptions");
    if (nodes.length === 0) {
        return { resetOnReload: true, autoOffMinutes: 30 };
    }
    const node = nodes[0];
    const resetWidget = node.widgets?.find((w) => w.name === "reset_on_reload");
    const minutesWidget = node.widgets?.find((w) => w.name === "auto_off_minutes");
    return {
        resetOnReload: resetWidget ? resetWidget.value : true,
        autoOffMinutes: minutesWidget ? minutesWidget.value : 30,
    };
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
    const { resetOnReload } = getSafetySettings();
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
    if (pathWidget) pathWidget.value = subpath;

    let subfolder = "";
    let filename = subpath;
    if (subpath.includes("/")) {
        const idx = subpath.indexOf("/");
        subfolder = subpath.slice(0, idx);
        filename = subpath.slice(idx + 1);
    }

    const img = new Image();
    img.src = `/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=input&t=${Date.now()}`;
    img.onload = () => {
        node.imgs = [img];
        node.setSizeForImage?.();
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

app.registerExtension({
    name: "clipboard.bridge.live",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ClipboardImageBridge") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);

                requestAnimationFrame(() => {
                    this.setSize([300, 420]);
                    app.canvas.setDirty(true, true);
                });

                hideWidget(this.widgets?.find((w) => w.name === "image_path"));
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
                    return !!(e.dataTransfer && e.dataTransfer.types.includes("Files"));
                };
                this.onDragDrop = function (e) {
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
                    if (pathWidget && pathWidget.value) {
                        applyImageToNode(this, pathWidget.value);
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
            const { autoOffMinutes } = getSafetySettings();
            if (!autoOffMinutes || autoOffMinutes <= 0) return;
            const elapsedMs = Date.now() - lastActivityTime;
            if (elapsedMs >= autoOffMinutes * 60 * 1000) {
                turnOffAllListen();
            }
        }, CHECK_INTERVAL_MS);

        api.addEventListener("clipboard.text", (event) => {
            const newText = event.detail.text;
            const receivers = findNodesByType("ClipboardTextReceiver");
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

                pushHistory(node, result, MAX_TEXT_HISTORY);
                textWidget.value = result;
            });
            app.canvas.setDirty(true, true);
        });

        api.addEventListener("clipboard.image", (event) => {
            const filename = event.detail.filename;
            const subpath = `clipboard/${filename}`;
            const bridges = findNodesByType("ClipboardImageBridge");
            bridges.forEach((node) => {
                const listenWidget = node.widgets?.find((w) => w.name === "listen");
                const isListening = listenWidget ? listenWidget.value : false;
                if (!isListening) return;

                pushHistory(node, subpath, MAX_IMAGE_HISTORY);
                applyImageToNode(node, subpath);
            });
        });
    },
});
