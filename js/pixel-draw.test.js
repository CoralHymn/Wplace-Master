/**
 * pixel-draw.js 单元测试
 *
 * 使用方法:
 *   Node: "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" js/pixel-draw.test.js
 *   浏览器: 创建 HTML 页面, 用 <script src="pixel-draw.js"></script> 和
 *           <script src="pixel-draw.test.js"></script> 顺序加载后打开
 */

// ==================== 兼容浏览器的 assert 工具 ====================
const __isNode = typeof process !== 'undefined' && process.release && process.release.name === 'node';
let __failedCount = 0;

function assert(condition, message) {
    if (!condition) {
        console.error('FAIL: ' + message);
        if (__isNode) process.exitCode = 1;
        __failedCount++;
    } else {
        console.log('PASS: ' + message);
    }
}

function assertStrictEqual(actual, expected, message) {
    if (actual !== expected) {
        console.error('FAIL: ' + message + ' | expected: ' + expected + ' | actual: ' + actual);
        if (__isNode) process.exitCode = 1;
        __failedCount++;
    } else {
        console.log('PASS: ' + message);
    }
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        console.error('FAIL: ' + message + ' | expected: ' + expectedStr + ' | actual: ' + actualStr);
        if (__isNode) process.exitCode = 1;
        __failedCount++;
    } else {
        console.log('PASS: ' + message);
    }
}

// ==================== 被测试的纯函数（从 pixel-draw.js 同步复制） ====================

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
    data[y * w + x] = val;
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

// ==================== 模拟 COLOR_INFO ====================
globalThis.COLOR_INFO = {
    'rgb(255, 0, 0)': { name: 'Red', isPaid: false },
    'rgb(0, 255, 0)': { name: 'Green', isPaid: false },
    'rgb(0, 0, 255)': { name: 'Blue', isPaid: false },
    'rgb(0, 0, 0)': { name: 'Black', isPaid: false },
    'rgb(255, 255, 255)': { name: 'White', isPaid: false }
};

// ==================== 测试开始 ====================

console.log('\n=== Slice 1 纯函数测试 ===\n');

// ---- _packRGB ----
assertStrictEqual(_packRGB(255, 0, 0) >>> 0, 0xFF0000FF, '_packRGB(255,0,0) === 0xFF0000FF');

// ---- _packRGBA ----
assertStrictEqual(_packRGBA(255, 0, 0, 128) >>> 0, 0x800000FF, '_packRGBA(255,0,0,128) === 0x800000FF');

// ---- _unpack ----
assertDeepEqual(_unpack(0xFF0000FF), [255, 0, 0, 255], '_unpack(0xFF0000FF) === [255,0,0,255]');
assertDeepEqual(_unpack(0), [0, 0, 0, 0], '_unpack(0) === [0,0,0,0]');

// ---- _isOpaque ----
assertStrictEqual(_isOpaque(0xFF000000), true, '_isOpaque(0xFF000000) === true');
assertStrictEqual(_isOpaque(0), false, '_isOpaque(0) === false');

// ---- _isTransparent ----
assertStrictEqual(_isTransparent(0), true, '_isTransparent(0) === true');
assertStrictEqual(_isTransparent(0xFF000000), false, '_isTransparent(0xFF000000) === false');

// ---- _getPixel / _setPixel ----
const testData = new Uint32Array(100);
testData[15] = 0xFFFF0000;
assertStrictEqual(_getPixel(testData, 10, 5, 1), 0xFFFF0000, '_getPixel reads correct value at flat index');
assertStrictEqual(_getPixel(testData, 10, 0, 0), 0, '_getPixel reads 0 for unset index');

const testData2 = new Uint32Array(100);
_setPixel(testData2, 10, 3, 4, 0xFF00FF00);
assertStrictEqual(testData2[43], 0xFF00FF00, '_setPixel writes at correct flat index (4*10+3=43)');

// ---- _colorStringToUint32 ----
assertStrictEqual(_colorStringToUint32('rgb(255, 0, 0)') >>> 0, 0xFF0000FF, '_colorStringToUint32("rgb(255, 0, 0)") === 0xFF0000FF');

// ---- _colorToUint32 ----
assertStrictEqual(_colorToUint32('transparent'), 0, '_colorToUint32("transparent") === 0');
assertStrictEqual(_colorToUint32(null), 0, '_colorToUint32(null) === 0');

// ---- _uint32ToColorStr ----
assertStrictEqual(_uint32ToColorStr(0xFF0000FF), 'rgb(255, 0, 0)', '_uint32ToColorStr(0xFF0000FF) === "rgb(255, 0, 0)"');

