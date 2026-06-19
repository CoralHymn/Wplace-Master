/**
 * 像素绘画工具 - 主程序
 */

// ==================== 数据模型工具函数 ====================
// 32位像素格式: (a << 24) | (b << 16) | (g << 8) | r

function _packRGB(r, g, b) {
    return (255 << 24) | (b << 16) | (g << 8) | r;
}

function _packRGBA(r, g, b, a) {
    return (a << 24) | (b << 16) | (g << 8) | r;
}

function _unpack(pixel) {
    return [pixel & 0xFF, (pixel >> 8) & 0xFF, (pixel >> 16) & 0xFF, (pixel >> 24) & 0xFF];
}

function _getPixel(data, w, x, y) {
    return data[y * w + x];
}

function _setPixel(data, w, x, y, val) {
    // 稀疏撤销记录：记录被覆盖前的旧值
    if (state._undoRecording) {
        const oldVal = data[y * w + x];
        if (oldVal !== val) {
            state._undoRecording.push([state.activeLayerIndex, x, y, oldVal]);
        }
    }
    data[y * w + x] = val;
    if (!state._hasContent && (val & 0xFF000000) !== 0) state._hasContent = true;
}

function _isOpaque(pixel) {
    return (pixel & 0xFF000000) !== 0;
}

function _isTransparent(pixel) {
    return (pixel & 0xFF000000) === 0;
}

let _colorLUT = null;

function _colorStringToUint32(str) {
    const len = str.length;
    let i = 4;
    let r = 0, g = 0, b = 0;
    while (str[i] !== ',') { r = r * 10 + (str.charCodeAt(i) - 48); i++; }
    i += 2;
    while (str[i] !== ',') { g = g * 10 + (str.charCodeAt(i) - 48); i++; }
    i += 2;
    while (str[i] !== ')') { b = b * 10 + (str.charCodeAt(i) - 48); i++; }
    return (255 << 24) | (b << 16) | (g << 8) | r;
}

function _colorToUint32(color) {
    if (!color) return 0;
    if (color === 'transparent') return 0;
    return _colorLUT ? (_colorLUT.get(color) || _colorStringToUint32(color)) : _colorStringToUint32(color);
}

function _uint32ToColorStr(pixel) {
    const r = pixel & 0xFF;
    const g = (pixel >> 8) & 0xFF;
    const b = (pixel >> 16) & 0xFF;
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

function _initColorLUT() {
    _colorLUT = new Map();
    if (typeof COLOR_INFO === 'undefined') return;
    for (const rgb of Object.keys(COLOR_INFO)) {
        _colorLUT.set(rgb, _colorStringToUint32(rgb));
    }
}

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
    _undoRecording: null,       // [{layerIndex,x,y,oldVal}] | null=不在记录
    _undoMemoryUsed: 0,         // 所有快照占用的估算内存(字节)
    _undoMemoryLimit: 268435456, // 256MB 默认，init 时按设备调整
    _hasContent: false,          // 快速检测画布是否有非透明像素
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
    isTransforming: false,
    transformStartX: 0,
    transformStartY: 0,
    transformOffsetX: 0,
    transformOffsetY: 0,
    transformPreviewData: null,
    // 形状预览（优化后不修改图层数据，仅叠加预览）
    shapePreviewEndX: null,
    shapePreviewEndY: null,
    _previewLastRect: null,  // 上一帧预览包围盒，用于增量清除
    // 用于优化性能
    needsRender: false,
    rafId: null,
    _forceRender: false,
    // 离屏 Canvas 图层缓存 - 避免未变图层重复渲染
    _layerCanvasCache: [],
    _layerCanvasDirty: [],
    _dirtyRects: []
};

// DOM元素
const canvas = document.getElementById('pixel-canvas');
const ctx = canvas.getContext('2d');
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const canvasViewport = document.getElementById('canvas-viewport');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth < 1024 || 'ontouchstart' in window;
    // 现代移动端 8GB+ RAM，浏览器 Tab 约 1GB；桌面端 16GB+，Tab 约 2-4GB
    // 撤销池取 Tab 预算的 ~25%：移动 256MB / 桌面 512MB
    // 稀疏快照 ~2KB/次，这些值只有在超大操作(floodFill 等回退全量快照)堆积时才有意义
    state._undoMemoryLimit = isMobile ? 256 * 1024 * 1024 : 512 * 1024 * 1024;
    _initColorLUT();
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
        isMask: false,
        data: new Uint32Array(width * height)
    }];
    state.activeLayerIndex = 0;
    state.nextLayerId = 2;

    canvas.width = width;
    canvas.height = height;
    previewCanvas.width = width;
    previewCanvas.height = height;

    // 预创建图层缓存——避免首次渲染时 _rebuildLayerCanvas 因缺少
    // 离屏 canvas 而降级为全量重建（4K 下遍历 8.3M 像素阻塞数百毫秒）
    state._layerCanvasCache = [];
    const initCache = document.createElement('canvas');
    initCache.width = width;
    initCache.height = height;
    state._layerCanvasCache[0] = initCache;
    state._layerCanvasDirty = [true];
    state._dirtyRects = [null];
    state._hasContent = false;

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
    const w = state.canvasWidth, h = state.canvasHeight;
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.drawImage(img, 0, 0, w, h);
    const imageData = tempCtx.getImageData(0, 0, w, h);
    const data = getActiveData();

    for (let y = 0; y < h; y++) {
        const rowBase = y * w * 4;
        for (let x = 0; x < w; x++) {
            const i = rowBase + x * 4;
            if (imageData.data[i + 3] > 128) {
                data[y * w + x] = _packRGB(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
            } else {
                data[y * w + x] = 0;
            }
        }
    }

    // 图片导入后保守设 _hasContent（遍历中已写 _packRGB > 0 则为 true）
    state._hasContent = true;
    _invalidateLayerCache(state.activeLayerIndex);
    renderCanvas();
}

/**
 * 找到最接近的颜色
 */
// 预解析的 COLOR_INFO 调色板（避免每次 regex 解析）
let _preParsedPalette = null;
function _getPreParsedPalette() {
    if (_preParsedPalette) return _preParsedPalette;
    _preParsedPalette = [];
    for (const [rgb, info] of Object.entries(COLOR_INFO)) {
        const parsed = _parseColorRGBA(rgb);
        if (parsed) {
            _preParsedPalette.push({ r: parsed[0], g: parsed[1], b: parsed[2], rgb: rgb });
        }
    }
    return _preParsedPalette;
}

