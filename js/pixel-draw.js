/**
 * 像素绘画工具 - 主程序
 */

// 状态管理
const state = {
    currentColor: null,
    currentTool: 'pencil',
    brushSize: 1, // 笔刷大小（像素）
    canvasWidth: 0,
    canvasHeight: 0,
    zoom: 20,
    layers: [],
    activeLayerIndex: 0,
    nextLayerId: 1,
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
    canvasBgColor: '#f8f4f0',
    // 用于优化性能
    needsRender: false,
    rafId: null
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

function getActiveData() {
    return state.layers[state.activeLayerIndex]?.data || null;
}

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

    state.layers = [{
        id: 1,
        name: '图层 1',
        visible: true,
        data: Array(height).fill(null).map(() => Array(width).fill(null))
    }];
    state.activeLayerIndex = 0;
    state.nextLayerId = 2;

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
    renderLayerList();
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
    const data = getActiveData();

    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < state.canvasWidth; x++) {
            const i = (y * state.canvasWidth + x) * 4;
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const a = imageData.data[i + 3];

            if (a > 128) {
                const color = findClosestColor(r, g, b);
                data[y][x] = color;
            } else {
                data[y][x] = null;
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

    // 添加透明颜色到免费颜色列表（作为第一个颜色）
    freeColors.push({ 
        rgb: 'transparent', 
        name: 'Transparent', 
        isPaid: false,
        isTransparent: true 
    });

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

    // 特殊处理透明颜色
    if (colorInfo.isTransparent) {
        // 使用棋盘格背景表示透明
        swatch.style.backgroundImage = `
            linear-gradient(45deg, #ccc 25%, transparent 25%),
            linear-gradient(-45deg, #ccc 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #ccc 75%),
            linear-gradient(-45deg, transparent 75%, #ccc 75%)
        `;
        swatch.style.backgroundSize = '8px 8px';
        swatch.style.backgroundPosition = '0 0, 0 4px, 4px -4px, -4px 0px';
        swatch.style.backgroundColor = '#fff';
    } else {
        const rgbMatch = colorInfo.rgb.match(/\d+/g);
        if (rgbMatch) {
            swatch.style.backgroundColor = `rgb(${rgbMatch.join(',')})`;
        }
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
    if (activeSwatch) {
        activeSwatch.classList.add('active');
    }

    const preview = document.getElementById('current-color-preview');
    const name = document.getElementById('current-color-name');

    // 特殊处理透明颜色的预览
    if (colorInfo.isTransparent) {
        preview.style.backgroundImage = `
            linear-gradient(45deg, #ccc 25%, transparent 25%),
            linear-gradient(-45deg, #ccc 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #ccc 75%),
            linear-gradient(-45deg, transparent 75%, #ccc 75%)
        `;
        preview.style.backgroundSize = '12px 12px';
        preview.style.backgroundPosition = '0 0, 0 6px, 6px -6px, -6px 0px';
        preview.style.backgroundColor = '#fff';
    } else {
        const rgbMatch = colorInfo.rgb.match(/\d+/g);
        if (rgbMatch) {
            preview.style.backgroundImage = 'none';
            preview.style.backgroundColor = `rgb(${rgbMatch.join(',')})`;
        }
    }
    name.textContent = colorInfo.name;
}

/**
 * 更新画布变换
 */
function updateCanvasTransform() {
    // 完全按照 index.html 的方式
    // canvas 保持原始尺寸，使用 transform 进行缩放和平移
    canvas.style.transform = `translate(${state.panOffsetX}px, ${state.panOffsetY}px) scale(${state.zoom})`;
    canvas.style.transformOrigin = '0 0';
}

/**
 * 优化的更新函数 - 使用 requestAnimationFrame
 */
function scheduleUpdate() {
    if (state.rafId) return; // 已经有待处理的帧
    
    state.rafId = requestAnimationFrame(() => {
        updateCanvasTransform();
        updateZoomDisplay();
        state.rafId = null;
    });
}

/**
 * 渲染画布
 */
function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const layer of state.layers) {
        if (!layer.visible) continue;
        for (let y = 0; y < state.canvasHeight; y++) {
            for (let x = 0; x < state.canvasWidth; x++) {
                if (layer.data[y][x]) {
                    ctx.fillStyle = layer.data[y][x];
                    ctx.fillRect(x, y, 1, 1);
                }
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
 * 绘制像素（支持笔刷大小）
 */
function drawPixel(x, y) {
    if (x < 0 || x >= state.canvasWidth || y < 0 || y >= state.canvasHeight) return;

    const activeData = getActiveData();
    if (!activeData) return;

    const radius = Math.floor(state.brushSize / 2);
    
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            const px = x + dx;
            const py = y + dy;
            
            if (px >= 0 && px < state.canvasWidth && py >= 0 && py < state.canvasHeight) {
                // 如果当前颜色是透明或橡皮擦工具，清除像素
                if (state.currentTool === 'eraser' || state.currentColor === 'transparent') {
                    activeData[py][px] = null;
                } else if (state.currentColor) {
                    activeData[py][px] = state.currentColor;
                }
            }
        }
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
 * Bresenham直线算法（支持笔刷大小）
 */
function drawLine(x0, y0, x1, y1, color) {
    const activeData = getActiveData();
    if (!activeData) return;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        // 在每个点上应用笔刷大小
        const radius = Math.floor(state.brushSize / 2);
        for (let by = -radius; by <= radius; by++) {
            for (let bx = -radius; bx <= radius; bx++) {
                const px = x0 + bx;
                const py = y0 + by;
                if (px >= 0 && px < state.canvasWidth && py >= 0 && py < state.canvasHeight) {
                    // 如果颜色是透明，清除像素
                    activeData[py][px] = (color === 'transparent' || color === null) ? null : color;
                }
            }
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
    const activeData = getActiveData();
    if (!activeData) return;

    const minX = Math.max(0, Math.min(x0, x1));
    const maxX = Math.min(state.canvasWidth - 1, Math.max(x0, x1));
    const minY = Math.max(0, Math.min(y0, y1));
    const maxY = Math.min(state.canvasHeight - 1, Math.max(y0, y1));

    for (let x = minX; x <= maxX; x++) {
        activeData[minY][x] = color;
        activeData[maxY][x] = color;
    }

    for (let y = minY; y <= maxY; y++) {
        activeData[y][minX] = color;
        activeData[y][maxX] = color;
    }
}

/**
 * 绘制圆形
 */
function drawCircle(cx, cy, radius, color) {
    const activeData = getActiveData();
    if (!activeData) return;

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
                activeData[py][px] = color;
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

    const activeData = getActiveData();
    if (!activeData) return;

    const targetColor = activeData[startY][startX];
    // 允许用透明色填充
    if (targetColor === fillColor) return;

    const stack = [[startX, startY]];
    const visited = new Set();

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = `${x},${y}`;

        if (visited.has(key)) continue;
        if (x < 0 || x >= state.canvasWidth || y < 0 || y >= state.canvasHeight) continue;
        if (activeData[y][x] !== targetColor) continue;

        visited.add(key);
        // 如果填充色是透明，设置为null
        activeData[y][x] = (fillColor === 'transparent') ? null : fillColor;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
}

/**
 * 全局填充算法 - 填充画布中所有与目标颜色相同的像素
 */
function globalFill(targetColor, fillColor) {
    saveState();
    
    const activeData = getActiveData();
    if (!activeData) return;

    const width = state.canvasWidth;
    const height = state.canvasHeight;
    let fillCount = 0;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentColor = activeData[y][x];
            
            // 如果当前像素颜色与目标颜色相同，则填充
            if (currentColor === targetColor && currentColor !== fillColor) {
                activeData[y][x] = (fillColor === 'transparent') ? null : fillColor;
                fillCount++;
            }
        }
    }
    
    renderCanvas();
    
    // 显示填充结果提示
    if (fillCount > 0) {
        showNotification(`已填充 ${fillCount} 个像素`);
    } else {
        showNotification('没有找到可填充的像素');
    }
}

/**
 * 显示通知消息
 */
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 2秒后自动消失
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 2000);
}

/**
 * 保存状态
 */
function saveState() {
    const snapshot = state.layers.map(l => ({
        data: JSON.parse(JSON.stringify(l.data))
    }));
    state.undoStack.push(snapshot);
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
}

/**
 * 撤销
 */
function undo() {
    if (state.undoStack.length === 0) return;
    const snapshot = state.undoStack.pop();
    // 保存当前状态到 redo
    state.redoStack.push(state.layers.map(l => ({
        data: JSON.parse(JSON.stringify(l.data))
    })));
    // 恢复
    snapshot.forEach((s, i) => {
        if (state.layers[i]) state.layers[i].data = s.data;
    });
    renderCanvas();
    renderLayerList();
}

/**
 * 重做
 */
function redo() {
    if (state.redoStack.length === 0) return;
    const snapshot = state.redoStack.pop();
    // 保存当前状态到 undo
    state.undoStack.push(state.layers.map(l => ({
        data: JSON.parse(JSON.stringify(l.data))
    })));
    // 恢复
    snapshot.forEach((s, i) => {
        if (state.layers[i]) state.layers[i].data = s.data;
    });
    renderCanvas();
    renderLayerList();
}

/**
 * 清空画布
 */
function clearCanvas() {
    if (confirm('确定要清空画布吗？')) {
        saveState();
        const activeData = getActiveData();
        if (activeData) {
            for (let y = 0; y < state.canvasHeight; y++) {
                for (let x = 0; x < state.canvasWidth; x++) {
                    activeData[y][x] = null;
                }
            }
        }
        renderCanvas();
        renderLayerList();
    }
}

/**
 * 自动描边功能
 * @param {string} outlineType - 'inner'（内边线）或 'outer'（外边线）或 'both'（内外边线）
 */
function autoOutline(outlineType = 'both') {
    if (!state.currentColor || state.currentColor === 'transparent') {
        alert('请先选择一个颜色！');
        return;
    }

    saveState();
    
    const activeData = getActiveData();
    if (!activeData) return;

    const newData = createLayerDataSnapshot();
    const width = state.canvasWidth;
    const height = state.canvasHeight;
    
    // 遍历所有像素，检测边缘
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isOpaque = activeData[y][x] !== null;
            
            if (outlineType === 'inner' || outlineType === 'both') {
                // 内边线：在不透明像素上，如果周围有透明像素，则绘制边线
                if (isOpaque && hasTransparentNeighbor(x, y)) {
                    newData[y][x] = state.currentColor;
                }
            }
            
            if (outlineType === 'outer' || outlineType === 'both') {
                // 外边线：在透明像素上，如果周围有不透明像素，则绘制边线
                if (!isOpaque && hasOpaqueNeighbor(x, y)) {
                    newData[y][x] = state.currentColor;
                }
            }
        }
    }
    
    state.layers[state.activeLayerIndex].data = newData;
    renderCanvas();
}