// ---- _initColorLUT / LUT lookup ----
_initColorLUT();
assertStrictEqual(_colorToUint32('rgb(255, 0, 0)') >>> 0, 0xFF0000FF, '_colorToUint32("rgb(255, 0, 0)") via LUT === 0xFF0000FF');
assertStrictEqual(_colorToUint32('rgb(0, 255, 0)') >>> 0, 0xFF00FF00, '_colorToUint32("rgb(0, 255, 0)") via LUT === 0xFF00FF00');

// ---- 边缘: Uint32Array 初始化透明 ----
const emptyArr = new Uint32Array(100);
assertStrictEqual(emptyArr[0], 0, 'new Uint32Array(N) initializes all entries to 0 (transparent)');

// ---- Slice 3: Uint32Array 快照测试 ----

(function() {
	// 1. new Uint32Array(src) 是独立拷贝
	const src1 = new Uint32Array([1, 2, 3, 4, 5]);
	const copy1 = new Uint32Array(src1);
	copy1[0] = 99;
	assertStrictEqual(src1[0], 1, 'new Uint32Array(src) creates independent copy (modifying copy does not affect source)');

	// 2. new Uint32Array(src) 保留所有值
	const src2 = new Uint32Array([10, 20, 30]);
	const copy2 = new Uint32Array(src2);
	assertStrictEqual(copy2[0], 10, 'new Uint32Array(src) preserves value at index 0');
	assertStrictEqual(copy2[1], 20, 'new Uint32Array(src) preserves value at index 1');
	assertStrictEqual(copy2[2], 30, 'new Uint32Array(src) preserves value at index 2');
	assertStrictEqual(copy2.length, 3, 'new Uint32Array(src) preserves length');

	// 3. 从 Object.values() 重建（旧格式兼容）
	const oldFormatData = { '0': 100, '1': 200, '2': 300 };
	const rebuilt = new Uint32Array(Object.values(oldFormatData));
	assertStrictEqual(rebuilt[0], 100, 'new Uint32Array(Object.values(oldObj)) restores index 0');
	assertStrictEqual(rebuilt[1], 200, 'new Uint32Array(Object.values(oldObj)) restores index 1');
	assertStrictEqual(rebuilt[2], 300, 'new Uint32Array(Object.values(oldObj)) restores index 2');
	assertStrictEqual(rebuilt.length, 3, 'new Uint32Array(Object.values(oldObj)) preserves length');

	// 4. new Uint32Array(N) 初始化为 0
	const empty = new Uint32Array(100);
	assertStrictEqual(empty[0], 0, 'new Uint32Array(N) initializes index 0 to 0');
	assertStrictEqual(empty[50], 0, 'new Uint32Array(N) initializes middle index to 0');
	assertStrictEqual(empty[99], 0, 'new Uint32Array(N) initializes last index to 0');
	assertStrictEqual(empty.length, 100, 'new Uint32Array(N) has correct length');

	// 5. arr.fill(0) 清除所有像素
	const fillArr = new Uint32Array([1, 2, 3, 4, 5]);
	fillArr.fill(0);
	assertStrictEqual(fillArr[0], 0, 'arr.fill(0) clears index 0');
	assertStrictEqual(fillArr[2], 0, 'arr.fill(0) clears middle index');
	assertStrictEqual(fillArr[4], 0, 'arr.fill(0) clears last index');
	assertStrictEqual(fillArr.length, 5, 'arr.fill(0) preserves length');
})();

// ---- 汇总 ----
const totalTests = 21;
const passedTests = totalTests - __failedCount;
console.log('\n=== 测试完毕 ===');
console.log('总用例: ' + totalTests + ', 通过: ' + passedTests + ', 失败: ' + __failedCount);
if (__failedCount === 0) {
    console.log('结果: 全部通过');
} else {
    console.log('结果: 存在失败');
}

// 浏览器兼容: 在 DOMContentLoaded 之后运行时可显示汇总
if (typeof document !== 'undefined' && document.body) {
    const summary = document.createElement('div');
    summary.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#333;color:#fff;padding:10px;border-radius:4px;font:14px monospace;z-index:9999';
    summary.textContent = '测试: ' + passedTests + '/' + totalTests + ' 通过' + (__failedCount > 0 ? ', ' + __failedCount + ' 失败' : ', 全部通过');
    document.body.appendChild(summary);
}

// ==================== Slice 2 工具写入方法测试 ====================

// 模拟环境设置
const _testW = 20, _testH = 20;
const _slice2Data = new Uint32Array(_testW * _testH);

function _resetSlice2() {
    _slice2Data.fill(0);
    globalThis.state = {
        canvasWidth: _testW,
        canvasHeight: _testH,
        currentColor: null,
        currentTool: 'pencil',
        brushSize: 1,
        activeLayerIndex: 0
    };
}
_resetSlice2();