function findClosestColor(r, g, b) {
    if (typeof COLOR_INFO === 'undefined') return `rgb(${r}, ${g}, ${b})`;

    let minDistSq = Infinity;
    let closestColor = null;
    const palette = _getPreParsedPalette();

    for (let i = 0; i < palette.length; i++) {
        const c = palette[i];
        const dr = r - c.r, dg = g - c.g, db = b - c.b;
        const distSq = dr * dr + dg * dg + db * db;
        if (distSq < minDistSq) {
            minDistSq = distSq;
            closestColor = c.rgb;
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
    
    // 填充桌面端容器（移动端跳过，节省 64 个 DOM 节点）
    const isMobile = window.innerWidth < 1024 || 'ontouchstart' in window;
    if (!isMobile && freeColorsContainerDesktop && paidColorsContainerDesktop) {
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
    previewCanvas.style.transform = canvas.style.transform;
    previewCanvas.style.transformOrigin = '0 0';
}

/**
 * 优化的更新函数 - 使用 requestAnimationFrame
 */
function scheduleUpdate() {
    if (state.rafId) return; // 已经有待处理的帧
    
    state.rafId = requestAnimationFrame(() => {
        updateCanvasTransform();
        updateZoomDisplay();
        // 如果绘画操作中有待渲染的帧，一并处理
        if (state.needsRender) {
            state.needsRender = false;
            state._forceRender = true;
            renderCanvas();
            state._forceRender = false;
        }
        state.rafId = null;
    });
}

/**
 * 将渲染调度到下一帧 - 用于绘画操作批处理
 */
function scheduleRender() {
    state.needsRender = true;
    scheduleUpdate();
}

// 反向 RGB 字符串构建缓存（r,g,b 数字 -> 'rgb(r, g, b)' 字符串）
// 用于图片导入时避免大量字符串拼接开销
const _rgbBuildCache = new Map();
function _buildRGBString(r, g, b) {
    const key = (r * 65536) + (g * 256) + b;
    let cached = _rgbBuildCache.get(key);
    if (!cached) {
        cached = `rgb(${r}, ${g}, ${b})`;
        _rgbBuildCache.set(key, cached);
    }
    return cached;
}

// 颜色解析缓存，用于 ImageData 渲染加速（格式: 'rgb(r,g,b)' -> [r,g,b,a]）
const _colorParseCache = new Map();

/**
 * 快速解析颜色字符串为 RGBA 数组
 * @param {string} colorStr - 格式如 'rgb(255, 0, 0)'
 * @returns {[number,number,number,number]} [r, g, b, 255]
 */
function _parseColorRGBA(colorStr) {
    let cached = _colorParseCache.get(colorStr);
    if (cached) return cached;
    // 格式固定: 'rgb(rrr, ggg, bbb)'
    const len = colorStr.length;
    let i = 4; // 跳过 'rgb('
    let r = 0, g = 0, b = 0;
    // 解析 R
    while (colorStr[i] !== ',') { r = r * 10 + (colorStr.charCodeAt(i) - 48); i++; }
    i += 2; // 跳过 ', '
    // 解析 G
    while (colorStr[i] !== ',') { g = g * 10 + (colorStr.charCodeAt(i) - 48); i++; }
    i += 2; // 跳过 ', '
    // 解析 B
    while (colorStr[i] !== ')') { b = b * 10 + (colorStr.charCodeAt(i) - 48); i++; }
    cached = [r, g, b, 255];
    _colorParseCache.set(colorStr, cached);
    return cached;
}

/**
 * 标记图层缓存为脏（需重建）
 */
function _invalidateLayerCache(layerIndex) {
    if (typeof layerIndex !== 'undefined') {
        state._layerCanvasDirty[layerIndex] = true;
        state._dirtyRects[layerIndex] = null;
    } else {
        // 未指定则全部失效
        for (let i = 0; i < state.layers.length; i++) {
            state._layerCanvasDirty[i] = true;
            state._dirtyRects[i] = null;
        }
    }
}

/**
 * 合并脏矩形列表为一个包围盒
 */
function _mergeRects(rects) {
    if (!rects || rects.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rects) {
        if (r[0] < minX) minX = r[0];
        if (r[1] < minY) minY = r[1];
        if (r[2] > maxX) maxX = r[2];
        if (r[3] > maxY) maxY = r[3];
    }
    return [minX, minY, maxX, maxY];
}

/**
 * 标记脏矩形区域，自动合并重叠矩形（边界裁剪到画布范围）
 * 若裁剪后无有效区域，回退为全量重建
 */
function _markDirtyRect(layerIndex, x1, y1, x2, y2) {
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    x1 = Math.max(0, Math.min(w - 1, x1));
    y1 = Math.max(0, Math.min(h - 1, y1));
    x2 = Math.max(0, Math.min(w - 1, x2));
    y2 = Math.max(0, Math.min(h - 1, y2));
    if (x1 > x2 || y1 > y2) {
        // 裁剪后无有效区域，回退全量
        state._dirtyRects[layerIndex] = null;
        return;
    }

    let rects = state._dirtyRects[layerIndex];
    if (rects === null || rects === undefined) {
        // 全脏标记或新图层：用具体脏矩形替代，避免降级为全量重建
        state._dirtyRects[layerIndex] = [[x1, y1, x2, y2]];
        return;
    }
    if (rects.length === 0) {
        state._dirtyRects[layerIndex] = [[x1, y1, x2, y2]];
        return;
    }
    // 与现有矩形之一重叠或相邻则合并，否则追加
    let merged = false;
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (x1 <= r[2] + 1 && x2 >= r[0] - 1 && y1 <= r[3] + 1 && y2 >= r[1] - 1) {
            r[0] = Math.min(r[0], x1);
            r[1] = Math.min(r[1], y1);
            r[2] = Math.max(r[2], x2);
            r[3] = Math.max(r[3], y2);
            merged = true;
            break;
        }
    }
    if (!merged) {
        rects.push([x1, y1, x2, y2]);
    }
}

/**
 * 在独立预览 Canvas 上绘制形状预览（不影响主画布图层合成）
 */
function _drawShapePreview() {
    if (!state.isDrawing || state.shapePreviewEndX === null || state.shapePreviewEndY === null) return;
    if (state.currentTool !== 'line' && state.currentTool !== 'rect' && state.currentTool !== 'circle') return;
    const w = state.canvasWidth, h = state.canvasHeight;
    if (w === 0 || h === 0) return;
    const sx = state.startShapeX, sy = state.startShapeY;
    const ex = state.shapePreviewEndX, ey = state.shapePreviewEndY;

    // 透明色预览用灰色示意（而非跳过，否则拖拽时看不到形状轮廓）
    const isTransparent = !state.currentColor || state.currentColor === 'transparent';
    const rgba = isTransparent ? [128, 128, 128] : _parseColorRGBA(state.currentColor);
    if (!rgba) return;

    // 仅清除上一帧预览的包围盒区域（而非全量 4K clearRect）
    if (state._previewLastRect) {
        const [lx1, ly1, lx2, ly2] = state._previewLastRect;
        const lw = lx2 - lx1 + 1, lh = ly2 - ly1 + 1;
        if (lw > 0 && lh > 0) previewCtx.clearRect(lx1, ly1, lw, lh);
    } else {
        // 首帧：清除整个画布（仅一次）
        previewCtx.clearRect(0, 0, w, h);
    }

    previewCtx.fillStyle = isTransparent
        ? 'rgba(128,128,128,0.5)'
        : `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0.6)`;
    if (state.currentTool === 'line') {
        let x0 = sx, y0 = sy, x1 = ex, y1 = ey;
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const stepX = x0 < x1 ? 1 : -1, stepY = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) previewCtx.fillRect(x0, y0, 1, 1);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += stepX; }
            if (e2 < dx) { err += dx; y0 += stepY; }
        }
    } else if (state.currentTool === 'rect') {
        const minX = Math.max(0, Math.min(sx, ex)), maxX = Math.min(w - 1, Math.max(sx, ex));
        const minY = Math.max(0, Math.min(sy, ey)), maxY = Math.min(h - 1, Math.max(sy, ey));
        for (let x = minX; x <= maxX; x++) {
            if (minY >= 0 && minY < h) previewCtx.fillRect(x, minY, 1, 1);
            if (maxY >= 0 && maxY < h) previewCtx.fillRect(x, maxY, 1, 1);
        }
        for (let y = minY + 1; y < maxY; y++) {
            if (minX >= 0 && minX < w) previewCtx.fillRect(minX, y, 1, 1);
            if (maxX >= 0 && maxX < w) previewCtx.fillRect(maxX, y, 1, 1);
        }
    } else if (state.currentTool === 'circle') {
        const radius = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
        const cx = sx, cy = sy;
        let rx = radius, ry = 0, p = 1 - radius;
        const drawCirclePixels = (px, py) => {
            const pts = [[px, py], [-px, py], [px, -py], [-px, -py], [py, px], [-py, px], [py, -px], [-py, -px]];
            for (const [dx, dy] of pts) {
                const nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) previewCtx.fillRect(nx, ny, 1, 1);
            }
        };
        while (rx >= ry) { drawCirclePixels(rx, ry); ry++; if (p <= 0) p = p + 2 * ry + 1; else { rx--; p = p + 2 * ry - 2 * rx + 1; } }
    }
    // 保存当前帧预览包围盒（含 1px 外扩容错），供下一帧增量清除
    if (state.currentTool === 'circle') {
        const r = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
        state._previewLastRect = [sx - r - 1, sy - r - 1, sx + r + 1, sy + r + 1];
    } else {
        state._previewLastRect = [Math.min(sx, ex) - 1, Math.min(sy, ey) - 1, Math.max(sx, ex) + 1, Math.max(sy, ey) + 1];
    }
}