/**
 * 检查像素是否有透明邻居（8方向）
 */
function hasTransparentNeighbor(x, y) {
    const activeData = getActiveData();
    if (!activeData) return false;

    const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
    ];
    
    for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        
        // 边界外的视为透明
        if (nx < 0 || nx >= state.canvasWidth || ny < 0 || ny >= state.canvasHeight) {
            return true;
        }
        
        if (activeData[ny][nx] === null) {
            return true;
        }
    }
    
    return false;
}

/**
 * 检查像素是否有不透明邻居（8方向）
 */
function hasOpaqueNeighbor(x, y) {
    const activeData = getActiveData();
    if (!activeData) return false;

    const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
    ];
    
    for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        
        // 边界外不算
        if (nx < 0 || nx >= state.canvasWidth || ny < 0 || ny >= state.canvasHeight) {
            continue;
        }
        
        if (activeData[ny][nx] !== null) {
            return true;
        }
    }
    
    return false;
}

/**
 * 从图层中获取指定坐标的颜色（从顶层到底层查找）
 */
function getLayerPixelColor(x, y) {
    for (let i = state.layers.length - 1; i >= 0; i--) {
        if (!state.layers[i].visible) continue;
        if (state.layers[i].data[y] && state.layers[i].data[y][x] !== null) {
            return state.layers[i].data[y][x];
        }
    }
    return null;
}