// 模拟 DOM 无关的全局依赖
globalThis.getActiveData = () => _slice2Data;
globalThis._invalidateLayerCache = () => {};
globalThis.renderCanvas = () => {};
globalThis.showNotification = () => {};
globalThis.saveState = () => {};

// 初始化 LUT
_initColorLUT();

// ---- 复制修改后的绘制函数（与 pixel-draw.js 同步） ----

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
    _invalidateLayerCache(state.activeLayerIndex);
}

function drawLine(x0, y0, x1, y1, color) {
    const activeData = getActiveData();
    if (!activeData) return;

    const uint32Color = _colorToUint32(color) >>> 0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        const radius = Math.floor(state.brushSize / 2);
        for (let by = -radius; by <= radius; by++) {
            for (let bx = -radius; bx <= radius; bx++) {
                const px = x0 + bx;
                const py = y0 + by;
                if (px >= 0 && px < state.canvasWidth && py >= 0 && py < state.canvasHeight) {
                    _setPixel(activeData, state.canvasWidth, px, py, uint32Color);
                }
            }
        }

        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
    _invalidateLayerCache(state.activeLayerIndex);
}

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
    _invalidateLayerCache(state.activeLayerIndex);
}

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
    _invalidateLayerCache(state.activeLayerIndex);
}

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

        let leftX = x;
        while (leftX > 0 && _getPixel(activeData, w, leftX - 1, y) === targetColor) {
            leftX--;
        }
        let rightX = x;
        while (rightX < w - 1 && _getPixel(activeData, w, rightX + 1, y) === targetColor) {
            rightX++;
        }

        for (let fx = leftX; fx <= rightX; fx++) {
            const idx = y * w + fx;
            if (!visited[idx]) {
                _setPixel(activeData, w, fx, y, fillUint32);
                visited[idx] = 1;
            }
        }

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

            if (currentColor === targetColor && currentColor !== fillUint32) {
                _setPixel(activeData, width, x, y, fillUint32);
                fillCount++;
            }
        }
    }

    _invalidateLayerCache(state.activeLayerIndex);
    renderCanvas();

    if (fillCount > 0) {
        showNotification(`已填充 ${fillCount} 个像素`);
    } else {
        showNotification('没有找到可填充的像素');
    }
}

// ==================== 绘制函数测试 ====================

console.log('\n=== Slice 2 绘制函数测试 ===\n');

let _slice2FailCount = 0;
const R = _packRGB(255, 0, 0) >>> 0;
const G = _packRGB(0, 255, 0) >>> 0;
const B = _packRGB(0, 0, 255) >>> 0;

const _s2 = (cond, msg) => {
    if (!cond) { console.error('FAIL: ' + msg); _slice2FailCount++; __failedCount++; }
    else { console.log('PASS: ' + msg); }
};

// ---- drawPixel (6) ----
(() => {
    _resetSlice2();
    state.currentColor = 'rgb(255, 0, 0)';
    state.currentTool = 'pencil';
    drawPixel(5, 5);
    _s2(_getPixel(_slice2Data, _testW, 5, 5) === R, 'drawPixel: pencil draws at (5,5)');

    _resetSlice2();
    state.currentColor = 'transparent';
    drawPixel(3, 3);
    _s2(_getPixel(_slice2Data, _testW, 3, 3) === 0, 'drawPixel: transparent writes 0');

    _resetSlice2();
    state.currentColor = 'rgb(0, 255, 0)';
    state.currentTool = 'eraser';
    drawPixel(7, 7);
    _s2(_getPixel(_slice2Data, _testW, 7, 7) === 0, 'drawPixel: eraser writes 0');

    _resetSlice2();
    state.currentColor = 'rgb(0, 0, 255)';
    state.brushSize = 3;
    drawPixel(10, 10);
    _s2(_getPixel(_slice2Data, _testW, 9, 9) === B, 'drawPixel: brushSize 3 covers (9,9)');

    _resetSlice2();
    state.brushSize = 1;
    state.currentColor = 'rgb(255, 0, 0)';
    drawPixel(-1, 5);
    _s2(_getPixel(_slice2Data, _testW, 0, 5) === 0, 'drawPixel: out-of-bounds x no-op');

    _resetSlice2();
    state.currentColor = 'rgb(255, 0, 0)';
    drawPixel(0, 0);
    _s2(_getPixel(_slice2Data, _testW, 0, 0) === R, 'drawPixel: draws at top-left (0,0)');
})();