function _clearShapePreview() {
    if (state._previewLastRect) {
        const [lx1, ly1, lx2, ly2] = state._previewLastRect;
        const lw = lx2 - lx1 + 1, lh = ly2 - ly1 + 1;
        if (lw > 0 && lh > 0) previewCtx.clearRect(lx1, ly1, lw, lh);
        state._previewLastRect = null;
    } else if (state.canvasWidth > 0 && state.canvasHeight > 0) {
        previewCtx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
    }
}

/**
 * 直接在离屏缓存 Canvas 上绘制形状（绕过 _rebuildLayerCanvas 的 O(W×H) 遍历）。
 * 仅在 drawRect/drawCircle/drawLine 已将形状写入 Uint32Array 后调用。
 */
function _drawShapeToCache(layerIndex, sx, sy, ex, ey) {
    const oc = state._layerCanvasCache[layerIndex];
    if (!oc) return;
    const octx = oc.getContext('2d');
    const isTransparent = !state.currentColor || state.currentColor === 'transparent';
    const uint32Color = _colorToUint32(state.currentColor) >>> 0;
    const r = uint32Color & 0xFF, g = (uint32Color >> 8) & 0xFF, b = (uint32Color >> 16) & 0xFF;
    octx.fillStyle = `rgb(${r},${g},${b})`;
    const w = state.canvasWidth, h = state.canvasHeight;
    // 透明色用 clearRect 擦除而非 fillRect 画黑色
    const drawDot = isTransparent
        ? (x, y) => { octx.clearRect(x, y, 1, 1); }
        : (x, y) => { octx.fillRect(x, y, 1, 1); };

    if (state.currentTool === 'line') {
        let x0 = sx, y0 = sy, x1 = ex, y1 = ey;
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const stepX = x0 < x1 ? 1 : -1, stepY = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) drawDot(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += stepX; }
            if (e2 < dx) { err += dx; y0 += stepY; }
        }
    } else if (state.currentTool === 'rect') {
        const minX = Math.max(0, Math.min(sx, ex)), maxX = Math.min(w - 1, Math.max(sx, ex));
        const minY = Math.max(0, Math.min(sy, ey)), maxY = Math.min(h - 1, Math.max(sy, ey));
        for (let x = minX; x <= maxX; x++) {
            drawDot(x, minY); drawDot(x, maxY);
        }
        for (let y = minY + 1; y < maxY; y++) {
            drawDot(minX, y); drawDot(maxX, y);
        }
    } else if (state.currentTool === 'circle') {
        const radius = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
        const cx = sx, cy = sy;
        let rx = radius, ry = 0, p = 1 - radius;
        const drawPx = (px, py) => {
            const pts = [[px, py], [-px, py], [px, -py], [-px, -py], [py, px], [-py, px], [py, -px], [-py, -px]];
            for (const [dx, dy] of pts) {
                const nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) drawDot(nx, ny);
            }
        };
        while (rx >= ry) { drawPx(rx, ry); ry++; if (p <= 0) p = p + 2 * ry + 1; else { rx--; p = p + 2 * ry - 2 * rx + 1; } }
    }
}

/**
 * 重建指定图层的离屏 Canvas 缓存
 */
function _rebuildLayerCanvas(layerIndex) {
    const layer = state.layers[layerIndex];
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    if (w === 0 || h === 0) return;

    let oc = state._layerCanvasCache[layerIndex];
    if (!oc) {
        oc = document.createElement('canvas');
        state._layerCanvasCache[layerIndex] = oc;
    }

    const rects = state._dirtyRects[layerIndex];
    const needsFull = (!rects || rects.length === 0);

    if (needsFull) {
        // 全量重建
        oc.width = w;
        oc.height = h;
        const octx = oc.getContext('2d');

        const imageData = octx.createImageData(w, h);
        const data = imageData.data;
        const stride = w * 4;
        const layerData = layer.data;

        if (layer.isMask) {
            for (let y = 0; y < h; y++) {
                const rowBase = y * stride;
                for (let x = 0; x < w; x++) {
                    if (_isOpaque(layerData[y * w + x])) {
                        const idx = rowBase + x * 4;
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                        data[idx + 3] = 255;
                    }
                }
            }
        } else {
            for (let y = 0; y < h; y++) {
                const rowBase = y * stride;
                for (let x = 0; x < w; x++) {
                    const pixel = layerData[y * w + x];
                    if (_isOpaque(pixel)) {
                        const idx = rowBase + x * 4;
                        data[idx] = pixel & 0xFF;
                        data[idx + 1] = (pixel >> 8) & 0xFF;
                        data[idx + 2] = (pixel >> 16) & 0xFF;
                        data[idx + 3] = 255;
                    }
                }
            }
        }

        octx.putImageData(imageData, 0, 0);
    } else {
        // 增量重建：只更新脏矩形区域（canvas 尺寸已正确，不清空已有像素）
        const merged = _mergeRects(rects);
        if (!merged) {
            state._dirtyRects[layerIndex] = [];
            state._layerCanvasDirty[layerIndex] = false;
            return;
        }

        const [rx1, ry1, rx2, ry2] = merged;
        const rw = rx2 - rx1 + 1;
        const rh = ry2 - ry1 + 1;
        if (rw <= 0 || rh <= 0) {
            state._dirtyRects[layerIndex] = [];
            state._layerCanvasDirty[layerIndex] = false;
            return;
        }

        const octx = oc.getContext('2d');
        // 获取脏区域的现有像素数据（保持脏区域外不变）
        const imageData = octx.getImageData(rx1, ry1, rw, rh);
        const data = imageData.data;
        const stride = rw * 4;
        const layerData = layer.data;

        if (layer.isMask) {
            for (let y = 0; y < rh; y++) {
                const rowBase = y * stride;
                const ly = ry1 + y;
                for (let x = 0; x < rw; x++) {
                    const lx = rx1 + x;
                    const idx = rowBase + x * 4;
                    if (_isOpaque(layerData[ly * w + lx])) {
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                        data[idx + 3] = 255;
                    } else {
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                        data[idx + 3] = 0;
                    }
                }
            }
        } else {
            for (let y = 0; y < rh; y++) {
                const rowBase = y * stride;
                const ly = ry1 + y;
                for (let x = 0; x < rw; x++) {
                    const lx = rx1 + x;
                    const pixel = layerData[ly * w + lx];
                    const idx = rowBase + x * 4;
                    if (_isOpaque(pixel)) {
                        data[idx] = pixel & 0xFF;
                        data[idx + 1] = (pixel >> 8) & 0xFF;
                        data[idx + 2] = (pixel >> 16) & 0xFF;
                        data[idx + 3] = 255;
                    } else {
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                        data[idx + 3] = 0;
                    }
                }
            }
        }

        octx.putImageData(imageData, rx1, ry1);
    }

    state._dirtyRects[layerIndex] = [];
    state._layerCanvasDirty[layerIndex] = false;
}