/**
 * 导出PNG
 */
function downloadPNG() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = state.canvasWidth;
    exportCanvas.height = state.canvasHeight;
    const exportCtx = exportCanvas.getContext('2d');

    for (const layer of state.layers) {
        if (!layer.visible) continue;
        for (let y = 0; y < state.canvasHeight; y++) {
            for (let x = 0; x < state.canvasWidth; x++) {
                if (layer.data[y][x]) {
                    exportCtx.fillStyle = layer.data[y][x];
                    exportCtx.fillRect(x, y, 1, 1);
                }
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
    // 只显示小数点后一位
    document.getElementById('zoom-level').textContent = state.zoom.toFixed(1) + 'x';
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
 * 显示创建画布对话框
 */
function showCreateCanvasDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
        <div class="confirm-dialog create-canvas-dialog">
            <div class="confirm-message">创建空白画布</div>
            <div class="create-canvas-inputs">
                <div class="canvas-input-group">
                    <label for="canvas-input-width">宽度 (px)</label>
                    <input type="number" id="canvas-input-width" min="1" max="10000" value="100" class="canvas-size-input">
                </div>
                <span class="canvas-input-sep">×</span>
                <div class="canvas-input-group">
                    <label for="canvas-input-height">高度 (px)</label>
                    <input type="number" id="canvas-input-height" min="1" max="10000" value="100" class="canvas-size-input">
                </div>
            </div>
            <div class="create-canvas-presets">
                <span class="preset-label">预设:</span>
                <button class="preset-btn" data-w="16" data-h="16">16×16</button>
                <button class="preset-btn" data-w="32" data-h="32">32×32</button>
                <button class="preset-btn" data-w="64" data-h="64">64×64</button>
                <button class="preset-btn" data-w="100" data-h="100">100×100</button>
                <button class="preset-btn" data-w="128" data-h="128">128×128</button>
                <button class="preset-btn" data-w="256" data-h="256">256×256</button>
            </div>
            <div class="confirm-buttons">
                <button class="confirm-btn cancel">取消</button>
                <button class="confirm-btn confirm" style="background:#007bff;">创建</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    const widthInput = dialog.querySelector('#canvas-input-width');
    const heightInput = dialog.querySelector('#canvas-input-height');

    // 预设按钮
    dialog.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            widthInput.value = btn.dataset.w;
            heightInput.value = btn.dataset.h;
            widthInput.focus();
            widthInput.select();
        });
    });

    // 限制输入范围
    [widthInput, heightInput].forEach(input => {
        input.addEventListener('input', () => {
            let val = parseInt(input.value);
            if (val > 10000) input.value = 10000;
            if (val < 1) input.value = 1;
        });
    });

    // 回车键创建
    dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const w = Math.max(1, Math.min(10000, parseInt(widthInput.value) || 100));
            const h = Math.max(1, Math.min(10000, parseInt(heightInput.value) || 100));
            document.body.removeChild(dialog);
            createBlankCanvas(w, h);
        }
    });

    dialog.querySelector('.cancel').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });

    dialog.querySelector('.confirm').addEventListener('click', () => {
        const w = Math.max(1, Math.min(10000, parseInt(widthInput.value) || 100));
        const h = Math.max(1, Math.min(10000, parseInt(heightInput.value) || 100));
        document.body.removeChild(dialog);
        createBlankCanvas(w, h);
    });

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });

    // 自动聚焦宽度输入框
    setTimeout(() => {
        widthInput.focus();
        widthInput.select();
    }, 100);
}

