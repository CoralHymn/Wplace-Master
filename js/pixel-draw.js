/**
 * 像素绘画工具 - 主程序
 */

// 状态管理
const state = {
    currentColor: null,
    currentTool: 'pencil',
    canvasWidth: 0,
    canvasHeight: 0,
    zoom: 20,
    canvasData: [],
    undoStack: [],
    redoStack: [],
    isDrawing: false,
    lastX: null,
    lastY: null,
    showGrid: false,
    startShapeX: null,
    startShapeY: null,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panOffsetX: 0,
    panOffsetY: 0,
    pinchStartDistance: 0,
    pinchStartZoom: 0,
    pinchStartCenterX: 0,
    pinchStartCenterY: 0,
    pinchStartPanX: 0,
    pinchStartPanY: 0,
    importedImage: null,
    canvasBgColor: '#f8f4f0'
};

// DOM元素
const canvas = document.getElementById('pixel-canvas');
const ctx = canvas.getContext('2d');
const canvasViewport = document.getElementById('canvas-viewport');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initPalette();
    checkForImportedImage();
    initEventListeners();
});

/**
 * 检查是否有从转换器导入的图片
 */
function checkForImportedImage() {
    const imageData = localStorage.getItem('pixel-master-import');
    if (imageData) {
        const img = new Image();
        img.onload = () => {
            state.importedImage = img;
            setCanvasSize(img.width, img.height);
            loadImageToCanvas(img);
            localStorage.removeItem('pixel-master-import');
        };
        img.src = imageData;
    }
}

/**
 * 设置画布尺寸
 */
function setCanvasSize(width, height) {
    state.canvasWidth = width;
    state.canvasHeight = height;
    state.canvasData = Array(height).fill(null).map(() => Array(width).fill(null));

    canvas.width = width;
    canvas.height = height;

    // 设置画布背景色
    canvas.style.backgroundColor = state.canvasBgColor;

    // 重置平移和缩放
    state.panOffsetX = 0;
    state.panOffsetY = 0;
    // 自动计算合适的缩放比例
    const container = document.getElementById('canvas-container');
    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    state.zoom = Math.max(1, Math.min(40, Math.floor(Math.min(containerWidth / width, containerHeight / height))));

    updateCanvasTransform();
    updateZoomDisplay();
    updateCanvasSizeInfo();
    renderCanvas();
}

/**
 * 将导入的图片加载到画布
 */
function loadImageToCanvas(img) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = state.canvasWidth;
    tempCanvas.height = state.canvasHeight;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(img, 0, 0, state.canvasWidth, state.canvasHeight);
    const imageData = tempCtx.getImageData(0, 0, state.canvasWidth, state.canvasHeight);

    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < state.canvasWidth; x++) {
            const i = (y * state.canvasWidth + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const a = imageData.data[i + 3];

            if (a > 128) {
                const color = findClosestColor(r, g, b);
                state.canvasData[y][x] = color;
            } else {
                state.canvasData[y][x] = null;
            }
        }
    }

    renderCanvas();
}

/**
 * 找到最接近的颜色
 */
function findClosestColor(r, g, b) {
    if (typeof COLOR_INFO === 'undefined') return `rgb(${r}, ${g}, ${b})`;

    let minDistance = Infinity;
    let closestColor = null;

    for (const [rgb, info] of Object.entries(COLOR_INFO)) {
        const match = rgb.match(/\d+/g);
        if (!match) continue;

        const cr = parseInt(match[0]);
        const cg = parseInt(match[1]);
        const cb = parseInt(match[2]);

        const distance = Math.sqrt(
            Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2)
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestColor = rgb;
        }
    }

    return closestColor;
}

/**
 * 初始化色板
 */