/**
 * 渲染画布
 * 使用离屏 Canvas 缓存 + drawImage 合成，蒙版用 globalCompositeOperation 实现
 */
function renderCanvas() {
    // 绘画或位移拖动中→自动批处理到下一帧，避免每次鼠标移动都渲染
    if ((state.isDrawing || state.isTransforming) && !state._forceRender) {
        scheduleRender();
        return;
    }

    const w = state.canvasWidth;
    const h = state.canvasHeight;
    if (w === 0 || h === 0) return;

    const layers = state.layers;

    // 1. 重建脏图层的离屏 Canvas
    for (let i = 0; i < layers.length; i++) {
        if (state._layerCanvasDirty[i]) {
            _rebuildLayerCanvas(i);
        }
    }

    // 2. 清空画布并合成各图层
    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer.visible) continue;

        // 蒙版层本身不可见，仅用于裁剪上层
        if (layer.isMask) continue;

        const maskLayer = (i > 0 && layers[i - 1].isMask && layers[i - 1].visible)
            ? layers[i - 1] : null;

        if (maskLayer) {
            // 有蒙版：先绘制图层，再用蒙版裁剪
            ctx.save();
            ctx.drawImage(state._layerCanvasCache[i], 0, 0);
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(state._layerCanvasCache[i - 1], 0, 0);
            ctx.restore();
        } else {
            // 无蒙版：直接绘制
            ctx.drawImage(state._layerCanvasCache[i], 0, 0);
        }
    }

    // 3. 位移预览（叠加在合成结果之上）
    if (state.isTransforming && state.transformPreviewData) {
        ctx.globalAlpha = 0.5;
        for (const pixel of state.transformPreviewData) {
            ctx.fillStyle = pixel.color;
            ctx.fillRect(pixel.x, pixel.y, 1, 1);
        }
        ctx.globalAlpha = 1.0;
    }

    // 3.5. 形状预览 — 绘制到独立预览 canvas（不影响图层合成，不清主画布）
    _drawShapePreview();

    // 4. 网格
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
                if (state.currentTool === 'eraser' || state.currentColor === 'transparent') {
                    _setPixel(activeData, state.canvasWidth, px, py, 0);
                } else if (state.currentColor) {
                    _setPixel(activeData, state.canvasWidth, px, py, _colorToUint32(state.currentColor) >>> 0);
                }
            }
        }
    }
    _markDirtyRect(state.activeLayerIndex, x - radius, y - radius, x + radius, y + radius);
    state._layerCanvasDirty[state.activeLayerIndex] = true;
}

/**
 * 获取画布坐标
 */
// getBoundingClientRect 缓存 — 同帧内复用避免布局重排（移动端触摸每帧 60 次）
let _cachedCanvasRect = null;
let _cachedCanvasRectTime = 0;

function getCanvasCoords(e) {
    const now = performance.now();
    if (!_cachedCanvasRect || now - _cachedCanvasRectTime > 16) {  // 16ms ≈ 1 帧
        _cachedCanvasRect = canvas.getBoundingClientRect();
        _cachedCanvasRectTime = now;
    }
    const rect = _cachedCanvasRect;
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

    const origX0 = x0, origY0 = y0, origX1 = x1, origY1 = y1;
    const uint32Color = _colorToUint32(color) >>> 0;
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
                    _setPixel(activeData, state.canvasWidth, px, py, uint32Color);
                }
            }
        }
        
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
    const dlRadius = Math.floor(state.brushSize / 2);
    _markDirtyRect(state.activeLayerIndex, Math.min(origX0, origX1) - dlRadius, Math.min(origY0, origY1) - dlRadius, Math.max(origX0, origX1) + dlRadius, Math.max(origY0, origY1) + dlRadius);
    state._layerCanvasDirty[state.activeLayerIndex] = true;
}

/**
 * 绘制矩形
 */
function drawRect(x0, y0, x1, y1, color) {
    const activeData = getActiveData();
    if (!activeData) return;

    const uint32Color = _colorToUint32(color) >>> 0;

    const minX = Math.max(0, Math.min(x0, x1));
    const maxX = Math.min(state.canvasWidth - 1, Math.max(x0, x1));
    const minY = Math.max(0, Math.min(y0, y1));
    const maxY = Math.min(state.canvasHeight - 1, Math.max(y0, y1));

    for (let x = minX; x <= maxX; x++) {
        _setPixel(activeData, state.canvasWidth, x, minY, uint32Color);
        _setPixel(activeData, state.canvasWidth, x, maxY, uint32Color);
    }

    for (let y = minY; y <= maxY; y++) {
        _setPixel(activeData, state.canvasWidth, minX, y, uint32Color);
        _setPixel(activeData, state.canvasWidth, maxX, y, uint32Color);
    }
    _markDirtyRect(state.activeLayerIndex, minX, minY, maxX, maxY);
    state._layerCanvasDirty[state.activeLayerIndex] = true;
}

/**
 * 绘制圆形
 */
function drawCircle(cx, cy, radius, color) {
    const activeData = getActiveData();
    if (!activeData) return;

    const uint32Color = _colorToUint32(color) >>> 0;

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
                _setPixel(activeData, state.canvasWidth, px, py, uint32Color);
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
    _markDirtyRect(state.activeLayerIndex, cx - radius, cy - radius, cx + radius, cy + radius);
    state._layerCanvasDirty[state.activeLayerIndex] = true;
}

/**
 * 填充算法
 */