/**
 * 创建空白画布
 */
function createBlankCanvas(width, height) {
    state.undoStack = [];
    state.redoStack = [];
    state.importedImage = null;
    state.isDrawing = false;
    state.lastX = null;
    state.lastY = null;

    setCanvasSize(width, height);
    renderLayerList();
    showNotification(`已创建 ${width}×${height} 空白画布`);
}

/**
 * 从undo快照恢复所有图层数据
 */
function restoreFromUndoSnapshot() {
    const snapshot = state.undoStack[state.undoStack.length - 1];
    snapshot.forEach((s, i) => {
        if (state.layers[i]) state.layers[i].data = JSON.parse(JSON.stringify(s.data));
    });
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
    canvas.addEventListener('mouseleave', () => {
        canvas.title = '';
        handleMouseUp();
    });

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
            
            // 根据工具更新光标
            if (state.currentTool === 'move') {
                canvas.style.cursor = 'grab';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        });
    });

    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('redo-btn').addEventListener('click', redo);
    document.getElementById('clear-btn').addEventListener('click', clearCanvas);
    document.getElementById('download-btn').addEventListener('click', downloadPNG);

    // 自动描边按钮 - 点击弹出选项
    document.getElementById('outline-btn').addEventListener('click', () => {
        showOutlineOptions();
    });

    document.getElementById('grid-toggle').addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        document.getElementById('grid-toggle').classList.toggle('active', state.showGrid);
        renderCanvas();
    });

    // 画布回归中心按钮
    document.getElementById('center-canvas-btn').addEventListener('click', () => {
        centerCanvas();
    });

    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', handleImportFile);

    document.getElementById('new-canvas-btn').addEventListener('click', showCreateCanvasDialog);

    // 画布背景色按钮
    document.querySelectorAll('.bg-color-btn').forEach(btn => {
        btn.addEventListener('click', () => setCanvasBgColor(btn.dataset.color));
    });

    // 笔刷大小控制
    const brushSizeInput = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    if (brushSizeInput && brushSizeValue) {
        brushSizeInput.addEventListener('input', (e) => {
            state.brushSize = parseInt(e.target.value);
            brushSizeValue.textContent = state.brushSize;
        });
        
        brushSizeInput.addEventListener('change', (e) => {
            state.brushSize = parseInt(e.target.value);
            brushSizeValue.textContent = state.brushSize;
        });
    }

    document.addEventListener('keydown', handleKeyDown);

    // 图层面板按钮事件
    document.getElementById('add-layer-btn').addEventListener('click', addLayer);
    document.getElementById('delete-layer-btn').addEventListener('click', deleteLayer);
    document.getElementById('duplicate-layer-btn').addEventListener('click', duplicateLayer);
    document.getElementById('merge-down-btn').addEventListener('click', mergeDown);
    document.getElementById('move-layer-up-btn').addEventListener('click', moveLayerUp);
    document.getElementById('move-layer-down-btn').addEventListener('click', moveLayerDown);
    document.getElementById('layers-panel-close').addEventListener('click', () => {
        document.getElementById('layers-panel').classList.toggle('collapsed');
    });
}

function zoomIn() {
    const oldZoom = state.zoom;
    const zoomFactor = 1.1;
    state.zoom = Math.min(80, Math.round(state.zoom * zoomFactor));
    updateCanvasTransform();
    updateZoomDisplay();
}