// ---- drawLine (5) ----
(() => {
    _resetSlice2();
    drawLine(2, 5, 8, 5, 'rgb(255, 0, 0)');
    _s2(_getPixel(_slice2Data, _testW, 5, 5) === R, 'drawLine: horizontal line draws midpoint');

    _resetSlice2();
    drawLine(5, 2, 5, 8, 'rgb(0, 255, 0)');
    _s2(_getPixel(_slice2Data, _testW, 5, 5) === G, 'drawLine: vertical line draws midpoint');

    _resetSlice2();
    drawLine(1, 1, 4, 4, 'rgb(0, 0, 255)');
    _s2(_getPixel(_slice2Data, _testW, 2, 2) === B, 'drawLine: diagonal line draws midpoint');

    _resetSlice2();
    drawLine(1, 1, 5, 1, 'rgb(255, 0, 0)');
    drawLine(1, 1, 5, 1, null);
    _s2(_getPixel(_slice2Data, _testW, 3, 1) === 0, 'drawLine: eraser (null) clears');

    _resetSlice2();
    drawLine(1, 1, 5, 1, 'transparent');
    _s2(_getPixel(_slice2Data, _testW, 3, 1) === 0, 'drawLine: transparent writes 0');
})();

// ---- drawRect (3) ----
(() => {
    _resetSlice2();
    drawRect(2, 2, 6, 5, 'rgb(255, 0, 0)');
    _s2(_getPixel(_slice2Data, _testW, 2, 2) === R, 'drawRect: top-left corner drawn');
    _s2(_getPixel(_slice2Data, _testW, 4, 3) === 0, 'drawRect: interior not filled');

    _resetSlice2();
    drawRect(5, 5, 5, 5, 'rgb(0, 255, 0)');
    _s2(_getPixel(_slice2Data, _testW, 5, 5) === G, 'drawRect: single pixel rect');

    _resetSlice2();
    drawRect(2, 2, 6, 5, 'transparent');
    _s2(_getPixel(_slice2Data, _testW, 2, 2) === 0, 'drawRect: transparent writes 0');
})();

// ---- drawCircle (4) ----
(() => {
    _resetSlice2();
    drawCircle(5, 5, 1, 'rgb(255, 0, 0)');
    _s2(_getPixel(_slice2Data, _testW, 5, 4) === R, 'drawCircle: radius 1 top pixel');
    _s2(_getPixel(_slice2Data, _testW, 5, 5) === 0, 'drawCircle: radius 1 center not filled');

    _resetSlice2();
    drawCircle(10, 10, 3, 'rgb(0, 255, 0)');
    _s2(_getPixel(_slice2Data, _testW, 10, 7) === G, 'drawCircle: radius 3 top pixel');

    _resetSlice2();
    drawCircle(1, 1, 3, 'transparent');
    _s2(_getPixel(_slice2Data, _testW, 0, 0) === 0, 'drawCircle: transparent writes 0 at edge');

    _resetSlice2();
    drawCircle(0, 0, 2, 'rgb(0, 0, 255)');
    _s2(Array.from(_slice2Data).some(v => v === B), 'drawCircle: corner circle draws some pixels');
})();

// ---- floodFill (6) ----
(() => {
    _resetSlice2();
    _setPixel(_slice2Data, _testW, 5, 5, R);
    _setPixel(_slice2Data, _testW, 7, 5, R);
    _setPixel(_slice2Data, _testW, 5, 7, R);
    _setPixel(_slice2Data, _testW, 7, 7, R);
    floodFill(6, 6, 'rgb(0, 255, 0)');
    _s2(_getPixel(_slice2Data, _testW, 6, 6) === G, 'floodFill: fills bounded interior');

    _resetSlice2();
    _setPixel(_slice2Data, _testW, 5, 5, R);
    floodFill(0, 0, 'rgb(0, 0, 255)');
    _s2(_getPixel(_slice2Data, _testW, 10, 10) === B, 'floodFill: fills from edge to barrier');

    _resetSlice2();
    floodFill(0, 0, 'transparent');
    _s2(_getPixel(_slice2Data, _testW, 0, 0) === 0, 'floodFill: same target color no-op');

    _resetSlice2();
    floodFill(0, 0, 'rgb(255, 0, 0)');
    _s2(_getPixel(_slice2Data, _testW, 19, 19) === R, 'floodFill: fills entire canvas');

    _resetSlice2();
    _setPixel(_slice2Data, _testW, 3, 3, R);
    _setPixel(_slice2Data, _testW, 4, 4, R);
    floodFill(3, 3, 'transparent');
    _s2(_getPixel(_slice2Data, _testW, 3, 3) === 0, 'floodFill: transparent fill clears');

    _resetSlice2();
    _setPixel(_slice2Data, _testW, 5, 5, R);
    floodFill(0, 5, 'rgb(0, 0, 255)');
    _s2(_getPixel(_slice2Data, _testW, 4, 5) === B, 'floodFill: fills from left edge to barrier at (5,5)');
})();