function floodFill(startX, startY, fillColor) {
    if (startX < 0 || startX >= state.canvasWidth || startY < 0 || startY >= state.canvasHeight) return;

    const activeData = getActiveData();
    if (!activeData) return;

    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const targetColor = _getPixel(activeData, w, startX, startY);
    const fillUint32 = (fillColor === 'transparent' || fillColor === null) ? 0 : (_colorToUint32(fillColor) >>> 0);
    if (targetColor === fillUint32) return;

    const visited = new Uint8Array(w * h);
    const stack = [[startX, startY]];

    while (stack.length > 0) {
        const [x, y] = stack.pop();

        // 水平扩展找到当前行的填充区间 [leftX, rightX]
        let leftX = x;
        while (leftX > 0 && _getPixel(activeData, w, leftX - 1, y) === targetColor) {
            leftX--;
        }
        let rightX = x;
        while (rightX < w - 1 && _getPixel(activeData, w, rightX + 1, y) === targetColor) {
            rightX++;
        }

        // 填充当前行区间
        for (let fx = leftX; fx <= rightX; fx++) {
            const idx = y * w + fx;
            if (!visited[idx]) {
                _setPixel(activeData, w, fx, y, fillUint32);
                visited[idx] = 1;
            }
        }

        // 在上下行查找新种子（扫描线算法，每块连续区域只推一个种子）
        for (const ny of [y - 1, y + 1]) {
            if (ny < 0 || ny >= h) continue;
            let inSpan = false;
            const startNx = Math.max(0, leftX - 1);
            const endNx = Math.min(w - 1, rightX + 1);
            for (let nx = startNx; nx <= endNx; nx++) {
                const idx = ny * w + nx;
                if (!visited[idx] && _getPixel(activeData, w, nx, ny) === targetColor) {
                    if (!inSpan) {
                        stack.push([nx, ny]);
                        inSpan = true;
                    }
                } else {
                    inSpan = false;
                }
            }
        }
    }
    _invalidateLayerCache(state.activeLayerIndex);
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
    const fillUint32 = (fillColor === 'transparent' || fillColor === null) ? 0 : (_colorToUint32(fillColor) >>> 0);
    let fillCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const currentColor = _getPixel(activeData, width, x, y);

            // 如果当前像素颜色与目标颜色相同，则填充
            if (currentColor === targetColor && currentColor !== fillUint32) {
                _setPixel(activeData, width, x, y, fillUint32);
                fillCount++;
            }
        }
    }
    
    _invalidateLayerCache(state.activeLayerIndex);
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
/**
 * 根据画布尺寸计算最大撤销深度
 * 大画布每个快照占用大量内存，需动态限制
 */
function _getMaxUndoDepth() {
    const totalPixels = state.canvasWidth * state.canvasHeight;
    // 稀疏快照后单次操作仅记录变化像素(~KB级)，数量限制大幅放宽
    // 内存池 _undoMemoryLimit 会兜底实际内存占用
    if (totalPixels <= 10000) return 200;        // ≤100×100
    if (totalPixels <= 100000) return 100;        // ≤316×316
    if (totalPixels <= 1000000) return 60;        // ≤1000×1000
    if (totalPixels <= 4000000) return 40;        // ≤2000×2000
    if (totalPixels <= 8300000) return 30;        // ≤4K (3840×2160)
    return 20;                                    // 超大画布
}

// ==================== 稀疏差分撤销 ====================

function _commitUndoRecord() {
    const rec = state._undoRecording;
    state._undoRecording = null;
    if (!rec || rec.length === 0) return;

    // 超大操作回退全量快照（>500K 变化像素时稀疏比全量还大）
    if (rec.length > 500000) {
        state.undoStack.push(state.layers.map(l => ({
            data: new Uint32Array(l.data),
            isMask: l.isMask
        })));
        _trimUndoStack();
        return;
    }

    // 稀疏快照: 补充 newVal，存储为 [layerIdx,x,y,oldVal,newVal] 元组数组
    const w = state.canvasWidth;
    const changes = [];
    for (let i = 0; i < rec.length; i++) {
        const entry = rec[i];
        const layer = state.layers[entry[0]];
        if (!layer) continue;
        const newVal = layer.data[entry[2] * w + entry[1]];  // y*w+x
        changes.push([entry[0], entry[1], entry[2], entry[3], newVal]);
    }
    state.undoStack.push({ sparse: true, changes });
    _trimUndoStack();
}

function _trimUndoStack() {
    // 双重限制：内存池 + 数量
    while (state.undoStack.length > 1 && state._undoMemoryUsed > state._undoMemoryLimit) {
        const removed = state.undoStack.shift();
        state._undoMemoryUsed -= removed.sparse
            ? removed.changes.length * 20   // 20 bytes/entry 平均
            : state.canvasWidth * state.canvasHeight * 4;
    }
    const maxDepth = _getMaxUndoDepth();
    while (state.undoStack.length > maxDepth) {
        state.undoStack.shift();
    }
}

function saveState() {
    _commitUndoRecord();                  // 提交上一轮记录
    state._undoRecording = [];            // 开启新一轮稀疏记录
    state.redoStack = [];
}

/**
 * 撤销
 */
function undo() {
    _commitUndoRecord();                  // flush 当前记录
    if (state.undoStack.length === 0) return;
    const snapshot = state.undoStack.pop();

    if (snapshot.sparse) {
        // 稀疏快照：写入 oldVal 还原
        const changes = snapshot.changes;
        const redoChanges = [];
        const w = state.canvasWidth;
        for (let i = 0; i < changes.length; i++) {
            const c = changes[i];
            const layer = state.layers[c[0]];
            if (!layer) continue;
            const cur = layer.data[c[2] * w + c[1]];
            layer.data[c[2] * w + c[1]] = c[3];   // 写回 oldVal
            redoChanges.push([c[0], c[1], c[2], c[3], cur]);  // [layerIdx,x,y,oldVal,newCur]
        }
        state.redoStack.push({ sparse: true, changes: redoChanges });
    } else {
        // 全量快照：走原路径
        const redoSnap = state.layers.map(l => ({
            data: new Uint32Array(l.data),
            isMask: l.isMask
        }));
        state.redoStack.push(redoSnap);
        snapshot.forEach((s, i) => {
            if (state.layers[i]) {
                state.layers[i].data = s.data instanceof Uint32Array ? new Uint32Array(s.data) : new Uint32Array(Object.values(s.data));
                state.layers[i].isMask = s.isMask;
            }
        });
    }
    _invalidateLayerCache();
    renderCanvas();
    renderLayerList();
}

/**
 * 重做
 */
function redo() {
    _commitUndoRecord();                  // flush 当前记录
    if (state.redoStack.length === 0) return;
    const snapshot = state.redoStack.pop();

    if (snapshot.sparse) {
        const changes = snapshot.changes;
        const undoChanges = [];
        const w = state.canvasWidth;
        for (let i = 0; i < changes.length; i++) {
            const c = changes[i];
            const layer = state.layers[c[0]];
            if (!layer) continue;
            const cur = layer.data[c[2] * w + c[1]];
            layer.data[c[2] * w + c[1]] = c[4];   // 写回 newVal (索引4=redo时的newVal)
            undoChanges.push([c[0], c[1], c[2], cur, c[4]]);
        }
        state.undoStack.push({ sparse: true, changes: undoChanges });
    } else {
        const undoSnap = state.layers.map(l => ({
            data: new Uint32Array(l.data),
            isMask: l.isMask
        }));
        state.undoStack.push(undoSnap);
        snapshot.forEach((s, i) => {
            if (state.layers[i]) {
                state.layers[i].data = s.data instanceof Uint32Array ? new Uint32Array(s.data) : new Uint32Array(Object.values(s.data));
                state.layers[i].isMask = s.isMask;
            }
        });
    }
    _invalidateLayerCache();
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
            activeData.fill(0);
            state._hasContent = false;
        }
        _invalidateLayerCache(state.activeLayerIndex);
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
    const w = state.canvasWidth;
    const colorUint32 = _colorToUint32(state.currentColor) >>> 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const isOpaque = _isOpaque(_getPixel(activeData, w, x, y));

            if (outlineType === 'inner' || outlineType === 'both') {
                // 内边线：在不透明像素上，如果周围有透明像素，则绘制边线
                if (isOpaque && hasTransparentNeighbor(x, y)) {
                    _setPixel(newData, w, x, y, colorUint32);
                }
            }

            if (outlineType === 'outer' || outlineType === 'both') {
                // 外边线：在透明像素上，如果周围有不透明像素，则绘制边线
                if (!isOpaque && hasOpaqueNeighbor(x, y)) {
                    _setPixel(newData, w, x, y, colorUint32);
                }
            }
        }
    }
    
    state.layers[state.activeLayerIndex].data = newData;
    _invalidateLayerCache(state.activeLayerIndex);
    renderCanvas();
}