function zoomOut() {
    const oldZoom = state.zoom;
    const zoomFactor = 1.1;
    state.zoom = Math.max(1, Math.round(state.zoom / zoomFactor));
    updateCanvasTransform();
    updateZoomDisplay();
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

    // 左键 + 移动工具 = 平移画布
    if (e.button === 0 && state.currentTool === 'move') {
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
        renderCanvas();
        return;
    }

    if (state.currentTool === 'global-fill') {
        // 全局填充：需要点击一个像素来确定要替换的颜色
        if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
            const activeData = getActiveData();
            if (!activeData) return;
            const targetColor = activeData[y][x];
            if (targetColor !== null) {
                globalFill(targetColor, state.currentColor);
            } else {
                showNotification('请点击有颜色的像素');
            }
        }
        return;
    }

    if (state.currentTool === 'picker') {
        if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
            const color = getLayerPixelColor(x, y);
            if (color) {
                // 尝试在色板中查找匹配的颜色
                let found = false;
                for (const [rgb, info] of Object.entries(COLOR_INFO)) {
                    if (rgb === color) {
                        // 重要：需要把rgb字段添加到info对象中
                        selectColor({ ...info, rgb: rgb });
                        showNotification(`已选取: ${info.name}`);
                        found = true;
                        break;
                    }
                }
                // 如果色板中没有这个颜色，创建一个临时颜色
                if (!found) {
                    const tempColorInfo = {
                        rgb: color,
                        name: color,
                        isPaid: false
                    };
                    selectColor(tempColorInfo);
                    showNotification(`已选取自定义颜色`);
                }
            } else {
                showNotification('该位置是透明的');
            }
        }
        return;
    }

    if (state.currentTool === 'rect' || state.currentTool === 'circle' || state.currentTool === 'line') {
        console.log('形状工具被点击:', state.currentTool, '坐标:', x, y);
        state.isDrawing = true;
        state.startShapeX = x;
        state.startShapeY = y;
        state.lastX = x;
        state.lastY = y;
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
    // 取色器模式：显示颜色提示
    if (state.currentTool === 'picker') {
        const { x, y } = getCanvasCoords(e);
        if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
            const color = getLayerPixelColor(x, y);
            if (color) {
                canvas.style.cursor = 'crosshair';
                canvas.title = `颜色: ${color}`;
            } else {
                canvas.style.cursor = 'crosshair';
                canvas.title = '透明';
            }
        }
        return;
    }

    if (!state.isDrawing) return;

    const { x, y } = getCanvasCoords(e);

    if (state.currentTool === 'pencil' || state.currentTool === 'eraser') {
        drawLine(state.lastX, state.lastY, x, y, state.currentTool === 'eraser' ? null : state.currentColor);
        state.lastX = x;
        state.lastY = y;
        renderCanvas();
    } else if (state.currentTool === 'line') {
        console.log('绘制直线:', state.startShapeX, state.startShapeY, '->', x, y);
        // 直线工具：恢复原始状态，然后绘制从起点到当前点的直线
        restoreFromUndoSnapshot();
        drawLine(state.startShapeX, state.startShapeY, x, y, state.currentColor);
        renderCanvas();
    } else if (state.currentTool === 'rect') {
        restoreFromUndoSnapshot();
        drawRect(state.startShapeX, state.startShapeY, x, y, state.currentColor);
        renderCanvas();
    } else if (state.currentTool === 'circle') {
        restoreFromUndoSnapshot();
        const radius = Math.max(Math.abs(x - state.startShapeX), Math.abs(y - state.startShapeY));
        drawCircle(state.startShapeX, state.startShapeY, radius, state.currentColor);
        renderCanvas();
    }
}

function handleMouseUp(e) {
    // 清除取色器的title提示
    canvas.title = '';
    
    // 右键拖拽结束或移动工具结束
    if (state.isPanning) {
        state.isPanning = false;
        // 根据当前工具恢复光标
        if (state.currentTool === 'move') {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'crosshair';
        }
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
    canvas.style.cursor = 'grabbing';
}

function handleContainerMouseMove(e) {
    if (!state.isPanning) return;
    state.panOffsetX = e.clientX - state.panStartX;
    state.panOffsetY = e.clientY - state.panStartY;
    scheduleUpdate();
}

function handleContainerMouseUp() {
    state.isPanning = false;
    // 根据当前工具恢复光标
    if (state.currentTool === 'move') {
        canvas.style.cursor = 'grab';
    } else {
        canvas.style.cursor = 'crosshair';
    }
}

function handleWheel(e) {
    e.preventDefault();
    const zoomFactor = 1.1;
    const oldZoom = state.zoom;

    // 计算新的缩放级别
    state.zoom *= (e.deltaY < 0 ? zoomFactor : 1 / zoomFactor);
    state.zoom = Math.max(1, Math.min(80, state.zoom));

    // 获取视口（canvas-container）的位置 - 与 index.html 一致
    const viewport = document.getElementById('canvas-container');
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 完全按照 index.html 的公式
    state.panOffsetX = mouseX - (mouseX - state.panOffsetX) * (state.zoom / oldZoom);
    state.panOffsetY = mouseY - (mouseY - state.panOffsetY) * (state.zoom / oldZoom);

    scheduleUpdate();
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

        // 如果是移动工具，启动平移模式
        if (state.currentTool === 'move') {
            state.isPanning = true;
            state.panStartX = touch.clientX - state.panOffsetX;
            state.panStartY = touch.clientY - state.panOffsetY;
            canvas.style.cursor = 'grabbing';
            return;
        }

        const { x, y } = getCanvasCoords(touch);

        if (state.currentTool === 'fill') {
            saveState();
            floodFill(x, y, state.currentColor);
            renderCanvas();
            return;
        }

        if (state.currentTool === 'global-fill') {
            // 全局填充：需要点击一个像素来确定要替换的颜色
            if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
                const activeData = getActiveData();
                if (!activeData) return;
                const targetColor = activeData[y][x];
                if (targetColor !== null) {
                    globalFill(targetColor, state.currentColor);
                } else {
                    showNotification('请点击有颜色的像素');
                }
            }
            return;
        }

        if (state.currentTool === 'picker') {
            if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
                const color = getLayerPixelColor(x, y);
                if (color) {
                    // 尝试在色板中查找匹配的颜色
                    let found = false;
                    for (const [rgb, info] of Object.entries(COLOR_INFO)) {
                        if (rgb === color) {
                            // 重要：需要把rgb字段添加到info对象中
                            selectColor({ ...info, rgb: rgb });
                            showNotification(`已选取: ${info.name}`);
                            found = true;
                            break;
                        }
                    }
                    // 如果色板中没有这个颜色，创建一个临时颜色
                    if (!found) {
                        const tempColorInfo = {
                            rgb: color,
                            name: color,
                            isPaid: false
                        };
                        selectColor(tempColorInfo);
                        showNotification(`已选取自定义颜色`);
                    }
                } else {
                    showNotification('该位置是透明的');
                }
            }
            return;
        }

        if (state.currentTool === 'rect' || state.currentTool === 'circle' || state.currentTool === 'line') {
            state.isDrawing = true;
            state.startShapeX = x;
            state.startShapeY = y;
            state.lastX = x;
            state.lastY = y;
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
}

function handleTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scale = currentDistance / state.pinchStartDistance;
        
        // 计算新的双指中心点（相对于视口）
        const viewport = document.getElementById('canvas-container');
        const viewportRect = viewport.getBoundingClientRect();
        
        const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        
        // 相对于视口的位置
        const mouseX = currentCenterX - viewportRect.left;
        const mouseY = currentCenterY - viewportRect.top;
        
        // 应用缩放
        const oldZoom = state.zoom;
        state.zoom = Math.max(1, Math.min(80, Math.round(state.pinchStartZoom * scale)));
        
        // 计算中心点移动距离（相对于初始位置）
        const startMouseX = state.pinchStartCenterX - viewportRect.left;
        const startMouseY = state.pinchStartCenterY - viewportRect.top;
        const deltaX = mouseX - startMouseX;
        const deltaY = mouseY - startMouseY;
        
        // 使用与滚轮相同的公式，但需要考虑手指移动
        state.panOffsetX = mouseX - (mouseX - (state.pinchStartPanX + deltaX)) * (state.zoom / oldZoom);
        state.panOffsetY = mouseY - (mouseY - (state.pinchStartPanY + deltaY)) * (state.zoom / oldZoom);
        
        scheduleUpdate();
        return;
    }

    // 移动工具的平移处理
    if (e.touches.length === 1 && state.isPanning) {
        e.preventDefault();
        const touch = e.touches[0];
        state.panOffsetX = touch.clientX - state.panStartX;
        state.panOffsetY = touch.clientY - state.panStartY;
        scheduleUpdate();
        return;
    }

    if (e.touches.length === 1 && state.isDrawing) {
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);
        
        if (state.currentTool === 'line') {
            // 直线工具：恢复原始状态，然后绘制从起点到当前点的直线
            restoreFromUndoSnapshot();
            drawLine(state.startShapeX, state.startShapeY, x, y, state.currentColor);
        } else if (state.currentTool === 'rect') {
            restoreFromUndoSnapshot();
            drawRect(state.startShapeX, state.startShapeY, x, y, state.currentColor);
        } else if (state.currentTool === 'circle') {
            restoreFromUndoSnapshot();
            const radius = Math.max(Math.abs(x - state.startShapeX), Math.abs(y - state.startShapeY));
            drawCircle(state.startShapeX, state.startShapeY, radius, state.currentColor);
        } else if (state.currentTool === 'pencil' || state.currentTool === 'eraser') {
            drawLine(state.lastX, state.lastY, x, y, state.currentTool === 'eraser' ? null : state.currentColor);
            state.lastX = x;
            state.lastY = y;
        }
        renderCanvas();
    }
}