function initPalette() {
    // 移动端容器
    const freeColorsContainer = document.getElementById('free-colors');
    const paidColorsContainer = document.getElementById('paid-colors');
    
    // 桌面端容器
    const freeColorsContainerDesktop = document.getElementById('free-colors-desktop');
    const paidColorsContainerDesktop = document.getElementById('paid-colors-desktop');

    if (typeof COLOR_INFO === 'undefined') {
        console.error('COLOR_INFO 未定义');
        return;
    }

    const freeColors = [];
    const paidColors = [];

    for (const [rgb, info] of Object.entries(COLOR_INFO)) {
        if (info.isPaid) {
            paidColors.push({ rgb, ...info });
        } else {
            freeColors.push({ rgb, ...info });
        }
    }

    // 填充移动端容器
    freeColors.forEach(color => {
        freeColorsContainer.appendChild(createColorSwatch(color));
    });

    paidColors.forEach(color => {
        paidColorsContainer.appendChild(createColorSwatch(color, true));
    });
    
    // 填充桌面端容器
    if (freeColorsContainerDesktop && paidColorsContainerDesktop) {
        freeColors.forEach(color => {
            freeColorsContainerDesktop.appendChild(createColorSwatch(color));
        });

        paidColors.forEach(color => {
            paidColorsContainerDesktop.appendChild(createColorSwatch(color, true));
        });
    }

    if (freeColors.length > 0) {
        selectColor(freeColors[0]);
    }
}

/**
 * 创建颜色样本
 */
function createColorSwatch(colorInfo, isPaid = false) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (isPaid ? ' paid' : '');

    const rgbMatch = colorInfo.rgb.match(/\d+/g);
    if (rgbMatch) {
        swatch.style.backgroundColor = `rgb(${rgbMatch.join(',')})`;
    }

    swatch.dataset.color = colorInfo.rgb;
    swatch.dataset.name = colorInfo.name;
    swatch.title = colorInfo.name;
    swatch.addEventListener('click', () => selectColor(colorInfo));

    return swatch;
}

/**
 * 选择颜色
 */
function selectColor(colorInfo) {
    state.currentColor = colorInfo.rgb;

    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    const activeSwatch = document.querySelector(`.color-swatch[data-color="${colorInfo.rgb}"]`);
    if (activeSwatch) activeSwatch.classList.add('active');

    const preview = document.getElementById('current-color-preview');
    const name = document.getElementById('current-color-name');

    const rgbMatch = colorInfo.rgb.match(/\d+/g);
    if (rgbMatch) preview.style.backgroundColor = `rgb(${rgbMatch.join(',')})`;
    name.textContent = colorInfo.name;
}

/**
 * 更新画布变换
 */
function updateCanvasTransform() {
    canvas.style.width = (state.canvasWidth * state.zoom) + 'px';
    canvas.style.height = (state.canvasHeight * state.zoom) + 'px';
    canvas.style.transform = `translate(${state.panOffsetX}px, ${state.panOffsetY}px)`;
}

/**
 * 渲染画布
 */
function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < state.canvasWidth; x++) {
            if (state.canvasData[y][x]) {
                ctx.fillStyle = state.canvasData[y][x];
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    if (state.showGrid && state.zoom >= 8) {
        drawGrid();
    }
}

/**
 * 绘制网格
 */
function drawGrid() {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 0.5 / state.zoom;

    ctx.beginPath();
    for (let i = 0; i <= state.canvasWidth; i++) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, state.canvasHeight);
    }
    for (let i = 0; i <= state.canvasHeight; i++) {
        ctx.moveTo(0, i);
        ctx.lineTo(state.canvasWidth, i);
    }
    ctx.stroke();
}

/**
 * 绘制像素
 */
function drawPixel(x, y) {
    if (x < 0 || x >= state.canvasWidth || y < 0 || y >= state.canvasHeight) return;

    if (state.currentTool === 'eraser') {
        state.canvasData[y][x] = null;
    } else if (state.currentColor) {
        state.canvasData[y][x] = state.currentColor;
    }
}

/**
 * 获取画布坐标
 */
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / state.zoom);
    const y = Math.floor((e.clientY - rect.top) / state.zoom);
    return { x, y };
}

/**
 * Bresenham直线算法
 */