/**
 * 检查像素是否有透明邻居（8方向）
 */
function hasTransparentNeighbor(x, y) {
    const activeData = getActiveData();
    if (!activeData) return false;

    const w = state.canvasWidth;
    const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;

        // 边界外的视为透明
        if (nx < 0 || nx >= w || ny < 0 || ny >= state.canvasHeight) {
            return true;
        }

        if (_isTransparent(_getPixel(activeData, w, nx, ny))) {
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

    const w = state.canvasWidth;
    const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0],           [1, 0],
        [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;

        // 边界外不算
        if (nx < 0 || nx >= w || ny < 0 || ny >= state.canvasHeight) {
            continue;
        }

        if (_isOpaque(_getPixel(activeData, w, nx, ny))) {
            return true;
        }
    }

    return false;
}

/**
 * 从图层中获取指定坐标的颜色（从顶层到底层查找）
 */
function getLayerPixelColor(x, y) {
    const w = state.canvasWidth;
    for (let i = state.layers.length - 1; i >= 0; i--) {
        if (!state.layers[i].visible) continue;
        const pixel = _getPixel(state.layers[i].data, w, x, y);
        if (_isOpaque(pixel)) {
            return _uint32ToColorStr(pixel);
        }
    }
    return null;
}

/**
 * 导出PNG
 */
function downloadPNG() {
    // 检查是否有非 WP 色板颜色
    if (typeof COLOR_INFO !== 'undefined') {
        let nonPaletteCount = 0;
        const maxCheck = 10;
        for (let i = 0; i < state.layers.length && nonPaletteCount < maxCheck; i++) {
            const layer = state.layers[i];
            if (!layer.visible) continue;
            for (let y = 0; y < state.canvasHeight && nonPaletteCount < maxCheck; y++) {
                for (let x = 0; x < state.canvasWidth && nonPaletteCount < maxCheck; x++) {
                    const pixel = layer.data[y * state.canvasWidth + x];
                    if (pixel && !COLOR_INFO[_uint32ToColorStr(pixel)]) {
                        nonPaletteCount++;
                    }
                }
            }
        }

        if (nonPaletteCount > 0) {
            showConfirmDialog(
                '模板似乎不太规范（检测到不在 WP 色板中的颜色），确定要现在导出吗？',
                () => doExportPNG()
            );
            return;
        }
    }

    doExportPNG();
}