function handleTouchEnd() {
    state.isDrawing = false;
    state.startShapeX = null;
    state.startShapeY = null;
    // 清除移动工具的平移状态
    if (state.isPanning) {
        state.isPanning = false;
        // 根据当前工具恢复光标
        if (state.currentTool === 'move') {
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    }
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
        case 'm': document.querySelector('[data-tool="move"]')?.click(); break;
        case 'b': document.querySelector('[data-tool="pencil"]')?.click(); break;
        case 'e': document.querySelector('[data-tool="eraser"]')?.click(); break;
        case 'g': 
            if (e.shiftKey) {
                e.preventDefault();
                document.querySelector('[data-tool="global-fill"]')?.click();
            } else {
                document.querySelector('[data-tool="fill"]')?.click();
            }
            break;
        case 'i': document.querySelector('[data-tool="picker"]')?.click(); break;
        case 'l': document.querySelector('[data-tool="line"]')?.click(); break;
        case 'r': document.querySelector('[data-tool="rect"]')?.click(); break;
        case 'c': document.querySelector('[data-tool="circle"]')?.click(); break;
        case 'o': 
            e.preventDefault();
            showOutlineOptions();
            break;
        case '[': 
            e.preventDefault();
            state.brushSize = Math.max(1, state.brushSize - 1);
            updateBrushSizeDisplay();
            break;
        case ']': 
            e.preventDefault();
            state.brushSize = Math.min(20, state.brushSize + 1);
            updateBrushSizeDisplay();
            break;
    }
}

/**
 * 更新笔刷大小显示
 */
function updateBrushSizeDisplay() {
    const brushSizeInput = document.getElementById('brush-size');
    const brushSizeValue = document.getElementById('brush-size-value');
    if (brushSizeInput) brushSizeInput.value = state.brushSize;
    if (brushSizeValue) brushSizeValue.textContent = state.brushSize;
}

/**
 * 检查画布是否有内容（非空像素）
 */