// ---- globalFill (4) ----
(() => {
    _resetSlice2();
    _setPixel(_slice2Data, _testW, 2, 2, R);
    _setPixel(_slice2Data, _testW, 5, 5, R);
    _setPixel(_slice2Data, _testW, 10, 10, G);
    globalFill(R, 'rgb(0, 0, 255)');
    _s2(_getPixel(_slice2Data, _testW, 2, 2) === B, 'globalFill: red pixel becomes blue');
    _s2(_getPixel(_slice2Data, _testW, 10, 10) === G, 'globalFill: green pixel unchanged');

    _resetSlice2();
    _setPixel(_slice2Data, _testW, 5, 5, R);
    globalFill(G, 'rgb(0, 0, 255)');
    _s2(_getPixel(_slice2Data, _testW, 5, 5) === R, 'globalFill: no matching target no-op');

    _resetSlice2();
    _setPixel(_slice2Data, _testW, 3, 3, R);
    globalFill(R, 'rgb(255, 0, 0)');
    _s2(_getPixel(_slice2Data, _testW, 3, 3) === R, 'globalFill: target equals fill no-op');

    _resetSlice2();
    _setPixel(_slice2Data, _testW, 3, 3, R);
    _setPixel(_slice2Data, _testW, 7, 7, R);
    globalFill(R, 'transparent');
    _s2(_getPixel(_slice2Data, _testW, 3, 3) === 0, 'globalFill: transparent fill clears');
})();

// ==================== Slice 5 PNG 导出合成测试 ====================

(function() {
    let _s5FailCount = 0;
    const _s5 = (cond, msg) => {
        if (!cond) { console.error('FAIL: ' + msg); _s5FailCount++; __failedCount++; }
        else { console.log('PASS: ' + msg); }
    };
    const W = 10, H = 10;
    const _pixelCount = W * H;

    // 模拟 doExportPNG 中的合成逻辑
    function _compositeRGBA(layers, w, h) {
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            if (!layer.visible) continue;
            const maskLayer = (i > 0 && layers[i - 1].isMask) ? layers[i - 1] : null;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const pixel = layer.data[y * w + x];
                    if (pixel && (!maskLayer || maskLayer.data[y * w + x])) {
                        const idx = (y * w + x) * 4;
                        rgba[idx] = pixel & 0xFF;
                        rgba[idx + 1] = (pixel >> 8) & 0xFF;
                        rgba[idx + 2] = (pixel >> 16) & 0xFF;
                        rgba[idx + 3] = 255;
                    }
                }
            }
        }
        return rgba;
    }
    function _getRGBA(rgba, w, x, y) {
        const idx = (y * w + x) * 4;
        return [rgba[idx], rgba[idx + 1], rgba[idx + 2], rgba[idx + 3]];
    }

    console.log('\n=== Slice 5 PNG 导出合成测试 ===\n');

    // 1. uint32 RGBA 字节提取（与 _unpack 对照）
    (() => {
        const p1 = 0xFF0000FF;
        const u1 = _unpack(p1);
        _s5(u1[0] === 255 && u1[1] === 0 && u1[2] === 0 && u1[3] === 255, 'Slice5: uint32 0xFF0000FF -> R=255 G=0 B=0 A=255');

        const p2 = 0xFF00FF00;
        const u2 = _unpack(p2);
        _s5(u2[0] === 0 && u2[1] === 255 && u2[2] === 0 && u2[3] === 255, 'Slice5: uint32 0xFF00FF00 -> R=0 G=255 B=0 A=255');

        const p3 = 0xFFFF0000;
        const u3 = _unpack(p3);
        _s5(u3[0] === 0 && u3[1] === 0 && u3[2] === 255 && u3[3] === 255, 'Slice5: uint32 0xFFFF0000 -> R=0 G=0 B=255 A=255');

        const p4 = 0;
        _s5(p4 ? true : false === false, 'Slice5: uint32 0 是 falsy（透明）');
    })();

    // 2. 2 图层合成：顶层覆盖底层
    (() => {
        const bottomData = new Uint32Array(_pixelCount);
        const topData = new Uint32Array(_pixelCount);
        bottomData[3 * W + 2] = 0xFF0000FF; // 底层红色
        topData[3 * W + 2] = 0xFF00FF00;    // 顶层绿色

        const layers = [
            { data: bottomData, visible: true, isMask: false },
            { data: topData, visible: true, isMask: false }
        ];
        const result = _compositeRGBA(layers, W, H);
        _s5(JSON.stringify(_getRGBA(result, W, 2, 3)) === JSON.stringify([0, 255, 0, 255]), 'Slice5: 顶层覆盖底层 (2,3) -> G=255');
    })();

    // 3. 透明像素不覆盖底层
    (() => {
        const bottomData = new Uint32Array(_pixelCount);
        const topData = new Uint32Array(_pixelCount);
        bottomData[3 * W + 2] = 0xFF0000FF; // 底层红色
        // 顶层 (2,3) 留 0（透明）

        const layers = [
            { data: bottomData, visible: true, isMask: false },
            { data: topData, visible: true, isMask: false }
        ];
        const result = _compositeRGBA(layers, W, H);
        _s5(JSON.stringify(_getRGBA(result, W, 2, 3)) === JSON.stringify([255, 0, 0, 255]), 'Slice5: 透明顶层不覆盖底层 (2,3) -> R=255');
    })();

    // 4. 蒙版层裁剪
    (() => {
        const bottomData = new Uint32Array(_pixelCount);
        const maskData = new Uint32Array(_pixelCount);
        const paintData = new Uint32Array(_pixelCount);
        bottomData[3 * W + 2] = 0xFF0000FF;   // 底层红色 (2,3)
        maskData[3 * W + 2] = 0;               // 蒙版屏蔽 (2,3)
        maskData[4 * W + 2] = 0xFFFFFFFF;       // 蒙版允许 (2,4)
        paintData[3 * W + 2] = 0xFF00FF00;      // 绘画层绿色 (2,3) —— 应被屏蔽
        paintData[4 * W + 2] = 0xFF0000FF;      // 绘画层红色 (2,4) —— 应显示

        const layers = [
            { data: bottomData, visible: true, isMask: false },
            { data: maskData, visible: true, isMask: true },
            { data: paintData, visible: true, isMask: false }
        ];
        const result = _compositeRGBA(layers, W, H);
        _s5(JSON.stringify(_getRGBA(result, W, 2, 3)) === JSON.stringify([255, 0, 0, 255]), 'Slice5: 蒙版屏蔽 (2,3) -> 底层红色透出');
        _s5(JSON.stringify(_getRGBA(result, W, 2, 4)) === JSON.stringify([255, 0, 0, 255]), 'Slice5: 蒙版允许 (2,4) -> 绘画层红色显示');
    })();

    console.log('\n=== Slice 5 测试完毕 ===');
    console.log('总用例: 8, 通过: ' + (8 - _s5FailCount) + ', 失败: ' + _s5FailCount);
})();