function doExportPNG() {
    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const exportCtx = exportCanvas.getContext('2d');

    const imageData = exportCtx.createImageData(w, h);
    const out = imageData.data; // Uint8ClampedArray, 4 bytes per pixel

    // 从底层到顶层合成图层
    for (let i = 0; i < state.layers.length; i++) {
        const layer = state.layers[i];
        if (!layer.visible) continue;

        const maskLayer = (i > 0 && state.layers[i - 1].isMask) ? state.layers[i - 1] : null;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const pixel = layer.data[y * w + x];
                if (pixel && (!maskLayer || maskLayer.data[y * w + x])) {
                    const idx = (y * w + x) * 4;
                    out[idx] = pixel & 0xFF;           // R
                    out[idx + 1] = (pixel >> 8) & 0xFF; // G
                    out[idx + 2] = (pixel >> 16) & 0xFF;// B
                    out[idx + 3] = 255;                  // A
                }
            }
        }
    }

    exportCtx.putImageData(imageData, 0, 0);

    const link = document.createElement('a');
    link.download = `pixel-art-${w}x${h}.png`;
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
        if (state.layers[i]) {
            state.layers[i].data = s.data instanceof Uint32Array ? new Uint32Array(s.data) : new Uint32Array(Object.values(s.data));
            if (s.isMask !== undefined) state.layers[i].isMask = s.isMask;
        }
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
            document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTool = btn.dataset.tool;

            // 根据工具更新光标
            if (state.currentTool === 'move') {
                canvas.style.cursor = 'grab';
            } else if (state.currentTool === 'transform') {
                canvas.style.cursor = 'move';
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
    document.getElementById('import-layer-btn').addEventListener('click', () => {
        document.getElementById('layer-import-file').click();
    });
    document.getElementById('layer-import-file').addEventListener('change', handleLayerImport);
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

    // 位移工具
    if (state.currentTool === 'transform') {
        state.isTransforming = true;
        state.transformStartX = x;
        state.transformStartY = y;
        state.transformOffsetX = 0;
        state.transformOffsetY = 0;
        saveState();
        return;
    }

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
            const w = state.canvasWidth;
            const targetPixel = _getPixel(activeData, w, x, y);
            if (_isOpaque(targetPixel)) {
                globalFill(targetPixel, state.currentColor);
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
        state.shapePreviewEndX = x;
        state.shapePreviewEndY = y;
        // 不在此处 saveState——推迟到 mouseUp，省掉 mousemove 期间的恢复开销
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

    // 位移工具：计算偏移并生成预览
    if (state.isTransforming) {
        const { x, y } = getCanvasCoords(e);
        state.transformOffsetX = x - state.transformStartX;
        state.transformOffsetY = y - state.transformStartY;
        generateTransformPreview();
        renderCanvas();
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
        state.shapePreviewEndX = x;
        state.shapePreviewEndY = y;
        _drawShapePreview();  // 仅更新独立预览 canvas，不触发主画布全量合成
    } else if (state.currentTool === 'rect' || state.currentTool === 'circle') {
        state.shapePreviewEndX = x;
        state.shapePreviewEndY = y;
        _drawShapePreview();
    }
}

function handleMouseUp(e) {
    // 清除取色器的title提示
    canvas.title = '';

    // 位移工具：应用偏移
    if (state.isTransforming) {
        applyTransform();
        state.isTransforming = false;
        state.transformPreviewData = null;
        state.transformOffsetX = 0;
        state.transformOffsetY = 0;
        renderCanvas();
        renderLayerList();
        return;
    }
    
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

    // 形状工具结束：清除预览，将形状同时写入图层数据和离屏缓存
    if (state.isDrawing && (state.currentTool === 'line' || state.currentTool === 'rect' || state.currentTool === 'circle')) {
        const sx = state.startShapeX;
        const sy = state.startShapeY;
        const ex = state.shapePreviewEndX;
        const ey = state.shapePreviewEndY;
        state.isDrawing = false;
        state.startShapeX = null;
        state.startShapeY = null;
        state.shapePreviewEndX = null;
        state.shapePreviewEndY = null;

        _clearShapePreview();
        saveState();

        // 写入 Uint32Array 图层数据
        if (state.currentTool === 'line') {
            drawLine(sx, sy, ex, ey, state.currentColor);
        } else if (state.currentTool === 'rect') {
            drawRect(sx, sy, ex, ey, state.currentColor);
        } else if (state.currentTool === 'circle') {
            const radius = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
            drawCircle(sx, sy, radius, state.currentColor);
        }

        // 直接在离屏缓存 canvas 上绘制相同形状（O(shape) 而非 O(W×H)）
        _drawShapeToCache(state.activeLayerIndex, sx, sy, ex, ey);
        state._layerCanvasDirty[state.activeLayerIndex] = false;
        state._dirtyRects[state.activeLayerIndex] = [];

        renderCanvas();  // 仅合成，不触发 _rebuildLayerCanvas
    }

    state.isDrawing = false;
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

var _canvasRectCache = null, _canvasRectCacheTime = 0;
function _getCanvasRectCached() {
    var now = performance.now();
    if (!_canvasRectCache || now - _canvasRectCacheTime > 16) {
        _canvasRectCache = canvas.getBoundingClientRect();
        _canvasRectCacheTime = now;
    }
    return _canvasRectCache;
}

function handleWheel(e) {
    e.preventDefault();
    var zoomFactor = 1.1;
    var oldZoom = state.zoom;
    state.zoom *= (e.deltaY < 0 ? zoomFactor : 1 / zoomFactor);
    state.zoom = Math.max(1, Math.min(80, state.zoom));

    var rect = _getCanvasRectCached();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    state.panOffsetX -= mx * (state.zoom / oldZoom - 1);
    state.panOffsetY -= my * (state.zoom / oldZoom - 1);
    // 立即应用 transform，使下一帧/下一次 wheel 事件的 canvasRect 反映新位置
    updateCanvasTransform();
    _canvasRectCacheTime = 0;  // 下一帧重新读 canvas 屏幕位置

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
            _invalidateLayerCache(state.activeLayerIndex);
            renderCanvas();
            return;
        }

        if (state.currentTool === 'global-fill') {
            // 全局填充：需要点击一个像素来确定要替换的颜色
            if (x >= 0 && x < state.canvasWidth && y >= 0 && y < state.canvasHeight) {
                const activeData = getActiveData();
                if (!activeData) return;
                const w = state.canvasWidth;
                const targetPixel = _getPixel(activeData, w, x, y);
                if (_isOpaque(targetPixel)) {
                    globalFill(targetPixel, state.currentColor);
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
            state.shapePreviewEndX = x;
            state.shapePreviewEndY = y;
            // 不在此处 saveState——推迟到 touchEnd
            return;
        }

        // 位移工具
        if (state.currentTool === 'transform') {
            state.isTransforming = true;
            state.transformStartX = x;
            state.transformStartY = y;
            state.transformOffsetX = 0;
            state.transformOffsetY = 0;
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
        
        var canvasRect = _getCanvasRectCached();
        var currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        var mx = currentCenterX - canvasRect.left;
        var my = currentCenterY - canvasRect.top;
        var oldZoom = state.zoom;
        state.zoom = Math.max(1, Math.min(80, Math.round(state.pinchStartZoom * scale * 10) / 10));

        // 缩放原点补偿 + 手指位移补偿
        state.panOffsetX -= mx * (state.zoom / oldZoom - 1);
        state.panOffsetY -= my * (state.zoom / oldZoom - 1);
        state.panOffsetX += currentCenterX - state.pinchStartCenterX;
        state.panOffsetY += currentCenterY - state.pinchStartCenterY;
        
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

    // 位移工具移动
    if (e.touches.length === 1 && state.isTransforming) {
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);
        state.transformOffsetX = x - state.transformStartX;
        state.transformOffsetY = y - state.transformStartY;
        generateTransformPreview();
        renderCanvas();
        return;
    }

    if (e.touches.length === 1 && state.isDrawing) {
        e.preventDefault();
        const touch = e.touches[0];
        const { x, y } = getCanvasCoords(touch);
        
        if (state.currentTool === 'line' || state.currentTool === 'rect' || state.currentTool === 'circle') {
            state.shapePreviewEndX = x;
            state.shapePreviewEndY = y;
            _drawShapePreview();  // 仅更新独立预览 canvas
        } else if (state.currentTool === 'pencil' || state.currentTool === 'eraser') {
            drawLine(state.lastX, state.lastY, x, y, state.currentTool === 'eraser' ? null : state.currentColor);
            state.lastX = x;
            state.lastY = y;
            renderCanvas();
        }
    }
}

function handleTouchEnd() {
    // 位移工具结束
    if (state.isTransforming) {
        applyTransform();
        state.isTransforming = false;
        state.transformPreviewData = null;
        state.transformOffsetX = 0;
        state.transformOffsetY = 0;
        renderCanvas();
        renderLayerList();
        return;
    }
    
    // 形状工具结束：清除预览，将形状同时写入图层数据和离屏缓存
    if (state.isDrawing && (state.currentTool === 'line' || state.currentTool === 'rect' || state.currentTool === 'circle')) {
        const sx = state.startShapeX;
        const sy = state.startShapeY;
        const ex = state.shapePreviewEndX;
        const ey = state.shapePreviewEndY;
        state.isDrawing = false;
        state.startShapeX = null;
        state.startShapeY = null;
        state.shapePreviewEndX = null;
        state.shapePreviewEndY = null;

        _clearShapePreview();
        saveState();
        if (state.currentTool === 'line') {
            drawLine(sx, sy, ex, ey, state.currentColor);
        } else if (state.currentTool === 'rect') {
            drawRect(sx, sy, ex, ey, state.currentColor);
        } else if (state.currentTool === 'circle') {
            const radius = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
            drawCircle(sx, sy, radius, state.currentColor);
        }
        _drawShapeToCache(state.activeLayerIndex, sx, sy, ex, ey);
        state._layerCanvasDirty[state.activeLayerIndex] = false;
        state._dirtyRects[state.activeLayerIndex] = [];
        renderCanvas();
    }

    state.isDrawing = false;
    state.startShapeX = null;
    state.startShapeY = null;
    state.shapePreviewEndX = null;
    state.shapePreviewEndY = null;
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
        case 't': document.querySelector('[data-tool="transform"]')?.click(); break;
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
    return state._hasContent;
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
    var viewportRect = document.getElementById('canvas-container').getBoundingClientRect();
    var canvasWidth = state.canvasWidth * state.zoom;
    var canvasHeight = state.canvasHeight * state.zoom;
    state.panOffsetX = (viewportRect.width - canvasWidth) / 2;
    state.panOffsetY = (viewportRect.height - canvasHeight) / 2;
    
    updateCanvasTransform();
}

/**
 * 创建活跃图层数据的深度快照
 */
function createLayerDataSnapshot() {
    const activeData = getActiveData();
    return activeData ? new Uint32Array(activeData) : null;
}

/**
 * 渲染图层面板列表
 */
function renderLayerList() {
    const container = document.getElementById('layers-list');
    if (!container) return;
    container.innerHTML = '';

    for (let i = state.layers.length - 1; i >= 0; i--) {
        const layer = state.layers[i];
        const index = i;
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

        // 蒙版按钮
        const maskBtn = document.createElement('button');
        maskBtn.className = 'layer-mask-btn';
        maskBtn.title = layer.isMask ? '已设为蒙版（裁剪上方图层）' : '设为蒙版（将裁剪上方图层）';
        if (layer.isMask) {
            maskBtn.classList.add('has-mask');
        }
        maskBtn.innerHTML = layer.isMask
            ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="1" y="1" width="22" height="22" rx="2"/><circle cx="12" cy="12" r="6" fill="white"/></svg>'
            : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="1" width="22" height="22" rx="2"/><circle cx="12" cy="12" r="6"/></svg>';
        maskBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLayerMask(index);
        });
        item.appendChild(maskBtn);

        // 缩略图 canvas（降采样，最大 96px）
        const MAX_THUMB = 96;
        const cw = state.canvasWidth || 32;
        const ch = state.canvasHeight || 32;
        const scale = Math.min(1, MAX_THUMB / Math.max(cw, ch));
        const thumbW = Math.max(1, Math.round(cw * scale));
        const thumbH = Math.max(1, Math.round(ch * scale));

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = thumbW;
        thumbCanvas.height = thumbH;
        thumbCanvas.className = 'layer-thumb';
        const thumbCtx = thumbCanvas.getContext('2d');

        // 棋盘格背景
        const tileSize = Math.max(2, Math.round(4 * scale));
        thumbCtx.fillStyle = '#e0e0e0';
        thumbCtx.fillRect(0, 0, thumbW, thumbH);
        for (let py = 0; py < thumbH; py += tileSize) {
            for (let px = 0; px < thumbW; px += tileSize) {
                if ((Math.floor(px / tileSize) + Math.floor(py / tileSize)) % 2 === 0) {
                    thumbCtx.fillStyle = '#f5f5f5';
                    thumbCtx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }

        // 使用离屏缓存 Canvas 做 GPU 加速降采样
        let cache = state._layerCanvasCache[index];
        if (!cache) {
            _rebuildLayerCanvas(index);
            cache = state._layerCanvasCache[index];
        }
        if (cache) {
            thumbCtx.drawImage(cache, 0, 0, thumbW, thumbH);
        }
        item.appendChild(thumbCanvas);

        // 图层名称（可双击改名）
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = layer.isMask ? layer.name + ' [蒙版]' : layer.name;
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
    }
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
        isMask: false,
        data: new Uint32Array(state.canvasWidth * state.canvasHeight)
    };
    state.layers.splice(state.activeLayerIndex + 1, 0, newLayer);
    state.activeLayerIndex++;
    _invalidateLayerCache();
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
    _invalidateLayerCache();
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
        isMask: false,
        data: new Uint32Array(source.data)
    };
    state.layers.splice(state.activeLayerIndex + 1, 0, newLayer);
    state.activeLayerIndex++;
    _invalidateLayerCache();
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

    const w = state.canvasWidth;
    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < state.canvasWidth; x++) {
            const upperPixel = _getPixel(upperLayer.data, w, x, y);
            if (_isOpaque(upperPixel)) {
                _setPixel(lowerLayer.data, w, x, y, upperPixel);
            }
        }
    }

    state.layers.splice(state.activeLayerIndex, 1);
    state.activeLayerIndex--;
    _invalidateLayerCache();
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
    // 图层位置交换后缓存索引失效，必须全部重建
    _invalidateLayerCache();
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
    // 图层位置交换后缓存索引失效，必须全部重建
    _invalidateLayerCache();
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