function hasCanvasContent() {
    if (!state.layers || state.layers.length === 0) return false;
    
    for (const layer of state.layers) {
        for (let y = 0; y < state.canvasHeight; y++) {
            for (let x = 0; x < state.canvasWidth; x++) {
                if (layer.data[y][x] !== null) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * 显示确认对话框
 */
function showConfirmDialog(message, onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
        <div class="confirm-dialog">
            <div class="confirm-message">${message}</div>
            <div class="confirm-buttons">
                <button class="confirm-btn cancel">取消</button>
                <button class="confirm-btn confirm">确定</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('.cancel').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
    
    dialog.querySelector('.confirm').addEventListener('click', () => {
        document.body.removeChild(dialog);
        if (onConfirm) onConfirm();
    });
    
    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
}

/**
 * 显示描边选项对话框
 */
function showOutlineOptions() {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog-overlay';
    dialog.innerHTML = `
        <div class="confirm-dialog outline-dialog">
            <div class="confirm-message">选择描边类型</div>
            <div class="outline-options">
                <button class="outline-option-btn" data-type="inner">
                    <div class="option-icon inner-icon"></div>
                    <div class="option-label">内边线</div>
                </button>
                <button class="outline-option-btn" data-type="outer">
                    <div class="option-icon outer-icon"></div>
                    <div class="option-label">外边线</div>
                </button>
                <button class="outline-option-btn" data-type="both">
                    <div class="option-icon both-icon"></div>
                    <div class="option-label">内外边线</div>
                </button>
            </div>
            <div class="confirm-buttons">
                <button class="confirm-btn cancel">取消</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 选项按钮事件
    dialog.querySelectorAll('.outline-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            document.body.removeChild(dialog);
            autoOutline(type);
        });
    });
    
    // 取消按钮
    dialog.querySelector('.cancel').addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
    
    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
        }
    });
}

/**
 * 处理返回转换器
 */
function handleBackToConverter() {
    if (hasCanvasContent()) {
        showConfirmDialog('画布上有作品，确定要返回吗？未保存的内容将丢失。', () => {
            window.location.href = 'index.html';
        });
    } else {
        window.location.href = 'index.html';
    }
}

/**
 * 画布回归中心
 */
function centerCanvas() {
    // 完全按照 index.html 的 centerImage 方式
    const viewport = document.getElementById('canvas-container');
    const viewportRect = viewport.getBoundingClientRect();
    const canvasWidth = state.canvasWidth * state.zoom;
    const canvasHeight = state.canvasHeight * state.zoom;

    state.panOffsetX = (viewportRect.width - canvasWidth) / 2;
    state.panOffsetY = (viewportRect.height - canvasHeight) / 2;
    
    updateCanvasTransform();
}

/**
 * 创建活跃图层数据的深度快照
 */
function createLayerDataSnapshot() {
    const activeData = getActiveData();
    return activeData ? JSON.parse(JSON.stringify(activeData)) : null;
}

/**
 * 渲染图层面板列表
 */
function renderLayerList() {
    const container = document.getElementById('layers-list');
    if (!container) return;
    container.innerHTML = '';

    state.layers.forEach((layer, index) => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        if (index === state.activeLayerIndex) item.classList.add('active');

        // 可见性切换
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'layer-visibility-btn';
        visibilityBtn.innerHTML = layer.visible
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
        visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLayerVisibility(index);
        });
        item.appendChild(visibilityBtn);

        // 缩略图 canvas
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = state.canvasWidth || 32;
        thumbCanvas.height = state.canvasHeight || 32;
        thumbCanvas.className = 'layer-thumb';
        const thumbCtx = thumbCanvas.getContext('2d');
        // 绘制棋盘格背景
        thumbCtx.fillStyle = '#ccc';
        for (let py = 0; py < (state.canvasHeight || 32); py += 4) {
            for (let px = 0; px < (state.canvasWidth || 32); px += 4) {
                if ((Math.floor(px / 4) + Math.floor(py / 4)) % 2 === 0) {
                    thumbCtx.fillStyle = '#e0e0e0';
                } else {
                    thumbCtx.fillStyle = '#f5f5f5';
                }
                thumbCtx.fillRect(px, py, 4, 4);
            }
        }
        // 绘制图层像素
        for (let py = 0; py < (state.canvasHeight || 32); py++) {
            for (let px = 0; px < (state.canvasWidth || 32); px++) {
                if (layer.data[py] && layer.data[py][px]) {
                    thumbCtx.fillStyle = layer.data[py][px];
                    thumbCtx.fillRect(px, py, 1, 1);
                }
            }
        }
        item.appendChild(thumbCanvas);

        // 图层名称（可双击改名）
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = layer.name;
        nameSpan.title = '双击改名';
        nameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            const newName = prompt('图层名称:', layer.name);
            if (newName && newName.trim()) {
                layer.name = newName.trim();
                renderLayerList();
            }
        });
        item.appendChild(nameSpan);

        item.addEventListener('click', () => setActiveLayer(index));
        container.appendChild(item);
    });
}

/**
 * 设置活跃图层
 */
function setActiveLayer(index) {
    if (index < 0 || index >= state.layers.length) return;
    state.activeLayerIndex = index;
    renderLayerList();
}

/**
 * 切换图层可见性
 */
function toggleLayerVisibility(index) {
    state.layers[index].visible = !state.layers[index].visible;
    renderCanvas();
    renderLayerList();
}

/**
 * 新建图层
 */
function addLayer() {
    saveState();
    const newLayer = {
        id: state.nextLayerId++,
        name: `图层 ${state.layers.length + 1}`,
        visible: true,
        data: Array(state.canvasHeight).fill(null).map(() => Array(state.canvasWidth).fill(null))
    };
    state.layers.splice(state.activeLayerIndex + 1, 0, newLayer);
    state.activeLayerIndex++;
    renderCanvas();
    renderLayerList();
}

/**
 * 删除图层
 */
function deleteLayer() {
    if (state.layers.length <= 1) {
        showNotification('至少保留一个图层');
        return;
    }
    if (!confirm('操作后无法撤销，确认删除该图层吗？')) return;
    saveState();
    state.layers.splice(state.activeLayerIndex, 1);
    if (state.activeLayerIndex >= state.layers.length) {
        state.activeLayerIndex = state.layers.length - 1;
    }
    renderCanvas();
    renderLayerList();
}

/**
 * 复制图层
 */
function duplicateLayer() {
    saveState();
    const source = state.layers[state.activeLayerIndex];
    const newLayer = {
        id: state.nextLayerId++,
        name: source.name + ' 副本',
        visible: true,
        data: JSON.parse(JSON.stringify(source.data))
    };
    state.layers.splice(state.activeLayerIndex + 1, 0, newLayer);
    state.activeLayerIndex++;
    renderCanvas();
    renderLayerList();
}

/**
 * 向下合并
 */
function mergeDown() {
    if (state.activeLayerIndex <= 0) {
        showNotification('无法合并：已是最底层');
        return;
    }
    if (!confirm('操作后无法撤销，确认合并图层吗？')) return;
    saveState();
    const upperLayer = state.layers[state.activeLayerIndex];
    const lowerLayer = state.layers[state.activeLayerIndex - 1];

    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < state.canvasWidth; x++) {
            if (upperLayer.data[y][x] !== null) {
                lowerLayer.data[y][x] = upperLayer.data[y][x];
            }
        }
    }

    state.layers.splice(state.activeLayerIndex, 1);
    state.activeLayerIndex--;
    renderCanvas();
    renderLayerList();
}

/**
 * 上移图层
 */
function moveLayerUp() {
    if (state.activeLayerIndex >= state.layers.length - 1) return;
    saveState();
    const temp = state.layers[state.activeLayerIndex];
    state.layers[state.activeLayerIndex] = state.layers[state.activeLayerIndex + 1];
    state.layers[state.activeLayerIndex + 1] = temp;
    state.activeLayerIndex++;
    renderCanvas();
    renderLayerList();
}

/**
 * 下移图层
 */
function moveLayerDown() {
    if (state.activeLayerIndex <= 0) return;
    saveState();
    const temp = state.layers[state.activeLayerIndex];
    state.layers[state.activeLayerIndex] = state.layers[state.activeLayerIndex - 1];
    state.layers[state.activeLayerIndex - 1] = temp;
    state.activeLayerIndex--;
    renderCanvas();
    renderLayerList();
}

// 页面加载时添加事件监听
document.addEventListener('DOMContentLoaded', () => {
    // 添加返回按钮事件
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleBackToConverter();
        });
    }
    
    // 添加页面关闭前的事件监听
    window.addEventListener('beforeunload', (e) => {
        if (hasCanvasContent()) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });
});