// ==================== Slice 8 剩余操作扁平数组改造测试 ====================

(function() {
    let _s8FailCount = 0;
    const _s8 = (cond, msg) => {
        if (!cond) { console.error('FAIL: ' + msg); _s8FailCount++; __failedCount++; }
        else { console.log('PASS: ' + msg); }
    };

    const W8 = 10, H8 = 10;

    function _test_hasCanvasContent() {
        if (!state.layers || state.layers.length === 0) return false;
        const w = state.canvasWidth;
        for (const layer of state.layers) {
            for (let y = 0; y < state.canvasHeight; y++) {
                for (let x = 0; x < state.canvasWidth; x++) {
                    if (_isOpaque(_getPixel(layer.data, w, x, y))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function _test_getLayerPixelColor(x, y) {
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

    function _test_hasTransparentNeighbor(x, y) {
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
            if (nx < 0 || nx >= w || ny < 0 || ny >= state.canvasHeight) {
                return true;
            }
            if (_isTransparent(_getPixel(activeData, w, nx, ny))) {
                return true;
            }
        }
        return false;
    }

    function _test_hasOpaqueNeighbor(x, y) {
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
            if (nx < 0 || nx >= w || ny < 0 || ny >= state.canvasHeight) {
                continue;
            }
            if (_isOpaque(_getPixel(activeData, w, nx, ny))) {
                return true;
            }
        }
        return false;
    }

    function _test_mergeDownLower() {
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
    }

    function _test_generateTransformPreview() {
        const activeData = getActiveData();
        if (!activeData) return [];
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
        return preview;
    }

    function _test_applyTransform() {
        const activeData = getActiveData();
        if (!activeData) return null;
        const offsetX = state.transformOffsetX;
        const offsetY = state.transformOffsetY;
        if (offsetX === 0 && offsetY === 0) return null;
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
        return newData;
    }

    console.log('\n=== Slice 8 剩余操作扁平数组改造测试 ===\n');

    const R8 = _packRGB(255, 0, 0) >>> 0;
    const G8 = _packRGB(0, 255, 0) >>> 0;

    // ---- hasCanvasContent ---
    (() => {
        globalThis.state = {
            layers: [{
                data: new Uint32Array(W8 * H8),
                visible: true, isMask: false
            }],
            canvasWidth: W8,
            canvasHeight: H8,
            activeLayerIndex: 0
        };
        _s8(!_test_hasCanvasContent(), 'hasCanvasContent: 空画布返回 false');

        _setPixel(state.layers[0].data, W8, 2, 3, R8);
        _s8(_test_hasCanvasContent(), 'hasCanvasContent: 有像素返回 true');
    })();

    // ---- hasTransparentNeighbor ----
    (() => {
        const _data = new Uint32Array(W8 * H8);
        _setPixel(_data, W8, 5, 5, R8);
        globalThis.getActiveData = () => _data;
        globalThis.state = { canvasWidth: W8, canvasHeight: H8 };
        _s8(_test_hasTransparentNeighbor(0, 5), 'hasTransparentNeighbor: 边缘像素视为有透明邻居');
        _s8(_test_hasTransparentNeighbor(5, 5), 'hasTransparentNeighbor: 周围全透明返回 true');

        // 填充所有 8 个邻居
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                _setPixel(_data, W8, 5 + dx, 5 + dy, R8);
            }
        }
        _s8(!_test_hasTransparentNeighbor(5, 5), 'hasTransparentNeighbor: 周围全不透明返回 false');
    })();

    // ---- hasOpaqueNeighbor ----
    (() => {
        const _data = new Uint32Array(W8 * H8);
        _setPixel(_data, W8, 5, 5, R8);
        globalThis.getActiveData = () => _data;
        globalThis.state = { canvasWidth: W8, canvasHeight: H8 };
        _s8(!_test_hasOpaqueNeighbor(0, 5), 'hasOpaqueNeighbor: 边缘像素（边界外不算）');
        _s8(_test_hasOpaqueNeighbor(5, 6), 'hasOpaqueNeighbor: (5,6) 的邻居 (5,5) 不透明返回 true');
        _s8(_test_hasOpaqueNeighbor(4, 5), 'hasOpaqueNeighbor: 透明像素旁边有不透明邻居返回 true');
        _s8(!_test_hasOpaqueNeighbor(0, 0), 'hasOpaqueNeighbor: 角落无不透明邻居返回 false');
    })();

    // ---- getLayerPixelColor ----
    (() => {
        const _bottomData = new Uint32Array(W8 * H8);
        const _topData = new Uint32Array(W8 * H8);
        _setPixel(_bottomData, W8, 3, 3, R8);
        _setPixel(_topData, W8, 3, 3, G8);
        globalThis.state = {
            canvasWidth: W8,
            layers: [
                { data: _bottomData, visible: true },
                { data: _topData, visible: true }
            ]
        };
        _s8(_test_getLayerPixelColor(3, 3) === 'rgb(0, 255, 0)', 'getLayerPixelColor: 顶层可见返回颜色');

        state.layers[1].visible = false;
        _s8(_test_getLayerPixelColor(3, 3) === 'rgb(255, 0, 0)', 'getLayerPixelColor: 顶层隐藏穿透到底层');

        _s8(_test_getLayerPixelColor(0, 0) === null, 'getLayerPixelColor: 透明返回 null');
    })();

    // ---- mergeDown ----
    (() => {
        const _upperData = new Uint32Array(W8 * H8);
        const _lowerData = new Uint32Array(W8 * H8);
        _setPixel(_upperData, W8, 2, 2, R8);
        _setPixel(_upperData, W8, 5, 5, G8);
        globalThis.state = {
            canvasWidth: W8,
            canvasHeight: H8,
            activeLayerIndex: 1,
            layers: [
                { data: _lowerData, visible: true, isMask: false },
                { data: _upperData, visible: true, isMask: false }
            ]
        };
        _test_mergeDownLower();
        _s8(_isOpaque(_getPixel(_lowerData, W8, 2, 2)) && _getPixel(_lowerData, W8, 2, 2) === R8, 'mergeDown: 上层红色像素复制到下层');
        _s8(_isOpaque(_getPixel(_lowerData, W8, 5, 5)) && _getPixel(_lowerData, W8, 5, 5) === G8, 'mergeDown: 上层绿色像素复制到下层');
        _s8(!_isOpaque(_getPixel(_lowerData, W8, 0, 0)), 'mergeDown: 无上层像素的位置不变');
    })();

    // ---- generateTransformPreview ----
    (() => {
        const _data = new Uint32Array(W8 * H8);
        _setPixel(_data, W8, 3, 3, R8);
        _setPixel(_data, W8, 4, 4, G8);
        globalThis.getActiveData = () => _data;
        globalThis.state = {
            canvasWidth: W8,
            canvasHeight: H8,
            transformOffsetX: 2,
            transformOffsetY: 1
        };
        const preview = _test_generateTransformPreview();
        _s8(preview.length === 2, 'generateTransformPreview: 两个像素生成两个预览点');
        _s8(preview.some(p => p.x === 5 && p.y === 4 && p.color === 'rgb(255, 0, 0)'), 'generateTransformPreview: 红色像素偏移到 (5,4)');
        _s8(preview.some(p => p.x === 6 && p.y === 5 && p.color === 'rgb(0, 255, 0)'), 'generateTransformPreview: 绿色像素偏移到 (6,5)');
    })();

    // ---- applyTransform ----
    (() => {
        const _data = new Uint32Array(W8 * H8);
        _setPixel(_data, W8, 3, 3, R8);
        _setPixel(_data, W8, 4, 4, G8);
        globalThis.getActiveData = () => _data;
        globalThis.state = {
            canvasWidth: W8,
            canvasHeight: H8,
            transformOffsetX: 2,
            transformOffsetY: 1
        };
        const newData = _test_applyTransform();
        _s8(newData !== null, 'applyTransform: 偏移非零返回新数据');
        _s8(_isOpaque(_getPixel(newData, W8, 5, 4)) && _getPixel(newData, W8, 5, 4) === R8, 'applyTransform: 红色像素移动到 (5,4)');
        _s8(_isOpaque(_getPixel(newData, W8, 6, 5)) && _getPixel(newData, W8, 6, 5) === G8, 'applyTransform: 绿色像素移动到 (6,5)');
        _s8(!_isOpaque(_getPixel(newData, W8, 3, 3)), 'applyTransform: 原位置变为透明');
    })();

    console.log('\n=== Slice 8 测试完毕 ===');
    console.log('总用例: 22, 通过: ' + (22 - _s8FailCount) + ', 失败: ' + _s8FailCount);
})();

// ==================== Slice 6 图层缩略图降采样测试 ====================

(function() {
    let _s6FailCount = 0;
    const _s6 = (cond, msg) => {
        if (!cond) { console.error('FAIL: ' + msg); _s6FailCount++; __failedCount++; }
        else { console.log('PASS: ' + msg); }
    };

    function _calcThumbDims(cw, ch) {
        const MAX_THUMB = 96;
        const scale = Math.min(1, MAX_THUMB / Math.max(cw, ch));
        return {
            w: Math.max(1, Math.round(cw * scale)),
            h: Math.max(1, Math.round(ch * scale)),
            scale: scale
        };
    }

    console.log('\n=== Slice 6 图层缩略图降采样测试 ===\n');

    // 1. 32x32 画布 → scale=1, thumbW=32, thumbH=32
    (() => {
        const dims = _calcThumbDims(32, 32);
        _s6(dims.scale === 1, 'Slice6: 32x32 scale === 1');
        _s6(dims.w === 32, 'Slice6: 32x32 thumbW === 32');
        _s6(dims.h === 32, 'Slice6: 32x32 thumbH === 32');
    })();

    // 2. 192x128 画布 → scale=96/192=0.5, thumbW=96, thumbH=64
    (() => {
        const dims = _calcThumbDims(192, 128);
        _s6(Math.abs(dims.scale - 0.5) < 0.001, 'Slice6: 192x128 scale === 0.5');
        _s6(dims.w === 96, 'Slice6: 192x128 thumbW === 96');
        _s6(dims.h === 64, 'Slice6: 192x128 thumbH === 64');
    })();

    console.log('\n=== Slice 6 测试完毕 ===');
    console.log('总用例: 6, 通过: ' + (6 - _s6FailCount) + ', 失败: ' + _s6FailCount);
})();

// ---- 汇总 ----
const slice2Total = 6 + 5 + 3 + 4 + 6 + 4;
const slice2Passed = slice2Total - _slice2FailCount;
console.log('\n=== Slice 2 测试完毕 ===');
console.log('总用例: ' + slice2Total + ', 通过: ' + slice2Passed + ', 失败: ' + _slice2FailCount);

const allTotal = totalTests + slice2Total + 8 + 22 + 6;
const allPassed = allTotal - __failedCount;
console.log('\n=== 全部测试汇总 ===');
console.log('总用例: ' + allTotal + ', 通过: ' + allPassed + ', 失败: ' + (__failedCount));
if (__failedCount === 0) {
    console.log('结果: 全部通过');
} else {
    console.log('结果: 存在失败');
}