// ==================== 导入图片到图层 ====================

function handleLayerImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            saveState();
            importImageToLayer(img);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function importImageToLayer(img) {
    const activeData = getActiveData();
    if (!activeData) return;

    saveState();

    // 画布中央偏移
    const offsetX = Math.floor((state.canvasWidth - img.width) / 2);
    const offsetY = Math.floor((state.canvasHeight - img.height) / 2);

    // 用原大小绘制到一个离屏 canvas，精确获取像素
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);

    let importedCount = 0;
    const w = state.canvasWidth;
    for (let sy = 0; sy < img.height; sy++) {
        const rowBase = sy * img.width * 4;
        for (let sx = 0; sx < img.width; sx++) {
            const dx = offsetX + sx;
            const dy = offsetY + sy;
            if (dx < 0 || dx >= w || dy < 0 || dy >= state.canvasHeight) continue;

            const i = rowBase + sx * 4;
            if (imageData.data[i + 3] > 128) {
                activeData[dy * w + dx] = _packRGB(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
                importedCount++;
            }
        }
    }

    if (importedCount > 0) state._hasContent = true;
    _invalidateLayerCache(state.activeLayerIndex);
    renderCanvas();
    renderLayerList();
    showNotification(`已导入 ${importedCount} 个像素到「${state.layers[state.activeLayerIndex].name}」`);
}

// ==================== 蒙版功能 ====================

function toggleLayerMask(index) {
    if (index < 0 || index >= state.layers.length) return;
    const layer = state.layers[index];
    layer.isMask = !layer.isMask;
    // 必须先失效缓存再渲染，因为 isMask 状态影响缓存重建逻辑（蒙版层填充白色，普通层填充颜色）
    _invalidateLayerCache();
    renderCanvas();
    renderLayerList();
    if (layer.isMask) {
        showNotification(`「${layer.name}」已设为蒙版，将裁剪上方图层`);
    } else {
        showNotification(`「${layer.name}」蒙版已取消`);
    }
}

// ==================== 位移功能 ====================

function generateTransformPreview() {
    const activeData = getActiveData();
    if (!activeData) return;

    const offsetX = state.transformOffsetX;
    const offsetY = state.transformOffsetY;
    const w = state.canvasWidth;
    const preview = [];

    for (let y = 0; y < state.canvasHeight; y++) {
        for (let x = 0; x < w; x++) {
            const pixel = _getPixel(activeData, w, x, y);
            if (_isOpaque(pixel)) {
                const newX = x + offsetX;
                const newY = y + offsetY;
                if (newX >= 0 && newX < w && newY >= 0 && newY < state.canvasHeight) {
                    preview.push({ x: newX, y: newY, color: _uint32ToColorStr(pixel) });
                }
            }
        }
    }

    state.transformPreviewData = preview;
}

function applyTransform() {
    const activeData = getActiveData();
    if (!activeData) return;

    const offsetX = state.transformOffsetX;
    const offsetY = state.transformOffsetY;

    if (offsetX === 0 && offsetY === 0) {
        state.undoStack.pop();
        return;
    }

    const w = state.canvasWidth;
    const h = state.canvasHeight;
    const newData = new Uint32Array(w * h);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const pixel = _getPixel(activeData, w, x, y);
            if (_isOpaque(pixel)) {
                const newX = x + offsetX;
                const newY = y + offsetY;
                if (newX >= 0 && newX < w && newY >= 0 && newY < h) {
                    _setPixel(newData, w, newX, newY, pixel);
                }
            }
        }
    }

    state.layers[state.activeLayerIndex].data = newData;
    _invalidateLayerCache(state.activeLayerIndex);
    showNotification(`已移动图层内容 (${offsetX > 0 ? '+' : ''}${offsetX}, ${offsetY > 0 ? '+' : ''}${offsetY})`);
}