function drawLine(x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        if (x0 >= 0 && x0 < state.canvasWidth && y0 >= 0 && y0 < state.canvasHeight) {
            state.canvasData[y0][x0] = color;
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

/**
 * 绘制矩形
 */
function drawRect(x0, y0, x1, y1, color) {
    const minX = Math.max(0, Math.min(x0, x1));
    const maxX = Math.min(state.canvasWidth - 1, Math.max(x0, x1));
    const minY = Math.max(0, Math.min(y0, y1));
    const maxY = Math.min(state.canvasHeight - 1, Math.max(y0, y1));

    for (let x = minX; x <= maxX; x++) {
        state.canvasData[minY][x] = color;
        state.canvasData[maxY][x] = color;
    }

    for (let y = minY; y <= maxY; y++) {
        state.canvasData[y][minX] = color;
        state.canvasData[y][maxX] = color;
    }
}

/**
 * 绘制圆形
 */
function drawCircle(cx, cy, radius, color) {
    let x = radius;
    let y = 0;
    let err = 1 - radius;

    const drawCirclePixels = (cx, cy, x, y) => {
        const points = [
            [cx + x, cy + y], [cx - x, cy + y],
            [cx + x, cy - y], [cx - x, cy - y],
            [cx + y, cy + x], [cx - y, cy + x],
            [cx + y, cy - x], [cx - y, cy - x]
        ];

        points.forEach(([px, py]) => {
            if (px >= 0 && px < state.canvasWidth && py >= 0 && py < state.canvasHeight) {
                state.canvasData[py][px] = color;
            }
        });
    };

    while (x >= y) {
        drawCirclePixels(cx, cy, x, y);
        y++;
        if (err < 0) {
            err += 2 * y + 1;
        } else {
            x--;
            err += 2 * (y - x) + 1;
        }
    }
}

/**
 * 填充算法
 */
function floodFill(startX, startY, fillColor) {
    if (startX < 0 || startX >= state.canvasWidth || startY < 0 || startY >= state.canvasHeight) return;

    const targetColor = state.canvasData[startY][startX];
    if (targetColor === fillColor) return;

    const stack = [[startX, startY]];
    const visited = new Set();

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = `${x},${y}`;

        if (visited.has(key)) continue;
        if (x < 0 || x >= state.canvasWidth || y < 0 || y >= state.canvasHeight) continue;
        if (state.canvasData[y][x] !== targetColor) continue;

        visited.add(key);
        state.canvasData[y][x] = fillColor;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
}

/**
 * 保存状态
 */
function saveState() {
    state.undoStack.push(JSON.parse(JSON.stringify(state.canvasData)));
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
}

/**
 * 撤销
 */
function undo() {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(JSON.parse(JSON.stringify(state.canvasData)));
    state.canvasData = state.undoStack.pop();
    renderCanvas();
}

/**
 * 重做
 */
function redo() {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(JSON.parse(JSON.stringify(state.canvasData)));
    state.canvasData = state.redoStack.pop();
    renderCanvas();
}

/**
 * 清空画布
 */
function clearCanvas() {
    if (confirm('确定要清空画布吗？')) {
        saveState();
        state.canvasData = Array(state.canvasHeight).fill(null).map(() =>
            Array(state.canvasWidth).fill(null)
        );
        renderCanvas();
    }
}

/**
 * 导出PNG
 */
function downloadPNG() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = state.canvasWidth;
    exportCanvas.height = state.canvasHeight;
    const exportCtx = exportCanvas.getContext('2d');

    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < state.canvasWidth; x++) {
            if (state.canvasData[y][x]) {
                exportCtx.fillStyle = state.canvasData[y][x];
                exportCtx.fillRect(x, y, 1, 1);
            }
        }
    }

    const link = document.createElement('a');
    link.download = `pixel-art-${state.canvasWidth}x${state.canvasHeight}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

/**
 * 更新缩放显示
 */
function updateZoomDisplay() {
    document.getElementById('zoom-level').textContent = state.zoom + 'x';
}

/**
 * 更新画布尺寸信息
 */
function updateCanvasSizeInfo() {
    const info = document.getElementById('canvas-size-info');
    if (info) info.textContent = `画布: ${state.canvasWidth}×${state.canvasHeight}`;
}

/**
 * 处理导入图片
 */
function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            state.importedImage = img;
            saveState();
            setCanvasSize(img.width, img.height);
            loadImageToCanvas(img);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 禁用画布右键菜单
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    const container = document.getElementById('canvas-container');
    container.addEventListener('mousedown', handleContainerMouseDown);
    container.addEventListener('mousemove', handleContainerMouseMove);
    container.addEventListener('mouseup', handleContainerMouseUp);
    container.addEventListener('mouseleave', handleContainerMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTool = btn.dataset.tool;
        });
    });

    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('redo-btn').addEventListener('click', redo);
    document.getElementById('clear-btn').addEventListener('click', clearCanvas);
    document.getElementById('download-btn').addEventListener('click', downloadPNG);

    document.getElementById('grid-toggle').addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        document.getElementById('grid-toggle').classList.toggle('active', state.showGrid);
        renderCanvas();
    });

    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', handleImportFile);

    // 画布背景色按钮
    document.querySelectorAll('.bg-color-btn').forEach(btn => {
        btn.addEventListener('click', () => setCanvasBgColor(btn.dataset.color));
    });

    document.addEventListener('keydown', handleKeyDown);
}

function zoomIn() {
    state.zoom = Math.min(80, state.zoom + 1);
    updateCanvasTransform();
    updateZoomDisplay();
    renderCanvas();
}

function zoomOut() {
    state.zoom = Math.max(1, state.zoom - 1);
    updateCanvasTransform();
    updateZoomDisplay();
    renderCanvas();
}

function setCanvasBgColor(color) {
    state.canvasBgColor = color;
    canvas.style.backgroundColor = color;
    // 更新色板按钮状态
    document.querySelectorAll('.bg-color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
}

function handleMouseDown(e) {
    // 右键拖拽画布
    if (e.button === 2) {
        e.preventDefault();
        state.isPanning = true;
        state.panStartX = e.clientX - state.panOffsetX;
        state.panStartY = e.clientY - state.panOffsetY;
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (e.button !== 0) return;
    e.stopPropagation();
    const { x, y } = getCanvasCoords(e);

    if (state.currentTool === 'fill') {
        saveState();
        floodFill(x, y, state.currentColor);
        return;
    }

    if (state.currentTool === 'picker') {
        if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
            const color = state.canvasData[y][x];
            if (color) {
                for (const [rgb, info] of Object.entries(COLOR_INFO)) {
                    if (rgb === color) { selectColor(info); break; }
                }
            }
        }
        return;
    }

    if (state.currentTool === 'rect' || state.currentTool === 'circle') {
        state.isDrawing = true;
        state.startShapeX = x;
        state.startShapeY = y;
        saveState();
        return;
    }

    state.isDrawing = true;
    state.lastX = x;
    state.lastY = y;
    saveState();
    drawPixel(x, y);
    renderCanvas();
}

function handleMouseMove(e) {
    if (!state.isDrawing) return;

    const { x, y } = getCanvasCoords(e);

    if (state.currentTool === 'line' || state.currentTool === 'pencil' || state.currentTool === 'eraser') {
        drawLine(state.lastX, state.lastY, x, y, state.currentTool === 'eraser' ? null : state.currentColor);
        state.lastX = x;
        state.lastY = y;
        renderCanvas();
    } else if (state.currentTool === 'rect') {
        state.canvasData = JSON.parse(JSON.stringify(state.undoStack[state.undoStack.length - 1]));
        drawRect(state.startShapeX, state.startShapeY, x, y, state.currentColor);
        renderCanvas();
    } else if (state.currentTool === 'circle') {
        state.canvasData = JSON.parse(JSON.stringify(state.undoStack[state.undoStack.length - 1]));
        const radius = Math.max(Math.abs(x - state.startShapeX), Math.abs(y - state.startShapeY));
        drawCircle(state.startShapeX, state.startShapeY, radius, state.currentColor);
        renderCanvas();
    }
}

function handleMouseUp(e) {
    // 右键拖拽结束
    if (state.isPanning) {
        state.isPanning = false;
        canvas.style.cursor = 'crosshair';
        return;
    }

    state.isDrawing = false;
    state.startShapeX = null;
    state.startShapeY = null;
}

function handleContainerMouseDown(e) {
    if (e.target === canvas) return;
    state.isPanning = true;
    state.panStartX = e.clientX - state.panOffsetX;
    state.panStartY = e.clientY - state.panOffsetY;
    canvasViewport.style.cursor = 'grabbing';
}

function handleContainerMouseMove(e) {
    if (!state.isPanning) return;
    state.panOffsetX = e.clientX - state.panStartX;
    state.panOffsetY = e.clientY - state.panStartY;
    updateCanvasTransform();
}

function handleContainerMouseUp() {
    state.isPanning = false;
    canvasViewport.style.cursor = '';
}

function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const oldZoom = state.zoom;
    state.zoom = Math.max(1, Math.min(80, state.zoom + delta));

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const ratio = state.zoom / oldZoom;
    state.panOffsetX = mouseX - (mouseX - state.panOffsetX) * ratio;
    state.panOffsetY = mouseY - (mouseY - state.panOffsetY) * ratio;

    updateCanvasTransform();
    updateZoomDisplay();
    renderCanvas();
}

function handleTouchStart(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        state.pinchStartDistance = getTouchDistance(e.touches);
        state.pinchStartZoom = state.zoom;
        // 记录双指初始中心点
        state.pinchStartCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        state.pinchStartCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        state.pinchStartPanX = state.panOffsetX;
        state.pinchStartPanY = state.panOffsetY;
        return;
    }

    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);

        if (state.currentTool === 'fill') {
            saveState();
            floodFill(x, y, state.currentColor);
            return;
        }

        if (state.currentTool === 'picker') {
            if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
                const color = state.canvasData[y][x];
                if (color) {
                    for (const [rgb, info] of Object.entries(COLOR_INFO)) {
                        if (rgb === color) { selectColor(info); break; }
                    }
                }
            }
            return;
        }

        state.isDrawing = true;
        state.lastX = x;
        state.lastY = y;
        saveState();
        drawPixel(x, y);
        renderCanvas();
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scale = currentDistance / state.pinchStartDistance;
        
        // 计算新的双指中心点
        const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        
        // 计算中心点移动距离
        const deltaX = currentCenterX - state.pinchStartCenterX;
        const deltaY = currentCenterY - state.pinchStartCenterY;
        
        // 获取画布边界矩形
        const rect = canvas.getBoundingClientRect();
        const canvasCenterX = rect.left + rect.width / 2;
        const canvasCenterY = rect.top + rect.height / 2;
        
        // 计算相对于画布中心的鼠标位置
        const mouseX = currentCenterX - canvasCenterX;
        const mouseY = currentCenterY - canvasCenterY;
        
        // 应用缩放
        const oldZoom = state.zoom;
        state.zoom = Math.max(1, Math.min(80, Math.round(state.pinchStartZoom * scale)));
        const ratio = state.zoom / oldZoom;
        
        // 计算新的平移偏移
        state.panOffsetX = state.pinchStartPanX + deltaX + mouseX * (1 - ratio);
        state.panOffsetY = state.pinchStartPanY + deltaY + mouseY * (1 - ratio);
        
        updateCanvasTransform();
        updateZoomDisplay();
        renderCanvas();
        return;
    }

    if (e.touches.length === 1 && state.isDrawing) {
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);
        drawLine(state.lastX, state.lastY, x, y, state.currentTool === 'eraser' ? null : state.currentColor);
        state.lastX = x;
        state.lastY = y;
        renderCanvas();
    }
}

function handleTouchEnd() {
    state.isDrawing = false;
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        else if (e.key === 'y') { e.preventDefault(); redo(); }
        else if (e.key === 's') { e.preventDefault(); downloadPNG(); }
    }

    switch (e.key.toLowerCase()) {
        case 'b': document.querySelector('[data-tool="pencil"]')?.click(); break;
        case 'e': document.querySelector('[data-tool="eraser"]')?.click(); break;
        case 'g': document.querySelector('[data-tool="fill"]')?.click(); break;
        case 'i': document.querySelector('[data-tool="picker"]')?.click(); break;
        case 'l': document.querySelector('[data-tool="line"]')?.click(); break;
        case 'r': document.querySelector('[data-tool="rect"]')?.click(); break;
        case 'c': document.querySelector('[data-tool="circle"]')?.click(); break;
    }
}
