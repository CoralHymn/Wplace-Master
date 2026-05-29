// ==UserScript==
// @name         PixelMaster - WP 画板像素后处理
// @namespace    https://master.wplace.icu/
// @version      1.0
// @description  为 WP 在线画板添加像素转换器后处理功能：抖动、调色板映射、色温调整、颜色替换
// @author       Wplace
// @match        https://master.wplace.icu/pixel-draw.html
// @match        https://master.wplace.icu/pixel-draw*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 算法配置 ====================
    const ALGORITHMS = {
        'No Dithering': { type: 'error', kernel: null },
        'Floyd Steinberg': { type: 'error', kernel: [[[1,0],7/16],[[-1,1],3/16],[[0,1],5/16],[[1,1],1/16]] },
        'Jarvis Judice Ninke': { type: 'error', kernel: [[[1,0],7/48],[[2,0],5/48],[[-2,1],3/48],[[-1,1],5/48],[[0,1],7/48],[[1,1],5/48],[[2,1],3/48],[[-2,2],1/48],[[-1,2],3/48],[[0,2],5/48],[[1,2],3/48],[[2,2],1/48]] },
        'Stucki': { type: 'error', kernel: [[[1,0],8/42],[[2,0],4/42],[[-2,1],2/42],[[-1,1],4/42],[[0,1],8/42],[[1,1],4/42],[[2,1],2/42],[[-2,2],1/42],[[-1,2],2/42],[[0,2],4/42],[[1,2],2/42],[[2,2],1/42]] },
        'Burkes': { type: 'error', kernel: [[[1,0],8/32],[[2,0],4/32],[[-2,1],2/32],[[-1,1],4/32],[[0,1],8/32],[[1,1],4/32],[[2,1],2/32]] },
        'Atkinson': { type: 'error', kernel: [[[1,0],1/8],[[2,0],1/8],[[-1,1],1/8],[[0,1],1/8],[[1,1],1/8],[[0,2],1/8]] },
        'Sierra3': { type: 'error', kernel: [[[1,0],5/32],[[2,0],3/32],[[-2,1],2/32],[[-1,1],4/32],[[0,1],5/32],[[1,1],4/32],[[2,1],2/32]] },
        'Sierra2': { type: 'error', kernel: [[[1,0],4/16],[[2,0],3/16],[[-1,1],2/16],[[0,1],3/16],[[1,1],2/16],[[-1,2],1/16],[[0,2],1/16]] },
        'SierraLite': { type: 'error', kernel: [[[1,0],2/4],[[-1,1],1/4],[[0,1],1/4]] },
        'Bayer2x2': { type: 'ordered', matrix: [[0,2],[3,1]] },
        'Bayer4x4': { type: 'ordered', matrix: [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]] },
        'Bayer8x8': { type: 'ordered', matrix: [[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]] },
        'Ordered3x3': { type: 'ordered', matrix: [[0,7,3],[6,5,2],[4,1,8]] }
    };

    const ALGORITHM_NAMES = Object.keys(ALGORITHMS);

    // ==================== 核心算法 ====================

    function findClosestColor(color, palette) {
        let minDistance = Infinity;
        let closestColor = palette[0];
        for (const pColor of palette) {
            const dr = color[0] - pColor[0];
            const dg = color[1] - pColor[1];
            const db = color[2] - pColor[2];
            const distance = dr * dr + dg * dg + db * db;
            if (distance < minDistance) {
                minDistance = distance;
                closestColor = pColor;
            }
        }
        return closestColor;
    }

    function parseColorString(colorStr) {
        const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        }
        return null;
    }

    function applyErrorDither(imageData, palette, strength, kernel, isLocked, fullPalette, selectedColorSet) {
        const w = imageData.width;
        const h = imageData.height;
        const data = new Float32Array(w * h * 4);

        for (let i = 0; i < imageData.data.length; i++) {
            data[i] = imageData.data[i];
        }

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const oldColor = [data[i], data[i + 1], data[i + 2]];
                const alpha = data[i + 3];

                if (alpha < 128) {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
                    continue;
                }

                if (isLocked && fullPalette && fullPalette.length > 0 && selectedColorSet && selectedColorSet.size > 0) {
                    const originalClosest = findClosestColor(oldColor, fullPalette);
                    if (!selectedColorSet.has(JSON.stringify(originalClosest))) {
                        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0;
                        continue;
                    }
                }

                const newColor = findClosestColor(oldColor, palette);
                data[i] = newColor[0];
                data[i + 1] = newColor[1];
                data[i + 2] = newColor[2];
                data[i + 3] = alpha;

                if (strength > 0 && kernel) {
                    const error = [
                        (oldColor[0] - newColor[0]) * strength,
                        (oldColor[1] - newColor[1]) * strength,
                        (oldColor[2] - newColor[2]) * strength
                    ];

                    for (const [pos, factor] of kernel) {
                        const [dx, dy] = pos;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            const ni = (ny * w + nx) * 4;
                            data[ni] += error[0] * factor;
                            data[ni + 1] += error[1] * factor;
                            data[ni + 2] += error[2] * factor;
                        }
                    }
                }
            }
        }

        const outputData = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < outputData.length; i++) {
            outputData[i] = Math.round(Math.max(0, Math.min(255, data[i])));
        }
        return new ImageData(outputData, w, h);
    }

    function applyOrderedDither(imageData, palette, strength, bayerMatrix, isLocked, fullPalette, selectedColorSet) {
        const w = imageData.width;
        const h = imageData.height;
        const n = bayerMatrix.length;
        const bayerFactor = 255 / (n * n);
        const outputData = new Uint8ClampedArray(w * h * 4);

        for (let i = 0; i < imageData.data.length; i++) {
            outputData[i] = imageData.data[i];
        }

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const oldColor = [outputData[i], outputData[i + 1], outputData[i + 2]];
                const alpha = outputData[i + 3];

                if (alpha < 128) {
                    outputData[i] = 0; outputData[i + 1] = 0; outputData[i + 2] = 0; outputData[i + 3] = 0;
                    continue;
                }

                if (isLocked && fullPalette && fullPalette.length > 0 && selectedColorSet && selectedColorSet.size > 0) {
                    const originalClosest = findClosestColor(oldColor, fullPalette);
                    if (!selectedColorSet.has(JSON.stringify(originalClosest))) {
                        outputData[i] = 0; outputData[i + 1] = 0; outputData[i + 2] = 0; outputData[i + 3] = 0;
                        continue;
                    }
                }

                const threshold = (bayerMatrix[y % n][x % n] - n * n / 2) * bayerFactor * strength * 0.2;
                const r = outputData[i] + threshold;
                const g = outputData[i + 1] + threshold;
                const b = outputData[i + 2] + threshold;
                const closest = findClosestColor([r, g, b], palette);
                outputData[i] = closest[0];
                outputData[i + 1] = closest[1];
                outputData[i + 2] = closest[2];
                outputData[i + 3] = alpha;
            }
        }

        return new ImageData(outputData, w, h);
    }

    function applyForceOpaque(imageData, palette) {
        const data = imageData.data;
        const newImageData = new ImageData(imageData.width, imageData.height);
        const newData = newImageData.data;

        for (let i = 0; i < data.length; i++) {
            newData[i] = data[i];
        }

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) {
                newData[i] = 0; newData[i + 1] = 0; newData[i + 2] = 0; newData[i + 3] = 0;
            } else {
                newData[i + 3] = 255;
                const closest = findClosestColor([data[i], data[i + 1], data[i + 2]], palette);
                newData[i] = closest[0];
                newData[i + 1] = closest[1];
                newData[i + 2] = closest[2];
            }
        }

        return newImageData;
    }

    function applyColorTemperature(imageData, temperature) {
        if (temperature === 0) return imageData;
        const data = imageData.data;
        const factor = temperature / 100;

        for (let i = 0; i < data.length; i += 4) {
            if (factor > 0) {
                data[i] = Math.min(255, data[i] + 30 * factor);
                data[i + 1] = Math.min(255, data[i + 1] + 10 * factor);
                data[i + 2] = Math.max(0, data[i + 2] - 30 * factor);
            } else {
                data[i] = Math.max(0, data[i] + 30 * factor);
                data[i + 1] = Math.max(0, data[i + 1] + 10 * factor);
                data[i + 2] = Math.min(255, data[i + 2] - 30 * factor);
            }
        }
        return imageData;
    }

    function applyColorReplacements(imageData, replacements) {
        if (replacements.size === 0) return imageData;
        const data = imageData.data;
        const result = new ImageData(imageData.width, imageData.height);
        const resData = result.data;

        for (let i = 0; i < data.length; i++) {
            resData[i] = data[i];
        }

        const replacementMap = new Map();
        for (const [key, val] of replacements) {
            replacementMap.set(key, val);
        }

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 128) continue;
            const colorStr = '[' + data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ']';
            const replacement = replacementMap.get(colorStr);
            if (replacement) {
                resData[i] = replacement[0];
                resData[i + 1] = replacement[1];
                resData[i + 2] = replacement[2];
            }
        }

        return result;
    }

    // ==================== 状态 ====================
    const state = {
        active: false,
        collapsed: true,
        algorithm: 'Floyd Steinberg',
        strength: 80,
        temperature: 0,
        forceOpaque: true,
        isLocked: false,
        selectedColors: new Set(),
        fullPalette: [],
        colorReplacements: new Map(),
        processedImageData: null,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        panelLeft: null,
        panelTop: null
    };

    // ==================== 初始化：读取页面颜色信息 ====================
    function initPalette() {
        if (typeof COLOR_INFO !== 'undefined') {
            const allColors = [];
            for (const [rgbStr, info] of Object.entries(COLOR_INFO)) {
                const color = parseColorString(rgbStr);
                if (color) {
                    allColors.push(color);
                    state.selectedColors.add(rgbStr);
                }
            }
            state.fullPalette = allColors;
        }
    }

    function getActivePalette() {
        const palette = [];
        if (typeof COLOR_INFO !== 'undefined') {
            for (const rgbStr of Object.keys(COLOR_INFO)) {
                if (state.selectedColors.has(rgbStr)) {
                    const color = parseColorString(rgbStr);
                    if (color) palette.push(color);
                }
            }
        }
        if (palette.length === 0) {
            palette.push([0, 0, 0]);
        }
        return palette;
    }

    function getSelectedColorSet() {
        const set = new Set();
        if (typeof COLOR_INFO !== 'undefined') {
            for (const rgbStr of Object.keys(COLOR_INFO)) {
                if (state.selectedColors.has(rgbStr)) {
                    const color = parseColorString(rgbStr);
                    if (color) set.add(JSON.stringify(color));
                }
            }
        }
        return set;
    }

    // ==================== 画布捕获 ====================
    function captureCanvas() {
        const canvas = document.getElementById('pixel-canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    // ==================== 处理流程 ====================
    function processImage() {
        let imageData = captureCanvas();
        if (!imageData) {
            showToast('无法捕获画布');
            return null;
        }

        imageData = applyColorTemperature(imageData, state.temperature);

        const palette = getActivePalette();
        const algo = ALGORITHMS[state.algorithm];
        const fullPalette = state.fullPalette;
        const selectedColorSet = getSelectedColorSet();

        if (algo.type === 'error') {
            imageData = applyErrorDither(imageData, palette, state.strength / 100, algo.kernel, state.isLocked, fullPalette, selectedColorSet);
        } else if (algo.type === 'ordered') {
            imageData = applyOrderedDither(imageData, palette, state.strength / 100, algo.matrix, state.isLocked, fullPalette, selectedColorSet);
        }

        if (state.forceOpaque) {
            imageData = applyForceOpaque(imageData, palette);
        }

        if (state.colorReplacements.size > 0) {
            imageData = applyColorReplacements(imageData, state.colorReplacements);
        }

        state.processedImageData = imageData;
        return imageData;
    }

    function updatePreview() {
        const imageData = processImage();
        if (!imageData) return;

        const previewCanvas = document.getElementById('pm-preview-canvas');
        if (!previewCanvas) return;

        previewCanvas.width = imageData.width;
        previewCanvas.height = imageData.height;
        const ctx = previewCanvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
    }

    function replaceCanvas() {
        const imageData = state.processedImageData || processImage();
        if (!imageData) return;

        const canvas = document.getElementById('pixel-canvas');
        if (!canvas) return;

        // 清空所有图层并设置第一层为处理结果
        const w = canvas.width;
        const h = canvas.height;
        const newLayerData = Array(h).fill(null).map(() => Array(w).fill(null));

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const r = imageData.data[i];
                const g = imageData.data[i + 1];
                const b = imageData.data[i + 2];
                const a = imageData.data[i + 3];
                if (a > 128) {
                    newLayerData[y][x] = 'rgb(' + r + ', ' + g + ', ' + b + ')';
                }
            }
        }

        // 尝试通过页面暴露的 state 变量操作图层
        try {
            const winState = window.state || (window.pixelDrawState);
            if (winState && winState.layers) {
                // 保存状态
                if (typeof window.saveState === 'function') {
                    window.saveState();
                }
                winState.layers = [{
                    id: 1,
                    name: '处理后图层',
                    visible: true,
                    isMask: false,
                    data: newLayerData
                }];
                winState.activeLayerIndex = 0;
                winState.nextLayerId = 2;
                if (typeof window.renderCanvas === 'function') window.renderCanvas();
                if (typeof window.renderLayerList === 'function') window.renderLayerList();
                showToast('已替换画布内容');
            } else {
                showToast('无法访问图层系统，请直接导出 PNG');
            }
        } catch (e) {
            showToast('替换失败: ' + e.message);
        }
    }

    function exportPNG() {
        const imageData = state.processedImageData || processImage();
        if (!imageData) return;

        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);

        const link = document.createElement('a');
        link.download = 'pixelmaster_' + Date.now() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('已导出 PNG');
    }

    function showToast(msg) {
        let toast = document.getElementById('pm-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pm-toast';
            toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:6px;font-size:13px;z-index:99999;pointer-events:none;transition:opacity 0.3s;opacity:0;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1500);
    }

    // ==================== 悬浮窗 UI ====================
    function createPanel() {
        const existing = document.getElementById('pm-panel');
        if (existing) return;

        const panel = document.createElement('div');
        panel.id = 'pm-panel';
        panel.style.cssText = `
            position:fixed;top:70px;right:10px;z-index:99998;
            background:#fff;border:1px solid #dee2e6;border-radius:8px;
            box-shadow:0 4px 16px rgba(0,0,0,0.15);
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            font-size:12px;color:#333;
            width:280px;max-height:calc(100vh - 140px);
            display:flex;flex-direction:column;
            transition:width 0.2s ease,opacity 0.2s ease;
            user-select:none;
        `;

        panel.innerHTML = `
            <div id="pm-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#f8f9fa;border-radius:8px 8px 0 0;border-bottom:1px solid #dee2e6;cursor:grab;">
                <span id="pm-toggle" style="font-size:14px;line-height:1;color:#6c757d;cursor:pointer;padding:0 6px 0 0;flex-shrink:0;">−</span>
                <span style="font-weight:600;font-size:13px;flex:1;">PixelMaster</span>
            </div>
            <div id="pm-body" style="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;">
                <div style="font-size:11px;color:#6c757d;margin-bottom:2px;">调色板</div>
                <div style="display:flex;gap:4px;margin-bottom:2px;">
                    <button id="pm-select-all" style="flex:1;padding:3px 6px;font-size:11px;border:1px solid #dee2e6;border-radius:4px;background:#f8f9fa;cursor:pointer;">全选</button>
                    <button id="pm-select-none" style="flex:1;padding:3px 6px;font-size:11px;border:1px solid #dee2e6;border-radius:4px;background:#f8f9fa;cursor:pointer;">取消</button>
                </div>
                <div id="pm-palette-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:3px;max-height:150px;overflow-y:auto;padding:2px;"></div>
                <div style="font-size:11px;color:#6c757d;">算法</div>
                <select id="pm-algorithm" style="width:100%;padding:5px 8px;border:1px solid #dee2e6;border-radius:4px;font-size:12px;background:#fff;"></select>
                <div style="font-size:11px;color:#6c757d;">抖动强度 <span id="pm-strength-val" style="float:right;">80</span></div>
                <input type="range" id="pm-strength" min="0" max="100" value="80" style="width:100%;margin:0;">
                <div style="font-size:11px;color:#6c757d;">色温 <span id="pm-temp-val" style="float:right;">0</span></div>
                <input type="range" id="pm-temperature" min="-100" max="100" value="0" style="width:100%;margin:0;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <input type="checkbox" id="pm-force-opaque" checked style="margin:0;">
                    <label for="pm-force-opaque" style="font-size:11px;">强制不透明</label>
                    <input type="checkbox" id="pm-lock-palette" style="margin:0;margin-left:8px;">
                    <label for="pm-lock-palette" style="font-size:11px;">锁定调色板</label>
                </div>
                <div style="font-size:11px;color:#6c757d;">颜色替换</div>
                <div id="pm-replacements" style="display:flex;flex-direction:column;gap:3px;max-height:80px;overflow-y:auto;"></div>
                <button id="pm-add-replacement" style="padding:4px 8px;font-size:11px;border:1px dashed #0d6efd;border-radius:4px;background:#fff;color:#0d6efd;cursor:pointer;">+ 添加替换</button>
                <div style="font-size:11px;color:#6c757d;">预览</div>
                <div id="pm-preview-wrap" style="border:1px solid #dee2e6;border-radius:4px;overflow:hidden;background:#fff url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><rect width=%2210%22 height=%2210%22 fill=%22%23ccc%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23ccc%22/></svg>') repeat;display:flex;align-items:center;justify-content:center;min-height:80px;">
                    <canvas id="pm-preview-canvas" style="max-width:100%;max-height:200px;image-rendering:pixelated;"></canvas>
                </div>
                <div style="display:flex;gap:4px;">
                    <button id="pm-preview-btn" style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #0d6efd;border-radius:4px;background:#0d6efd;color:#fff;cursor:pointer;font-weight:500;">预览</button>
                    <button id="pm-replace-btn" style="flex:1;padding:6px 10px;font-size:12px;border:1px solid #198754;border-radius:4px;background:#198754;color:#fff;cursor:pointer;font-weight:500;">替换画布</button>
                    <button id="pm-export-btn" style="padding:6px 10px;font-size:12px;border:1px solid #6c757d;border-radius:4px;background:#6c757d;color:#fff;cursor:pointer;font-weight:500;">导出</button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        bindEvents();
        updatePaletteGrid();
        updateAlgorithmSelect();
    }

    function bindEvents() {
        document.getElementById('pm-toggle').addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
        document.getElementById('pm-header').addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
        document.getElementById('pm-header').addEventListener('touchstart', (e) => { startDrag(e.touches[0]); });
        document.addEventListener('touchmove', (e) => { if (state.isDragging) { onDrag(e.touches[0]); e.preventDefault(); } }, { passive: false });
        document.addEventListener('touchend', stopDrag);
        document.getElementById('pm-select-all').addEventListener('click', selectAllColors);
        document.getElementById('pm-select-none').addEventListener('click', selectNoColors);
        document.getElementById('pm-algorithm').addEventListener('change', (e) => {
            state.algorithm = e.target.value;
        });
        document.getElementById('pm-strength').addEventListener('input', (e) => {
            state.strength = parseInt(e.target.value);
            document.getElementById('pm-strength-val').textContent = state.strength;
        });
        document.getElementById('pm-temperature').addEventListener('input', (e) => {
            state.temperature = parseInt(e.target.value);
            document.getElementById('pm-temp-val').textContent = state.temperature;
        });
        document.getElementById('pm-force-opaque').addEventListener('change', (e) => {
            state.forceOpaque = e.target.checked;
        });
        document.getElementById('pm-lock-palette').addEventListener('change', (e) => {
            state.isLocked = e.target.checked;
        });
        document.getElementById('pm-preview-btn').addEventListener('click', (e) => { e.stopPropagation(); updatePreview(); });
        document.getElementById('pm-replace-btn').addEventListener('click', (e) => { e.stopPropagation(); replaceCanvas(); });
        document.getElementById('pm-export-btn').addEventListener('click', (e) => { e.stopPropagation(); exportPNG(); });
        document.getElementById('pm-add-replacement').addEventListener('click', (e) => { e.stopPropagation(); addReplacement(); });
    }

    function togglePanel() {
        const body = document.getElementById('pm-body');
        const toggle = document.getElementById('pm-toggle');
        if (!body || !toggle) return;
        state.collapsed = !state.collapsed;
        if (state.collapsed) {
            body.style.display = 'none';
            toggle.textContent = '+';
        } else {
            body.style.display = '';
            toggle.textContent = '−';
        }
    }

    function startDrag(e) {
        if (e.target.closest('#pm-toggle')) return;
        e.preventDefault();
        const panel = document.getElementById('pm-panel');
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        state.isDragging = true;
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;
        state.panelLeft = rect.left;
        state.panelTop = rect.top;
        panel.style.right = 'auto';
        panel.style.left = state.panelLeft + 'px';
        panel.style.top = state.panelTop + 'px';
        panel.style.cursor = 'grabbing';
        panel.style.transition = 'none';
    }

    function onDrag(e) {
        if (!state.isDragging) return;
        const panel = document.getElementById('pm-panel');
        if (!panel) return;
        const dx = e.clientX - state.dragStartX;
        const dy = e.clientY - state.dragStartY;
        panel.style.left = (state.panelLeft + dx) + 'px';
        panel.style.top = (state.panelTop + dy) + 'px';
    }

    function stopDrag() {
        if (!state.isDragging) return;
        state.isDragging = false;
        const panel = document.getElementById('pm-panel');
        if (panel) {
            panel.style.cursor = '';
            panel.style.transition = '';
        }
    }

    function updatePaletteGrid() {
        const grid = document.getElementById('pm-palette-grid');
        if (!grid || typeof COLOR_INFO === 'undefined') return;

        grid.innerHTML = '';
        for (const [rgbStr, info] of Object.entries(COLOR_INFO)) {
            const color = parseColorString(rgbStr);
            if (!color) continue;

            const swatch = document.createElement('div');
            swatch.style.cssText = `
                width:100%;aspect-ratio:1;border-radius:3px;cursor:pointer;
                border:2px solid transparent;box-sizing:border-box;
                background:${rgbStr};transition:border-color 0.1s;
            `;
            swatch.title = info.name;
            swatch.dataset.color = rgbStr;

            if (state.selectedColors.has(rgbStr)) {
                swatch.style.borderColor = '#0d6efd';
                swatch.style.boxShadow = '0 0 0 1px #fff, 0 0 0 3px #0d6efd';
            } else {
                swatch.style.opacity = '0.35';
            }

            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleColor(rgbStr);
            });

            grid.appendChild(swatch);
        }
    }

    function updateAlgorithmSelect() {
        const select = document.getElementById('pm-algorithm');
        if (!select) return;
        select.innerHTML = '';
        for (const name of ALGORITHM_NAMES) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            opt.selected = (name === state.algorithm);
            select.appendChild(opt);
        }
    }

    function toggleColor(rgbStr) {
        if (state.selectedColors.has(rgbStr)) {
            state.selectedColors.delete(rgbStr);
        } else {
            state.selectedColors.add(rgbStr);
        }
        updatePaletteGrid();
    }

    function selectAllColors() {
        if (typeof COLOR_INFO !== 'undefined') {
            for (const rgbStr of Object.keys(COLOR_INFO)) {
                state.selectedColors.add(rgbStr);
            }
        }
        updatePaletteGrid();
    }

    function selectNoColors() {
        state.selectedColors.clear();
        updatePaletteGrid();
    }

    // ==================== 颜色替换 UI ====================
    function addReplacement() {
        const container = document.getElementById('pm-replacements');
        if (!container) return;

        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;';

        const sourceSelect = document.createElement('select');
        sourceSelect.style.cssText = 'flex:1;padding:2px 4px;border:1px solid #dee2e6;border-radius:3px;font-size:11px;';

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.cssText = 'color:#6c757d;';

        const targetSelect = document.createElement('select');
        targetSelect.style.cssText = 'flex:1;padding:2px 4px;border:1px solid #dee2e6;border-radius:3px;font-size:11px;';

        const delBtn = document.createElement('button');
        delBtn.textContent = '×';
        delBtn.style.cssText = 'padding:1px 4px;border:none;background:none;color:#dc3545;cursor:pointer;font-size:14px;';

        if (typeof COLOR_INFO !== 'undefined') {
            const sortedColors = Object.entries(COLOR_INFO).sort((a, b) => a[1].name.localeCompare(b[1].name));
            for (const [rgbStr, info] of sortedColors) {
                const opt1 = document.createElement('option');
                opt1.value = rgbStr;
                opt1.textContent = info.name;
                sourceSelect.appendChild(opt1);
                const opt2 = document.createElement('option');
                opt2.value = rgbStr;
                opt2.textContent = info.name;
                targetSelect.appendChild(opt2);
            }
        }

        sourceSelect.addEventListener('change', updateReplacements);
        targetSelect.addEventListener('change', updateReplacements);
        delBtn.addEventListener('click', () => {
            item.remove();
            updateReplacements();
        });

        item.appendChild(sourceSelect);
        item.appendChild(arrow);
        item.appendChild(targetSelect);
        item.appendChild(delBtn);
        container.appendChild(item);
        updateReplacements();
    }

    function updateReplacements() {
        state.colorReplacements.clear();
        const container = document.getElementById('pm-replacements');
        if (!container) return;

        const items = container.querySelectorAll('div');
        items.forEach(item => {
            const selects = item.querySelectorAll('select');
            if (selects.length >= 2) {
                const sourceRgb = selects[0].value;
                const targetRgb = selects[1].value;
                if (sourceRgb && targetRgb) {
                    const sourceColor = parseColorString(sourceRgb);
                    const targetColor = parseColorString(targetRgb);
                    if (sourceColor && targetColor) {
                        state.colorReplacements.set(JSON.stringify(sourceColor), targetColor);
                    }
                }
            }
        });
    }

    // ==================== 入口 ====================
    function init() {
        if (document.getElementById('pm-panel')) return;

        // 等待 COLOR_INFO 和画布就绪
        const tryInit = () => {
            const canvas = document.getElementById('pixel-canvas');
            if (canvas && typeof COLOR_INFO !== 'undefined') {
                initPalette();
                createPanel();
                state.active = true;
                console.log('[PixelMaster] 已就绪，悬浮窗位于页面右侧');
            } else {
                setTimeout(tryInit, 200);
            }
        };

        // 等待页面加载
        if (document.readyState === 'complete') {
            tryInit();
        } else {
            window.addEventListener('load', tryInit);
        }
    }

    init();
})();