// 主应用逻辑
document.addEventListener('DOMContentLoaded', () => {
    // 初始化算法配置
    const ALGORITHMS = ALGORITHM_CONFIG.initialize();

    // 使用配置文件中的多语言配置
    const TRANSLATIONS = LANGUAGE_CONFIG.translations;
    let currentLanguage = LANGUAGE_CONFIG.defaultLanguage;

    // --- State ---
    let state = {
        originalPalette: [],
        activePalette: [],
        quantizedPalette: [],
        inputImage: null,
        processedInputImage: null, // 存储经过亮度/对比度/饱和度处理后的图片
        originalWidth: 0,
        originalHeight: 0,
        aspectRatio: 1,
        activeAlgorithm: ALGORITHM_CONFIG.defaultAlgorithm,
        ditherStrength: 1.0,
        ditherScale: 1,
        imageSize: 1.0,
        zoom: 1.0,
        panX: 0,
        panY: 0,
        isPanning: false,
        lastPanX: 0,
        lastPanY: 0,
        processedImageData: null,
        isLocked: false,
        freeColors: [],
        paidColors: [],
        selectedFreeColors: new Set(),
        selectedPaidColors: new Set(),
        // 颜色选择和替换相关状态
        colorPickerMode: false,
        selectedSourceColor: null,
        selectedReplacementColor: null,
        colorReplacements: new Map(), // 存储颜色替换映射
        activeReplacementTab: 'free',
        // 图片处理参数（实验性功能）
        brightness: 100,
        contrast: 100,
        saturation: 100,
        sharpness: 0,
        hue: 0,
        temperature: 0,
        // 实时调整开关
        realtimeEnabled: true,
        // 参与人数
        participantCount: 1,
        // 强制去除半透明像素（默认开启）
        forceOpaqueEnabled: true
    };

    // --- DOM Elements ---
    const freePaletteGrid = document.getElementById('free-palette-grid');
    const paidPaletteGrid = document.getElementById('paid-palette-grid');
    const freeSelectAllBtn = document.getElementById('free-select-all');
    const paidSelectAllBtn = document.getElementById('paid-select-all');
    const inputFile = document.getElementById('input-file');
    const inputWrapper = document.getElementById('input-wrapper');
    const strengthSlider = document.getElementById('dither-strength');
    const ditherScaleSelect = document.getElementById('dither-scale');
    const sizeSlider = document.getElementById('image-size');
    const strengthValue = document.getElementById('dither-strength-value');
    const ditherScaleValue = document.getElementById('dither-scale-value');
    const sizeValue = document.getElementById('image-size-value');
    const imageWidthInput = document.getElementById('image-width');
    const imageHeightInput = document.getElementById('image-height');
    const pixelCountInput = document.getElementById('pixel-count');
    const ditherSelector = document.getElementById('dither-selector');
    const previewCanvas = document.getElementById('preview-canvas');
    const previewCtx = previewCanvas.getContext('2d');
    const viewport = document.getElementById('preview-canvas-viewport');
    const placeholderText = document.getElementById('placeholder-text');
    const downloadBtn = document.getElementById('download-btn');
    const previewControls = document.querySelector('.preview-controls');
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValue = document.getElementById('zoom-value');

    // 图片处理相关DOM元素（实验性功能）
    const brightnessSlider = document.getElementById('brightness');
    const contrastSlider = document.getElementById('contrast');
    const saturationSlider = document.getElementById('saturation');
    const sharpnessSlider = document.getElementById('sharpness');
    const hueSlider = document.getElementById('hue');
    const brightnessValue = document.getElementById('brightness-value');
    const contrastValue = document.getElementById('contrast-value');
    const saturationValue = document.getElementById('saturation-value');
    const sharpnessValue = document.getElementById('sharpness-value');
    const hueValue = document.getElementById('hue-value');
    const temperatureSlider = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperature-value');
    const resetImageAdjustmentsBtn = document.getElementById('reset-image-adjustments');

    // 颜色选择和替换相关DOM元素
    const colorPickerModeCheckbox = document.getElementById('color-picker-mode');
    const selectedColorDisplay = document.getElementById('selected-color-display');
    const selectedColorPreview = document.getElementById('selected-color-preview');
    const selectedColorName = document.getElementById('selected-color-name');
    const replacementColorSection = document.getElementById('replacement-color-section');
    const replacementFreeGrid = document.getElementById('replacement-free-grid');
    const replacementPaidGrid = document.getElementById('replacement-paid-grid');
    const applyReplacementBtn = document.getElementById('apply-replacement-btn');
    const clearReplacementBtn = document.getElementById('clear-replacement-btn');
    const resetAllReplacementsBtn = document.getElementById('reset-all-replacements-btn');
    const replacementItems = document.getElementById('replacement-items');

    // 实时调整开关相关DOM元素
    const realtimeToggle = document.getElementById('realtime-toggle');
    const manualGenerateBtn = document.getElementById('manual-generate-btn');

    // 预计完成时间相关DOM元素
    const participantCountInput = document.getElementById('participant-count');
    const estimatedTimeDisplay = document.getElementById('estimated-time');

    // 强制去除半透明像素相关DOM元素
    const forceOpaqueToggle = document.getElementById('force-opaque-toggle');

    // 像素悬浮提示框相关变量
    let pixelTooltip = null;
    let tooltipThrottleTimer = null;
    const TOOLTIP_THROTTLE_DELAY = 16; // 约60fps

    // ==================== Web Worker 抖动加速 ====================

    const WORKER_CODE = `
function findClosestColor(color, palette) {
    let minDistance = Infinity;
    let closestColor = palette[0];
    for (const pColor of palette) {
        const distance = (color[0] - pColor[0])**2 + (color[1] - pColor[1])**2 + (color[2] - pColor[2])**2;
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = pColor;
        }
    }
    return closestColor;
}

function applyErrorDither(imageData, palette, strength, kernel, isLocked, ditherScale, fullPalette, selectedColorSet) {
    const originalWidth = imageData.width;
    const originalHeight = imageData.height;

    const downsampledWidth = Math.max(1, Math.floor(originalWidth / ditherScale));
    const downsampledHeight = Math.max(1, Math.floor(originalHeight / ditherScale));

    const downsampledData = new Float32Array(downsampledWidth * downsampledHeight * 4);

    for (let y = 0; y < downsampledHeight; y++) {
        for (let x = 0; x < downsampledWidth; x++) {
            let r = 0, g = 0, b = 0, a = 0, count = 0;

            for (let dy = 0; dy < ditherScale; dy++) {
                for (let dx = 0; dx < ditherScale; dx++) {
                    const srcX = x * ditherScale + dx;
                    const srcY = y * ditherScale + dy;

                    if (srcX < originalWidth && srcY < originalHeight) {
                        const srcIndex = (srcY * originalWidth + srcX) * 4;
                        r += imageData.data[srcIndex];
                        g += imageData.data[srcIndex + 1];
                        b += imageData.data[srcIndex + 2];
                        a += imageData.data[srcIndex + 3];
                        count++;
                    }
                }
            }

            if (count > 0) {
                const downsampledIndex = (y * downsampledWidth + x) * 4;
                downsampledData[downsampledIndex] = r / count;
                downsampledData[downsampledIndex + 1] = g / count;
                downsampledData[downsampledIndex + 2] = b / count;
                downsampledData[downsampledIndex + 3] = a / count;
            }
        }
    }

    for (let y = 0; y < downsampledHeight; y++) {
        for (let x = 0; x < downsampledWidth; x++) {
            const i = (y * downsampledWidth + x) * 4;
            const oldColor = [downsampledData[i], downsampledData[i+1], downsampledData[i+2]];
            const originalAlpha = downsampledData[i+3];

            if (originalAlpha < 128) {
                downsampledData[i] = 0;
                downsampledData[i+1] = 0;
                downsampledData[i+2] = 0;
                downsampledData[i+3] = 0;
                continue;
            }

            if (isLocked && fullPalette && fullPalette.length > 0) {
                var selectedColorsArray = Array.from(selectedColorSet).map(function(colorStr) { return JSON.parse(colorStr); });
                if (selectedColorsArray.length > 0) {
                    var originalQuantizedColor = findClosestColor(oldColor, fullPalette);

                    if (!selectedColorSet.has(JSON.stringify(originalQuantizedColor))) {
                        downsampledData[i] = 0;
                        downsampledData[i+1] = 0;
                        downsampledData[i+2] = 0;
                        downsampledData[i+3] = 0;
                        continue;
                    }
                } else {
                    downsampledData[i] = 0;
                    downsampledData[i+1] = 0;
                    downsampledData[i+2] = 0;
                    downsampledData[i+3] = 0;
                    continue;
                }
            }

            var newColor = findClosestColor(oldColor, palette);
            downsampledData[i] = newColor[0];
            downsampledData[i+1] = newColor[1];
            downsampledData[i+2] = newColor[2];
            downsampledData[i+3] = originalAlpha;

            if (strength > 0 && kernel) {
                var error = [
                    (oldColor[0] - newColor[0]) * strength,
                    (oldColor[1] - newColor[1]) * strength,
                    (oldColor[2] - newColor[2]) * strength,
                ];

                for (var ei = 0; ei < kernel.length; ei++) {
                    var entry = kernel[ei];
                    var pos = entry[0];
                    var factor = entry[1];
                    var nx = x + pos[0];
                    var ny = y + pos[1];
                    if (nx >= 0 && nx < downsampledWidth && ny >= 0 && ny < downsampledHeight) {
                        var ni = (ny * downsampledWidth + nx) * 4;
                        downsampledData[ni]   += error[0] * factor;
                        downsampledData[ni+1] += error[1] * factor;
                        downsampledData[ni+2] += error[2] * factor;
                    }
                }
            }
        }
    }

    var outputData = new Uint8ClampedArray(originalWidth * originalHeight * 4);

    for (var y = 0; y < originalHeight; y++) {
        for (var x = 0; x < originalWidth; x++) {
            var downsampledX = Math.floor(x / ditherScale);
            var downsampledY = Math.floor(y / ditherScale);

            if (downsampledX < downsampledWidth && downsampledY < downsampledHeight) {
                var downsampledIndex = (downsampledY * downsampledWidth + downsampledX) * 4;
                var outputIndex = (y * originalWidth + x) * 4;

                outputData[outputIndex] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex])));
                outputData[outputIndex + 1] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 1])));
                outputData[outputIndex + 2] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 2])));
                outputData[outputIndex + 3] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 3])));
            }
        }
    }

    return new ImageData(outputData, originalWidth, originalHeight);
}

function applyOrderedDither(imageData, palette, strength, bayerMatrix, isLocked, ditherScale, fullPalette, selectedColorSet) {
    var originalWidth = imageData.width;
    var originalHeight = imageData.height;

    var downsampledWidth = Math.max(1, Math.floor(originalWidth / ditherScale));
    var downsampledHeight = Math.max(1, Math.floor(originalHeight / ditherScale));

    var downsampledData = new Float32Array(downsampledWidth * downsampledHeight * 4);

    for (var y = 0; y < downsampledHeight; y++) {
        for (var x = 0; x < downsampledWidth; x++) {
            var r = 0, g = 0, b = 0, a = 0, count = 0;

            for (var dy = 0; dy < ditherScale; dy++) {
                for (var dx = 0; dx < ditherScale; dx++) {
                    var srcX = x * ditherScale + dx;
                    var srcY = y * ditherScale + dy;

                    if (srcX < originalWidth && srcY < originalHeight) {
                        var srcIndex = (srcY * originalWidth + srcX) * 4;
                        r += imageData.data[srcIndex];
                        g += imageData.data[srcIndex + 1];
                        b += imageData.data[srcIndex + 2];
                        a += imageData.data[srcIndex + 3];
                        count++;
                    }
                }
            }

            if (count > 0) {
                var downsampledIndex = (y * downsampledWidth + x) * 4;
                downsampledData[downsampledIndex] = r / count;
                downsampledData[downsampledIndex + 1] = g / count;
                downsampledData[downsampledIndex + 2] = b / count;
                downsampledData[downsampledIndex + 3] = a / count;
            }
        }
    }

    var n = bayerMatrix.length;
    var bayerFactor = 255 / (n * n);

    for (var y = 0; y < downsampledHeight; y++) {
        for (var x = 0; x < downsampledWidth; x++) {
            var i = (y * downsampledWidth + x) * 4;
            var oldColor = [downsampledData[i], downsampledData[i+1], downsampledData[i+2]];
            var originalAlpha = downsampledData[i+3];

            if (originalAlpha < 128) {
                downsampledData[i] = 0;
                downsampledData[i+1] = 0;
                downsampledData[i+2] = 0;
                downsampledData[i+3] = 0;
                continue;
            }

            if (isLocked && fullPalette && fullPalette.length > 0) {
                var selectedColorsArray = Array.from(selectedColorSet).map(function(colorStr) { return JSON.parse(colorStr); });
                if (selectedColorsArray.length > 0) {
                    var originalQuantizedColor = findClosestColor(oldColor, fullPalette);

                    if (!selectedColorSet.has(JSON.stringify(originalQuantizedColor))) {
                        downsampledData[i] = 0;
                        downsampledData[i+1] = 0;
                        downsampledData[i+2] = 0;
                        downsampledData[i+3] = 0;
                        continue;
                    }
                } else {
                    downsampledData[i] = 0;
                    downsampledData[i+1] = 0;
                    downsampledData[i+2] = 0;
                    downsampledData[i+3] = 0;
                    continue;
                }
            }

            var threshold = (bayerMatrix[y % n][x % n] - n*n/2) * bayerFactor * strength * 0.2;
            var r2 = downsampledData[i] + threshold;
            var g2 = downsampledData[i+1] + threshold;
            var b2 = downsampledData[i+2] + threshold;
            var closest = findClosestColor([r2, g2, b2], palette);
            downsampledData[i] = closest[0];
            downsampledData[i+1] = closest[1];
            downsampledData[i+2] = closest[2];
            downsampledData[i+3] = originalAlpha;
        }
    }

    var outputData = new Uint8ClampedArray(originalWidth * originalHeight * 4);

    for (var y = 0; y < originalHeight; y++) {
        for (var x = 0; x < originalWidth; x++) {
            var downsampledX = Math.floor(x / ditherScale);
            var downsampledY = Math.floor(y / ditherScale);

            if (downsampledX < downsampledWidth && downsampledY < downsampledHeight) {
                var downsampledIndex = (downsampledY * downsampledWidth + downsampledX) * 4;
                var outputIndex = (y * originalWidth + x) * 4;

                outputData[outputIndex] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex])));
                outputData[outputIndex + 1] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 1])));
                outputData[outputIndex + 2] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 2])));
                outputData[outputIndex + 3] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 3])));
            }
        }
    }

    return new ImageData(outputData, originalWidth, originalHeight);
}

self.onmessage = function(e) {
    var msg = e.data;
    if (msg.type === 'process') {
        try {
            var selectedColorSet = new Set(msg.selectedColors || []);
            var result;
            if (msg.algorithmType === 'error') {
                result = applyErrorDither(
                    msg.imageData, msg.palette, msg.ditherStrength, msg.kernel,
                    msg.isLocked, msg.ditherScale, msg.fullPalette, selectedColorSet
                );
            } else if (msg.algorithmType === 'ordered') {
                result = applyOrderedDither(
                    msg.imageData, msg.palette, msg.ditherStrength, msg.bayerMatrix,
                    msg.isLocked, msg.ditherScale, msg.fullPalette, selectedColorSet
                );
            }
            self.postMessage({ type: 'result', imageData: result, seed: msg.seed }, [result.data.buffer]);
        } catch (err) {
            self.postMessage({ type: 'error', message: err.message, seed: msg.seed });
        }
    }
};
`;

    let ditherWorker = null;
    let ditherGeneration = 0;

    function _initWorker() {
        if (typeof Worker === 'undefined') return false;
        try {
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            ditherWorker = new Worker(url);
            URL.revokeObjectURL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    function _ditherInWorker(imageData, palette, ditherStrength, algo, kernel, bayerMatrix) {
        return new Promise((resolve, reject) => {
            const gen = ++ditherGeneration;
            const selectedColors = [];
            state.selectedFreeColors.forEach(colorStr => selectedColors.push(colorStr));
            state.selectedPaidColors.forEach(colorStr => selectedColors.push(colorStr));

            function onMessage(e) {
                if (e.data.seed !== gen) return;
                ditherWorker.removeEventListener('message', onMessage);
                if (e.data.type === 'error') {
                    reject(new Error(e.data.message));
                } else {
                    resolve(e.data.imageData);
                }
            }

            function onError(e) {
                ditherWorker.removeEventListener('message', onMessage);
                reject(new Error(e.message || 'Worker error'));
            }

            ditherWorker.addEventListener('message', onMessage);
            ditherWorker.addEventListener('error', onError);

            ditherWorker.postMessage({
                type: 'process', seed: gen,
                imageData: imageData,
                palette: palette,
                ditherStrength: ditherStrength,
                algorithmType: algo.type,
                kernel: kernel,
                bayerMatrix: bayerMatrix,
                ditherScale: state.ditherScale,
                isLocked: state.isLocked,
                fullPalette: state.quantizedPalette,
                selectedColors: selectedColors
            }, [imageData.data.buffer]);
        });
    }

    // ==================== Cookie 工具函数 ====================
    
    /**
     * 设置Cookie
     * @param {string} name - Cookie名称
     * @param {string} value - Cookie值
     * @param {number} days - 过期天数
     */
    function setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    }

    /**
     * 获取Cookie
     * @param {string} name - Cookie名称
     * @returns {string|null} Cookie值，不存在则返回null
     */
    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // --- Initialization ---
    function init() {
        // 读取保存的语言设置
        const savedLanguage = getCookie('preferred-language');
        if (savedLanguage && LANGUAGE_CONFIG.supportedLanguages.some(lang => lang.code === savedLanguage)) {
            currentLanguage = savedLanguage;
        }

        // 初始化语言选择器
        const languageSelect = document.getElementById('language-select');
        languageSelect.value = currentLanguage;
        languageSelect.addEventListener('change', (e) => {
            updateLanguage(e.target.value);
            // 保存语言选择到cookie
            setCookie('preferred-language', e.target.value, 365);
        });

        // 初始化默认语言
        updateLanguage(currentLanguage);

        // 初始化算法按钮
        Object.keys(ALGORITHMS).forEach(name => {
            const button = document.createElement('button');
            button.textContent = name;
            button.dataset.name = name;
            if (name === ALGORITHM_CONFIG.defaultAlgorithm) {
                button.classList.add('active');
                state.activeAlgorithm = name;
            }
            ditherSelector.appendChild(button);
        });

        loadPalettes();

        // Event Listeners
        freeSelectAllBtn.addEventListener('click', () => toggleSelectAll('free'));
        paidSelectAllBtn.addEventListener('click', () => toggleSelectAll('paid'));
        freePaletteGrid.addEventListener('click', handleSwatchClick);
        paidPaletteGrid.addEventListener('click', handleSwatchClick);
        inputFile.addEventListener('change', handleImageUpload);
        
        // 抖动强度 - 滑块和数字框双向绑定
        strengthSlider.addEventListener('input', handleStrengthChange);
        const ditherStrengthInput = document.getElementById('dither-strength-value');
        if (ditherStrengthInput) {
            ditherStrengthInput.addEventListener('change', handleDitherStrengthInputChange);
            ditherStrengthInput.addEventListener('input', handleDitherStrengthInputChange);
        }
        
        ditherScaleSelect.addEventListener('change', handleDitherScaleChange);
        
        // 图片尺寸 - 滑块和数字框双向绑定
        sizeSlider.addEventListener('input', handleSizeSliderChange);
        const imageSizeInput = document.getElementById('image-size-value');
        if (imageSizeInput) {
            imageSizeInput.addEventListener('change', handleImageSizeInputChange);
            imageSizeInput.addEventListener('input', handleImageSizeInputChange);
        }
        
        imageWidthInput.addEventListener('change', handleWidthInputChange);
        imageHeightInput.addEventListener('change', handleHeightInputChange);
        pixelCountInput.addEventListener('change', handlePixelCountChange);
        ditherSelector.addEventListener('click', handleAlgorithmChange);
        downloadBtn.addEventListener('click', handleDownload);
        zoomSlider.addEventListener('input', handleZoomSlider);
        viewport.addEventListener('wheel', handleWheelZoom);
        viewport.addEventListener('mousedown', handlePanStart);
        viewport.addEventListener('mousemove', handlePanMove);
        viewport.addEventListener('mouseup', handlePanEnd);
        viewport.addEventListener('mouseleave', handlePanEnd);
        document.getElementById('export-selection-btn').addEventListener('click', handleExportColors);
        document.getElementById('lock-colors-checkbox').addEventListener('change', (e) => {
            state.isLocked = e.target.checked;
            smartUpdatePreview();
        });

        // 实时调整开关事件监听器
        realtimeToggle.addEventListener('change', handleRealtimeToggleChange);
        manualGenerateBtn.addEventListener('click', handleManualGenerate);

        // 参与人数变化事件监听器
        participantCountInput.addEventListener('change', handleParticipantCountChange);
        participantCountInput.addEventListener('input', handleParticipantCountChange);

        // 强制去除半透明像素开关事件监听器
        forceOpaqueToggle.addEventListener('change', handleForceOpaqueToggleChange);

        // 颜色选择和替换功能事件监听器
        colorPickerModeCheckbox.addEventListener('change', handleColorPickerModeToggle);
        previewCanvas.addEventListener('click', handleCanvasClick);
        previewCanvas.addEventListener('mousemove', handleCanvasMouseMove);
        previewCanvas.addEventListener('mouseleave', hidePixelTooltip);
        
        // 移动端 canvas 触摸支持（颜色选择模式）
        previewCanvas.addEventListener('touchend', handleCanvasTouchEnd);
        
        document.querySelector('.replacement-palette-tabs').addEventListener('click', handleReplacementTabClick);
        replacementFreeGrid.addEventListener('click', handleReplacementColorClick);
        replacementPaidGrid.addEventListener('click', handleReplacementColorClick);
        applyReplacementBtn.addEventListener('click', handleApplyReplacement);
        clearReplacementBtn.addEventListener('click', handleClearReplacement);
        resetAllReplacementsBtn.addEventListener('click', handleResetAllReplacements);

        // 移动端触摸事件支持
        viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
        viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
        viewport.addEventListener('touchend', handleTouchEnd);
        viewport.addEventListener('touchcancel', handleTouchEnd);

        // 移动端可拖动分隔条
        initMobileResizer();

        // 图片处理功能事件监听器（实验性功能）- 滑块和数字框双向绑定
        if (brightnessSlider) {
            brightnessSlider.addEventListener('input', handleBrightnessChange);
            const brightnessInput = document.getElementById('brightness-value');
            if (brightnessInput) {
                brightnessInput.addEventListener('change', handleBrightnessInputChange);
                brightnessInput.addEventListener('input', handleBrightnessInputChange);
            }
        }
        if (contrastSlider) {
            contrastSlider.addEventListener('input', handleContrastChange);
            const contrastInput = document.getElementById('contrast-value');
            if (contrastInput) {
                contrastInput.addEventListener('change', handleContrastInputChange);
                contrastInput.addEventListener('input', handleContrastInputChange);
            }
        }
        if (saturationSlider) {
            saturationSlider.addEventListener('input', handleSaturationChange);
            const saturationInput = document.getElementById('saturation-value');
            if (saturationInput) {
                saturationInput.addEventListener('change', handleSaturationInputChange);
                saturationInput.addEventListener('input', handleSaturationInputChange);
            }
        }
        if (sharpnessSlider) {
            sharpnessSlider.addEventListener('input', handleSharpnessChange);
            const sharpnessInput = document.getElementById('sharpness-value');
            if (sharpnessInput) {
                sharpnessInput.addEventListener('change', handleSharpnessInputChange);
                sharpnessInput.addEventListener('input', handleSharpnessInputChange);
            }
        }
        if (hueSlider) {
            hueSlider.addEventListener('input', handleHueChange);
            const hueInput = document.getElementById('hue-value');
            if (hueInput) {
                hueInput.addEventListener('change', handleHueInputChange);
                hueInput.addEventListener('input', handleHueInputChange);
            }
        }
        if (temperatureSlider) {
            temperatureSlider.addEventListener('input', handleTemperatureChange);
            const temperatureInput = document.getElementById('temperature-value');
            if (temperatureInput) {
                temperatureInput.addEventListener('change', handleTemperatureInputChange);
                temperatureInput.addEventListener('input', handleTemperatureInputChange);
            }
        }
        if (resetImageAdjustmentsBtn) resetImageAdjustmentsBtn.addEventListener('click', resetImageAdjustments);

        // 初始化 Web Worker（如果支持）
        _initWorker();
    }

    // ==================== 多语言功能 ====================
    function updateLanguage(lang) {
        currentLanguage = lang;
        const t = TRANSLATIONS[lang];

        document.title = t.title;
        document.querySelector('h1').textContent = t.title;

        const h2Elements = document.querySelectorAll('h2');
        if (h2Elements[0]) h2Elements[0].textContent = t.selectPalette;
        if (h2Elements[1]) h2Elements[1].textContent = t.uploadImage;
        if (h2Elements[2]) h2Elements[2].textContent = t.adjustParams;
        if (h2Elements[3]) h2Elements[3].textContent = t.selectAlgorithm;
        // h2Elements[4] 是"图像颜色统计"，通过ID单独处理
        // h2Elements[5] 是"5. 颜色选择与替换"，在后面单独处理

        const colorStatsTitle = document.getElementById('color-stats-title');
        if (colorStatsTitle) colorStatsTitle.textContent = t.colorStats;

        const paletteTitles = document.querySelectorAll('.palette-title');
        if (paletteTitles[0]) paletteTitles[0].textContent = t.freePalette;
        if (paletteTitles[1]) paletteTitles[1].textContent = t.paidPalette;

        const inputText = document.getElementById('input-text');
        if (inputText) inputText.textContent = t.clickOrDrag;

        // 更新标签文本（不破坏input元素）
        const ditherStrengthLabel = document.getElementById('dither-strength-label');
        if (ditherStrengthLabel) ditherStrengthLabel.textContent = t.ditherStrength;

        const ditherScaleLabel = document.getElementById('dither-scale-label');
        if (ditherScaleLabel) ditherScaleLabel.textContent = t.ditherScale || 'Dither Scale';

        const imageSizeLabel = document.getElementById('image-size-label');
        if (imageSizeLabel) imageSizeLabel.textContent = t.imageSize;

        const brightnessLabel = document.getElementById('brightness-label');
        if (brightnessLabel) brightnessLabel.textContent = t.brightness || 'Brightness';

        const contrastLabel = document.getElementById('contrast-label');
        if (contrastLabel) contrastLabel.textContent = t.contrast || 'Contrast';

        const saturationLabel = document.getElementById('saturation-label');
        if (saturationLabel) saturationLabel.textContent = t.saturation || 'Saturation';

        const sharpnessLabel = document.getElementById('sharpness-label');
        if (sharpnessLabel) sharpnessLabel.textContent = t.sharpness || 'Sharpness';

        const hueLabel = document.getElementById('hue-label');
        if (hueLabel) hueLabel.textContent = t.hue || 'Hue';

        const temperatureLabel = document.getElementById('temperature-label');
        if (temperatureLabel) temperatureLabel.textContent = t.temperature || 'Color Temperature';

        const widthLabel = document.querySelector('label[for="image-width"]');
        if (widthLabel) widthLabel.textContent = t.width + ':';

        const heightLabel = document.querySelector('label[for="image-height"]');
        if (heightLabel) heightLabel.textContent = t.height + ':';

        const pixelCountLabel = document.querySelector('label[for="pixel-count"]');
        if (pixelCountLabel) pixelCountLabel.textContent = t.totalPixels + ':';

        const placeholder = document.getElementById('placeholder-text');
        if (placeholder) placeholder.textContent = t.uploadImageFirst;

        const zoomLabel = document.querySelector('label[for="zoom-slider"]');
        if (zoomLabel) zoomLabel.textContent = t.zoom + ':';

        if (downloadBtn) downloadBtn.textContent = t.downloadCurrent;

        const footerParagraphs = document.querySelectorAll('footer p');
        if (footerParagraphs.length >= 2) {
            footerParagraphs[0].innerHTML = `${t.footerSource} <a href="https://github.com/PRTSSourceCode/ColorDitherer" target="_blank">ColorDitherer</a>，${t.footerThanks}`;
            footerParagraphs[1].textContent = t.footerCustom;
        }

        const colorStatsContainer = document.getElementById('color-stats-container');
        if (colorStatsContainer && colorStatsContainer.querySelector('p')) {
            colorStatsContainer.innerHTML = `<p>${t.processImageFirst}</p>`;
        }

        // 更新图片处理相关文本（实验性功能）
        const imageProcessingTitle = document.getElementById('image-processing-title');
        if (imageProcessingTitle) imageProcessingTitle.textContent = t.imageProcessing || 'Image Processing (Experimental)';
        
        const imageProcessingDesc = document.getElementById('image-processing-desc');
        if (imageProcessingDesc) imageProcessingDesc.textContent = t.imageProcessingDesc || 'Adjust brightness, contrast and saturation of the image';
        
        const resetBtn = document.getElementById('reset-image-adjustments');
        if (resetBtn) resetBtn.textContent = t.resetAdjustments || 'Reset All Adjustments';

        // 更新实时调整开关文本
        const realtimeToggleLabel = document.querySelector('#realtime-toggle + span');
        if (realtimeToggleLabel) realtimeToggleLabel.textContent = t.realtimeToggle || 'Enable Real-time Adjustment';
        
        const manualGenerateBtnEl = document.getElementById('manual-generate-btn');
        if (manualGenerateBtnEl) manualGenerateBtnEl.textContent = t.manualGenerateBtn || 'Generate Image';

        // 更新强制去除半透明像素开关文本
        const forceOpaqueLabel = document.querySelector('#force-opaque-toggle + span');
        if (forceOpaqueLabel) forceOpaqueLabel.textContent = t.forceOpaqueToggle || 'Force Remove Semi-transparent Pixels';
        
        const forceOpaqueDesc = document.querySelector('#force-opaque-toggle').parentElement.nextElementSibling;
        if (forceOpaqueDesc) forceOpaqueDesc.textContent = t.forceOpaqueDesc || 'On: opacity <50% becomes transparent, >=50% becomes opaque';

        // 更新预计完成时间相关文本
        const participantCountLabel = document.querySelector('label[for="participant-count"]');
        if (participantCountLabel) participantCountLabel.textContent = (t.participantCount || 'Participants') + ':';

        // 更新颜色选择与替换相关文本
        const lockColorsLabel = document.getElementById('lock-colors-label');
        if (lockColorsLabel) lockColorsLabel.textContent = t.lockColors || 'Lock Colors';

        // 更新"5. 颜色选择与替换"标题（第6个h2，索引为5）
        const h2Fifth = document.querySelectorAll('h2')[5];
        if (h2Fifth) h2Fifth.textContent = t.colorSelection || '5. Color Selection and Replacement';

        const colorPickerLabel = document.getElementById('color-picker-label');
        if (colorPickerLabel) colorPickerLabel.textContent = t.enableColorPicker || 'Enable Color Picker Mode';

        const modeDescription = document.querySelector('.mode-description');
        if (modeDescription) modeDescription.textContent = t.clickImageToSelectColor || 'Click image to select color';

        const selectedColorSpan = document.querySelector('.selected-color-info > span:first-child');
        if (selectedColorSpan) selectedColorSpan.textContent = (t.selectedColor || 'Selected Color') + ':';

        // 更新"未选择"文本（如果当前没有选择颜色）
        if (selectedColorName && !state.selectedSourceColor) {
            selectedColorName.textContent = t.notSelected || 'Not Selected';
        }

        const replacementTitle = document.querySelector('.replacement-color-section h3');
        if (replacementTitle) replacementTitle.textContent = t.replacementColor || 'Replacement Color';

        const tabButtons = document.querySelectorAll('.tab-btn');
        if (tabButtons[0]) tabButtons[0].textContent = t.freeColors || 'Free Colors';
        if (tabButtons[1]) tabButtons[1].textContent = t.paidColors || 'Paid Colors';

        if (applyReplacementBtn) applyReplacementBtn.textContent = t.applyReplacement || 'Apply Replacement';
        if (clearReplacementBtn) clearReplacementBtn.textContent = t.clearSelection || 'Clear Selection';
        if (resetAllReplacementsBtn) resetAllReplacementsBtn.textContent = t.resetAllReplacements || 'Reset All Replacements';

        const replacementListTitle = document.querySelector('.replacement-list h3');
        if (replacementListTitle) replacementListTitle.textContent = t.currentReplacements || 'Current Replacements';

        // 更新按钮文本
        const exportSelectionLabel = document.getElementById('export-selection-label');
        if (exportSelectionLabel) exportSelectionLabel.textContent = t.exportSelection || 'Export Selection';

        const editInPainterLabel = document.getElementById('edit-in-painter-label');
        if (editInPainterLabel) editInPainterLabel.textContent = t.editInPainter || 'Edit in Painting Tool';

        const pixelPaintToolLabel = document.getElementById('pixel-paint-tool-label');
        if (pixelPaintToolLabel) pixelPaintToolLabel.textContent = t.pixelPaintTool || 'Pixel Paint Tool';

        updateSelectAllButtons();
    }

    function updateSelectAllButtons() {
        const t = TRANSLATIONS[currentLanguage];
        const freeAllSelected = state.selectedFreeColors.size === state.freeColors.length;
        const paidAllSelected = state.selectedPaidColors.size === state.paidColors.length;

        freeSelectAllBtn.textContent = freeAllSelected ? t.deselectAll : t.selectAll;
        paidSelectAllBtn.textContent = paidAllSelected ? t.deselectAll : t.selectAll;
    }

    // ==================== 调色板功能 ====================
    async function loadPalettes() {
        const freeImg = await loadImage(PALETTE_CONFIG.presets.free);
        const allImg = await loadImage(PALETTE_CONFIG.presets.all);

        state.freeColors = extractColorsFromImage(freeImg);
        const allColors = extractColorsFromImage(allImg);

        // Set quantizedPalette to all available colors
        state.quantizedPalette = [...allColors];

        // Separate paid colors (colors in all but not in free)
        const freeColorSet = new Set(state.freeColors.map(JSON.stringify));
        state.paidColors = allColors.filter(color => !freeColorSet.has(JSON.stringify(color)));

        // Initially select all free colors
        state.freeColors.forEach(color => {
            state.selectedFreeColors.add(JSON.stringify(color));
        });

        renderPaletteGrid('free');
        renderPaletteGrid('paid');
        updateActivePalette();
    }

    function extractColorsFromImage(img) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height).data;

        const colors = new Set();
        for (let i = 0; i < imageData.length; i += 4) {
            if (imageData[i + 3] > 128) {
                colors.add(JSON.stringify([imageData[i], imageData[i+1], imageData[i+2]]));
            }
        }

        const colorArray = Array.from(colors, JSON.parse);
        if (!colorArray.some(c => c[0]===0 && c[1]===0 && c[2]===0)) {
            colorArray.unshift([0, 0, 0]);
        }

        return colorArray;
    }

    function renderPaletteGrid(type) {
        const grid = type === 'free' ? freePaletteGrid : paidPaletteGrid;
        const colors = type === 'free' ? state.freeColors : state.paidColors;
        const selectedColors = type === 'free' ? state.selectedFreeColors : state.selectedPaidColors;

        grid.innerHTML = '';

        colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            const colorStr = JSON.stringify(color);
            swatch.dataset.color = colorStr;
            swatch.dataset.isPaid = type === 'paid';

            const colorKey = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            const colorInfo = COLOR_INFO[colorKey] || { name: 'Unknown', isPaid: type === 'paid' };
            let displayName = colorInfo.name;
            if (colorInfo.name === 'Salmon') {
                displayName = 'Salmon【三文鱼、肉意思】';
            }
            displayName += colorInfo.isPaid ? ' ★' : '';

            const tooltip = document.createElement('span');
            tooltip.className = 'tooltip-text';
            tooltip.textContent = displayName;
            swatch.appendChild(tooltip);

            if (!selectedColors.has(colorStr)) {
                swatch.classList.add('deselected');
            }

            grid.appendChild(swatch);
        });

        updateSelectAllButton(type);
    }

    function updateActivePalette() {
        const selectedColors = [];

        // Add selected free colors
        state.freeColors.forEach(color => {
            if (state.selectedFreeColors.has(JSON.stringify(color))) {
                selectedColors.push(color);
            }
        });

        // Add selected paid colors
        state.paidColors.forEach(color => {
            if (state.selectedPaidColors.has(JSON.stringify(color))) {
                selectedColors.push(color);
            }
        });

        state.activePalette = selectedColors.length > 0 ? selectedColors : [[0, 0, 0]];
    }

    function toggleSelectAll(type) {
        const t = TRANSLATIONS[currentLanguage];
        if (type === 'free') {
            const allSelected = state.selectedFreeColors.size === state.freeColors.length;
            if (allSelected) {
                state.selectedFreeColors.clear();
                freeSelectAllBtn.textContent = t.selectAll;
            } else {
                state.freeColors.forEach(color => {
                    const colorKey = JSON.stringify(color);
                    state.selectedFreeColors.add(colorKey);
                });
                freeSelectAllBtn.textContent = t.deselectAll;
            }
            renderPaletteGrid('free');
        } else {
            const allSelected = state.selectedPaidColors.size === state.paidColors.length;
            if (allSelected) {
                state.selectedPaidColors.clear();
                paidSelectAllBtn.textContent = t.selectAll;
            } else {
                state.paidColors.forEach(color => {
                    const colorKey = JSON.stringify(color);
                    state.selectedPaidColors.add(colorKey);
                });
                paidSelectAllBtn.textContent = t.deselectAll;
            }
            renderPaletteGrid('paid');
        }
        updateActivePalette();
        smartUpdatePreview();
    }

    function handleSwatchClick(e) {
        if (!e.target.classList.contains('color-swatch')) return;

        const colorStr = e.target.dataset.color;
        const color = JSON.parse(colorStr);
        const colorKey = JSON.stringify(color);
        const isPaid = e.target.dataset.isPaid === 'true';

        if (isPaid) {
            if (state.selectedPaidColors.has(colorKey)) {
                state.selectedPaidColors.delete(colorKey);
                e.target.classList.add('deselected');
            } else {
                state.selectedPaidColors.add(colorKey);
                e.target.classList.remove('deselected');
            }
            updateSelectAllButton('paid');
        } else {
            if (state.selectedFreeColors.has(colorKey)) {
                state.selectedFreeColors.delete(colorKey);
                e.target.classList.add('deselected');
            } else {
                state.selectedFreeColors.add(colorKey);
                e.target.classList.remove('deselected');
            }
            updateSelectAllButton('free');
        }

        updateActivePalette();
        smartUpdatePreview();
    }

    function updateSelectAllButton(type) {
        const t = TRANSLATIONS[currentLanguage];
        if (type === 'free') {
            const allSelected = state.selectedFreeColors.size === state.freeColors.length && state.freeColors.length > 0;
            freeSelectAllBtn.textContent = allSelected ? t.deselectAll : t.selectAll;
        } else {
            const allSelected = state.selectedPaidColors.size === state.paidColors.length && state.paidColors.length > 0;
            paidSelectAllBtn.textContent = allSelected ? t.deselectAll : t.selectAll;
        }
    }

    // ==================== 图像处理功能 ====================
    async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        state.inputImage = await loadImage(URL.createObjectURL(file));
        state.originalWidth = state.inputImage.width;
        state.originalHeight = state.inputImage.height;
        state.aspectRatio = state.originalWidth / state.originalHeight;

        inputWrapper.style.backgroundImage = `url(${state.inputImage.src})`;
        inputWrapper.classList.add('has-file');
        document.getElementById('input-text').style.display = 'none';

        placeholderText.style.display = 'none';
        viewport.style.display = 'block';
        previewControls.style.display = 'flex';
        
        // 显示下载按钮容器
        const previewActions = document.querySelector('.preview-actions');
        if (previewActions) previewActions.style.display = 'flex';
        
        downloadBtn.style.display = 'block';
        downloadBtn.disabled = false;

        // 启用绘画工具编辑按钮
        const editInPainterBtn = document.getElementById('edit-in-painter-btn');
        if (editInPainterBtn) editInPainterBtn.disabled = false;

        updateSizeUI();
        resetPanAndZoom();
        smartUpdatePreview();
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    // ==================== 图片处理功能（实验性）====================
    
    /**
     * 调整亮度
     * @param {ImageData} imageData - 原始图像数据
     * @param {number} brightness - 亮度百分比 (0-200)
     */
    function adjustBrightness(imageData, brightness) {
        const data = imageData.data;
        const factor = brightness / 100;
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, data[i] * factor));     // R
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor)); // G
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor)); // B
        }
        
        return imageData;
    }

    /**
     * 调整对比度
     * @param {ImageData} imageData - 原始图像数据
     * @param {number} contrast - 对比度百分比 (0-200)
     */
    function adjustContrast(imageData, contrast) {
        const data = imageData.data;
        // 将百分比转换为对比度因子：100% -> 1.0, 0% -> 0.0, 200% -> 2.0
        const factor = contrast / 100;
        
        for (let i = 0; i < data.length; i += 4) {
            // 使用线性对比度调整：以128为中心点
            data[i] = Math.min(255, Math.max(0, 128 + (data[i] - 128) * factor));     // R
            data[i + 1] = Math.min(255, Math.max(0, 128 + (data[i + 1] - 128) * factor)); // G
            data[i + 2] = Math.min(255, Math.max(0, 128 + (data[i + 2] - 128) * factor)); // B
        }
        
        return imageData;
    }

    /**
     * 调整饱和度
     * @param {ImageData} imageData - 原始图像数据
     * @param {number} saturation - 饱和度百分比 (0-200)
     */
    function adjustSaturation(imageData, saturation) {
        const data = imageData.data;
        const factor = saturation / 100;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 计算灰度值
            const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            
            // 应用饱和度调整
            data[i] = Math.min(255, Math.max(0, gray + (r - gray) * factor));     // R
            data[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * factor)); // G
            data[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * factor)); // B
        }
        
        return imageData;
    }

    /**
     * 锐化处理
     * @param {ImageData} imageData - 原始图像数据
     * @param {number} sharpness - 锐化强度 (0-100)
     */
    function adjustSharpness(imageData, sharpness) {
        if (sharpness === 0) return imageData;
        
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        const originalData = new Uint8ClampedArray(data);
        
        // 锐化强度因子 (0-1)
        const amount = sharpness / 100;
        
        // 使用简单的3x3卷积核进行锐化
        // 卷积核: [0 -1 0; -1 5 -1; 0 -1 0]
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                for (let c = 0; c < 3; c++) { // RGB通道
                    const idx = (y * width + x) * 4 + c;
                    
                    // 获取周围像素
                    const center = originalData[idx];
                    const top = originalData[((y - 1) * width + x) * 4 + c];
                    const bottom = originalData[((y + 1) * width + x) * 4 + c];
                    const left = originalData[(y * width + (x - 1)) * 4 + c];
                    const right = originalData[(y * width + (x + 1)) * 4 + c];
                    
                    // 应用锐化卷积
                    const sharpened = 5 * center - top - bottom - left - right;
                    
                    // 混合原始值和锐化值
                    data[idx] = Math.min(255, Math.max(0, center + (sharpened - center) * amount));
                }
            }
        }
        
        return imageData;
    }

    /**
     * 调整色相
     * @param {ImageData} imageData - 原始图像数据
     * @param {number} hueShift - 色相偏移 (-180 to 180)
     */
    function adjustHue(imageData, hueShift) {
        if (hueShift === 0) return imageData;
        
        const data = imageData.data;
        const hueRad = (hueShift * Math.PI) / 180;
        
        // 预计算旋转矩阵
        const cosH = Math.cos(hueRad);
        const sinH = Math.sin(hueRad);
        
        // 色相旋转矩阵（基于ITU-R BT.709标准）
        const matrix = [
            0.213 + 0.787 * cosH - 0.213 * sinH,
            0.715 - 0.715 * cosH - 0.715 * sinH,
            0.072 - 0.072 * cosH + 0.928 * sinH,
            
            0.213 - 0.213 * cosH + 0.143 * sinH,
            0.715 + 0.285 * cosH + 0.140 * sinH,
            0.072 - 0.072 * cosH - 0.283 * sinH,
            
            0.213 - 0.213 * cosH - 0.787 * sinH,
            0.715 - 0.715 * cosH + 0.715 * sinH,
            0.072 + 0.928 * cosH + 0.072 * sinH
        ];
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 应用色相旋转
            data[i] = Math.min(255, Math.max(0, matrix[0] * r + matrix[1] * g + matrix[2] * b));
            data[i + 1] = Math.min(255, Math.max(0, matrix[3] * r + matrix[4] * g + matrix[5] * b));
            data[i + 2] = Math.min(255, Math.max(0, matrix[6] * r + matrix[7] * g + matrix[8] * b));
        }
        
        return imageData;
    }

    /**
     * 调整色温
     * @param {ImageData} imageData - 原始图像数据
     * @param {number} temperature - 色温偏移 (-100 to 100)，正值偏暖（橙），负值偏冷（蓝）
     */
    function adjustTemperature(imageData, temperature) {
        if (temperature === 0) return imageData;

        const data = imageData.data;
        const factor = temperature / 100;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            if (factor > 0) {
                data[i] = Math.min(255, r + 30 * factor);
                data[i + 1] = Math.min(255, g + 10 * factor);
                data[i + 2] = Math.max(0, b - 30 * factor);
            } else {
                data[i] = Math.max(0, r + 30 * factor);
                data[i + 1] = Math.max(0, g + 10 * factor);
                data[i + 2] = Math.min(255, b - 30 * factor);
            }
        }

        return imageData;
    }

    /**
     * 应用所有图片处理效果
     * @param {HTMLImageElement} img - 原始图片
     * @returns {ImageData} 处理后的图像数据
     */
    function applyImageAdjustments(img) {
        // 创建临时canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 绘制原始图片
        tempCtx.drawImage(img, 0, 0);
        
        // 获取图像数据
        let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        
        // 按顺序应用调整：亮度 -> 对比度 -> 饱和度 -> 锐化 -> 色相 -> 色温
        imageData = adjustBrightness(imageData, state.brightness);
        imageData = adjustContrast(imageData, state.contrast);
        imageData = adjustSaturation(imageData, state.saturation);
        imageData = adjustSharpness(imageData, state.sharpness);
        imageData = adjustHue(imageData, state.hue);
        imageData = adjustTemperature(imageData, state.temperature);
        
        return imageData;
    }

    /**
     * 将处理后的图像数据转换回Image对象
     * @param {ImageData} imageData - 处理后的图像数据
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @returns {Promise<HTMLImageElement>} 处理后的图片
     */
    function imageDataToImage(imageData, width, height) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = canvas.toDataURL('image/png');
        });
    }

    /**
     * 处理亮度变化（滑块）
     */
    function handleBrightnessChange(e) {
        state.brightness = parseInt(e.target.value);
        const el = document.getElementById('brightness-value');
        if (el) el.value = state.brightness;
        smartUpdatePreview();
    }

    /**
     * 处理亮度变化（数字输入框）
     */
    function handleBrightnessInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 200) value = 200;
        
        state.brightness = value;
        brightnessSlider.value = value;
        smartUpdatePreview();
    }

    /**
     * 处理对比度变化（滑块）
     */
    function handleContrastChange(e) {
        state.contrast = parseInt(e.target.value);
        const el = document.getElementById('contrast-value');
        if (el) el.value = state.contrast;
        smartUpdatePreview();
    }

    /**
     * 处理对比度变化（数字输入框）
     */
    function handleContrastInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 200) value = 200;
        
        state.contrast = value;
        contrastSlider.value = value;
        smartUpdatePreview();
    }

    /**
     * 处理饱和度变化（滑块）
     */
    function handleSaturationChange(e) {
        state.saturation = parseInt(e.target.value);
        const el = document.getElementById('saturation-value');
        if (el) el.value = state.saturation;
        smartUpdatePreview();
    }

    /**
     * 处理饱和度变化（数字输入框）
     */
    function handleSaturationInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 200) value = 200;
        
        state.saturation = value;
        saturationSlider.value = value;
        smartUpdatePreview();
    }

    /**
     * 处理锐化变化（滑块）
     */
    function handleSharpnessChange(e) {
        state.sharpness = parseInt(e.target.value);
        const el = document.getElementById('sharpness-value');
        if (el) el.value = state.sharpness;
        smartUpdatePreview();
    }

    /**
     * 处理锐化变化（数字输入框）
     */
    function handleSharpnessInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        
        state.sharpness = value;
        sharpnessSlider.value = value;
        smartUpdatePreview();
    }

    /**
     * 处理色相变化（滑块）
     */
    function handleHueChange(e) {
        state.hue = parseInt(e.target.value);
        const el = document.getElementById('hue-value');
        if (el) el.value = state.hue;
        smartUpdatePreview();
    }

    /**
     * 处理色相变化（数字输入框）
     */
    function handleHueInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < -180) value = -180;
        if (value > 180) value = 180;
        
        state.hue = value;
        hueSlider.value = value;
        smartUpdatePreview();
    }

    /**
     * 处理色温变化（滑块）
     */
    function handleTemperatureChange(e) {
        state.temperature = parseInt(e.target.value);
        const el = document.getElementById('temperature-value');
        if (el) el.value = state.temperature;
        smartUpdatePreview();
    }

    /**
     * 处理色温变化（数字输入框）
     */
    function handleTemperatureInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < -100) value = -100;
        if (value > 100) value = 100;

        state.temperature = value;
        temperatureSlider.value = value;
        smartUpdatePreview();
    }

    /**
     * 重置所有图片调整
     */
    function resetImageAdjustments() {
        state.brightness = 100;
        state.contrast = 100;
        state.saturation = 100;
        state.sharpness = 0;
        state.hue = 0;
        state.temperature = 0;
        
        brightnessSlider.value = 100;
        contrastSlider.value = 100;
        saturationSlider.value = 100;
        sharpnessSlider.value = 0;
        hueSlider.value = 0;
        temperatureSlider.value = 0;
        
        const brightnessEl = document.getElementById('brightness-value');
        const contrastEl = document.getElementById('contrast-value');
        const saturationEl = document.getElementById('saturation-value');
        const sharpnessEl = document.getElementById('sharpness-value');
        const hueEl = document.getElementById('hue-value');
        const temperatureEl = document.getElementById('temperature-value');
        
        if (brightnessEl) brightnessEl.value = 100;
        if (contrastEl) contrastEl.value = 100;
        if (saturationEl) saturationEl.value = 100;
        if (sharpnessEl) sharpnessEl.value = 0;
        if (hueEl) hueEl.value = 0;
        if (temperatureEl) temperatureEl.value = 0;
        
        smartUpdatePreview();
    }

    function findClosestColor(color, palette) {
        let minDistance = Infinity;
        let closestColor = palette[0];
        for (const pColor of palette) {
            const distance = (color[0] - pColor[0])**2 + (color[1] - pColor[1])**2 + (color[2] - pColor[2])**2;
            if (distance < minDistance) {
                minDistance = distance;
                closestColor = pColor;
            }
        }
        return closestColor;
    }

    /**
     * 强制去除半透明像素
     * @param {ImageData} imageData - 图像数据
     * @param {Array} palette - 颜色调色板
     * @returns {ImageData} 处理后的图像数据
     */
    function applyForceOpaque(imageData, palette) {
        const data = imageData.data;
        const newImageData = new ImageData(imageData.width, imageData.height);
        const newData = newImageData.data;

        // 复制原始数据
        for (let i = 0; i < data.length; i++) {
            newData[i] = data[i];
        }

        // 处理每个像素
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            // 透明度小于50%（128）的变成完全透明
            if (a < 128) {
                newData[i] = 0;
                newData[i + 1] = 0;
                newData[i + 2] = 0;
                newData[i + 3] = 0;
            } else {
                // 透明度大于等于50%的变成完全不透明，并匹配色板
                newData[i + 3] = 255;
                
                // 找到最接近的色板颜色
                const closestColor = findClosestColor([r, g, b], palette);
                newData[i] = closestColor[0];
                newData[i + 1] = closestColor[1];
                newData[i + 2] = closestColor[2];
            }
        }

        return newImageData;
    }

    async function updatePreview() {
        if (!state.inputImage || !state.activePalette || state.activePalette.length === 0) {
            updateColorStats(null);
            return;
        }

        const newWidth = Math.round(state.originalWidth * state.imageSize);
        const newHeight = Math.round(state.originalHeight * state.imageSize);

        previewCanvas.width = newWidth;
        previewCanvas.height = newHeight;

        // 应用图片处理（亮度、对比度、饱和度、锐化、色相、色温）
        let sourceImageData;
        if (state.brightness !== 100 || state.contrast !== 100 || state.saturation !== 100 || state.sharpness !== 0 || state.hue !== 0 || state.temperature !== 0) {
            // 先调整原始图片
            const adjustedImageData = applyImageAdjustments(state.inputImage);
            // 将调整后的数据绘制到canvas并缩放
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = state.inputImage.width;
            tempCanvas.height = state.inputImage.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(adjustedImageData, 0, 0);

            previewCtx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
            sourceImageData = previewCtx.getImageData(0, 0, newWidth, newHeight);
        } else {
            // 没有调整，直接绘制
            previewCtx.drawImage(state.inputImage, 0, 0, newWidth, newHeight);
            sourceImageData = previewCtx.getImageData(0, 0, newWidth, newHeight);
        }

        const algo = ALGORITHMS[state.activeAlgorithm];
        let processedImageData;

        if (algo.type === 'error') {
            if (ditherWorker) {
                try {
                    processedImageData = await _ditherInWorker(sourceImageData, state.activePalette, state.ditherStrength, algo, algo.kernel, null);
                } catch (e) {
                    // Worker failed, re-read source from canvas (buffer was transferred) and fallback to sync
                    sourceImageData = previewCtx.getImageData(0, 0, newWidth, newHeight);
                    processedImageData = applyErrorDither(sourceImageData, state.activePalette, state.ditherStrength, algo.kernel, state.isLocked);
                }
            } else {
                processedImageData = applyErrorDither(sourceImageData, state.activePalette, state.ditherStrength, algo.kernel, state.isLocked);
            }
        } else if (algo.type === 'ordered') {
            if (ditherWorker) {
                try {
                    processedImageData = await _ditherInWorker(sourceImageData, state.activePalette, state.ditherStrength, algo, null, algo.matrix);
                } catch (e) {
                    sourceImageData = previewCtx.getImageData(0, 0, newWidth, newHeight);
                    processedImageData = applyOrderedDither(sourceImageData, state.activePalette, state.ditherStrength, algo.matrix, state.isLocked);
                }
            } else {
                processedImageData = applyOrderedDither(sourceImageData, state.activePalette, state.ditherStrength, algo.matrix, state.isLocked);
            }
        }

        // 应用强制去除半透明像素
        if (state.forceOpaqueEnabled) {
            processedImageData = applyForceOpaque(processedImageData, state.activePalette);
        }

        // 应用颜色替换
        if (state.colorReplacements.size > 0) {
            processedImageData = applyColorReplacements(processedImageData);
        }

        state.processedImageData = processedImageData;

        // Update preview canvas size to match processed image
        previewCanvas.width = processedImageData.width;
        previewCanvas.height = processedImageData.height;
        previewCtx.putImageData(processedImageData, 0, 0);
        updateTransform();
        updateColorStats(processedImageData);
        updateEstimatedTime();
    }

    /**
     * 智能更新预览 - 根据实时调整开关决定是否立即更新
     */
    function smartUpdatePreview() {
        if (state.realtimeEnabled) {
            updatePreview();
        }
        // 如果实时调整关闭，则不执行任何操作，等待用户点击“生成图片”按钮
    }

    /**
     * 实时调整开关变化处理
     */
    function handleRealtimeToggleChange(e) {
        state.realtimeEnabled = e.target.checked;
        if (state.realtimeEnabled) {
            // 开启实时调整时，隐藏手动生成按钮，并立即更新
            manualGenerateBtn.style.display = 'none';
            updatePreview();
        } else {
            // 关闭实时调整时，显示手动生成按钮
            manualGenerateBtn.style.display = 'block';
        }
    }

    /**
     * 手动生成图片按钮点击处理
     */
    function handleManualGenerate() {
        updatePreview();
    }

    /**
     * 计算预计完成时间
     * @param {ImageData} imageData - 图像数据
     * @returns {string} 格式化的时间字符串
     */
    function calculateEstimatedTime(imageData) {
        if (!imageData || !state.inputImage) {
            return '--';
        }

        // 计算非空白像素数量
        const data = imageData.data;
        let nonBlankPixels = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            // 排除完全透明的像素和纯白色背景（可根据需要调整）
            if (a > 0 && !(r === 255 && g === 255 && b === 255)) {
                nonBlankPixels++;
            }
        }

        if (nonBlankPixels === 0) {
            return '--';
        }

        // 每个像素30秒，除以参与人数
        const totalSeconds = (nonBlankPixels * 30) / state.participantCount;
        
        // 格式化时间
        return formatTime(totalSeconds);
    }

    /**
     * 格式化时间为可读字符串
     * @param {number} seconds - 总秒数
     * @returns {string} 格式化的时间字符串
     */
    function formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.ceil(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.ceil(seconds / 60);
            return `${minutes}min`;
        } else if (seconds < 86400) {
            const hours = Math.ceil(seconds / 3600);
            return `${hours}h`;
        } else {
            const days = Math.ceil(seconds / 86400);
            return `${days}d`;
        }
    }

    /**
     * 更新预计完成时间显示
     */
    function updateEstimatedTime() {
        const timeText = calculateEstimatedTime(state.processedImageData);
        const t = TRANSLATIONS[currentLanguage];
        estimatedTimeDisplay.textContent = `${t.estimatedTime || 'Estimated Time'}: ${timeText}`;
    }

    /**
     * 参与人数变化处理
     */
    function handleParticipantCountChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value) || value < 1) value = 1;
        if (value > 100) value = 100;
        
        state.participantCount = value;
        participantCountInput.value = value;
        updateEstimatedTime();
    }

    /**
     * 强制去除半透明像素开关变化处理
     */
    function handleForceOpaqueToggleChange(e) {
        state.forceOpaqueEnabled = e.target.checked;
        smartUpdatePreview();
    }

    // ==================== 参数调整功能 ====================
    
    /**
     * 抖动强度滑块变化处理
     */
    function handleStrengthChange() {
        state.ditherStrength = strengthSlider.value / 100;
        const el = document.getElementById('dither-strength-value');
        if (el) el.value = strengthSlider.value;
        smartUpdatePreview();
    }

    /**
     * 抖动强度数字输入框变化处理
     */
    function handleDitherStrengthInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 0;
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        
        state.ditherStrength = value / 100;
        strengthSlider.value = value;
        smartUpdatePreview();
    }

    function handleDitherScaleChange() {
        state.ditherScale = parseInt(ditherScaleSelect.value);
        const el = document.getElementById('dither-scale-value');
        if (el) el.textContent = `${ditherScaleSelect.value}倍`;
        smartUpdatePreview();
    }

    /**
     * 图片尺寸滑块变化处理
     */
    function handleSizeSliderChange() {
        state.imageSize = sizeSlider.value / 100;
        updateSizeUI();
        smartUpdatePreview();
        centerImage();
    }

    /**
     * 图片尺寸数字输入框变化处理
     */
    function handleImageSizeInputChange(e) {
        let value = parseInt(e.target.value, 10);
        if (isNaN(value)) value = 10;
        if (value < 10) value = 10;
        if (value > 200) value = 200;
        
        state.imageSize = value / 100;
        sizeSlider.value = value;
        updateSizeUI();
        smartUpdatePreview();
        centerImage();
    }

    function handlePixelCountChange() {
        if (!state.inputImage) return;
        let targetPixels = parseInt(pixelCountInput.value, 10);
        if (isNaN(targetPixels) || targetPixels < 10) targetPixels = 10;
        if (targetPixels > 1000000) targetPixels = 1000000;

        const newWidth = Math.round(Math.sqrt(targetPixels * state.aspectRatio));

        state.imageSize = newWidth / state.originalWidth;
        updateSizeUI();
        smartUpdatePreview();
        centerImage();
    }

    function handleWidthInputChange() {
        const newWidth = parseInt(imageWidthInput.value, 10);
        if (!isNaN(newWidth) && newWidth > 0) {
            state.imageSize = newWidth / state.originalWidth;
            updateSizeUI();
            updatePreview();
            centerImage();
        }
    }

    function handleHeightInputChange() {
        const newHeight = parseInt(imageHeightInput.value, 10);
        if (!isNaN(newHeight) && newHeight > 0) {
            state.imageSize = newHeight / state.originalHeight;
            updateSizeUI();
            updatePreview();
            centerImage();
        }
    }

    function handleAlgorithmChange(e) {
        if (e.target.tagName !== 'BUTTON') return;
        state.activeAlgorithm = e.target.dataset.name;
        ditherSelector.querySelector('.active').classList.remove('active');
        e.target.classList.add('active');
        updatePreview();
    }

    function updateSizeUI() {
        if (!state.inputImage) return;
        const newWidth = Math.round(state.originalWidth * state.imageSize);
        const newHeight = Math.round(state.originalHeight * state.imageSize);

        sizeSlider.value = Math.round(state.imageSize * 100);
        const sizeValueEl = document.getElementById('image-size-value');
        if (sizeValueEl) sizeValueEl.value = sizeSlider.value;
        
        imageWidthInput.value = newWidth;
        imageHeightInput.value = newHeight;
        pixelCountInput.value = newWidth * newHeight;
    }

    // ==================== 预览控制功能 ====================
    function handleDownload() {
        const link = document.createElement('a');
        link.download = `${state.activeAlgorithm}_processed.png`;
        link.href = previewCanvas.toDataURL('image/png');
        link.click();
    }

    function handleZoomSlider() {
        state.zoom = zoomSlider.value / 100;
        const zoomValueEl = document.getElementById('zoom-value');
        if (zoomValueEl) zoomValueEl.textContent = `${zoomSlider.value}%`;
        updateTransform();
        centerImage();
    }

    function handleWheelZoom(e) {
        e.preventDefault();
        const zoomFactor = 1.1;
        const oldZoom = state.zoom;

        state.zoom *= (e.deltaY < 0 ? zoomFactor : 1 / zoomFactor);
        state.zoom = Math.max(0.2, Math.min(5, state.zoom));

        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.panX = mouseX - (mouseX - state.panX) * (state.zoom / oldZoom);
        state.panY = mouseY - (mouseY - state.panY) * (state.zoom / oldZoom);

        zoomSlider.value = Math.round(state.zoom * 100);
        const zoomValueEl = document.getElementById('zoom-value');
        if (zoomValueEl) zoomValueEl.textContent = `${zoomSlider.value}%`;
        updateTransform();
    }

    function handlePanStart(e) {
        e.preventDefault();
        state.isPanning = true;
        state.lastPanX = e.clientX;
        state.lastPanY = e.clientY;
        viewport.style.cursor = 'grabbing';
    }

    function handlePanMove(e) {
        if (!state.isPanning) return;
        e.preventDefault();
        const dx = e.clientX - state.lastPanX;
        const dy = e.clientY - state.lastPanY;
        state.panX += dx;
        state.panY += dy;
        state.lastPanX = e.clientX;
        state.lastPanY = e.clientY;
        updateTransform();
    }

    function handlePanEnd() {
        state.isPanning = false;
        viewport.style.cursor = 'grab';
    }

    function updateTransform() {
        if (!state.inputImage) return;
        previewCanvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }

    function centerImage() {
        if (previewCanvas) {
            const viewportRect = viewport.getBoundingClientRect();
            const canvasWidth = previewCanvas.width * state.zoom;
            const canvasHeight = previewCanvas.height * state.zoom;

            state.panX = (viewportRect.width - canvasWidth) / 2;
            state.panY = (viewportRect.height - canvasHeight) / 2;
        } else {
            state.panX = 0;
            state.panY = 0;
        }
        updateTransform();
    }

    function resetPanAndZoom() {
        state.zoom = 1.0;
        state.panX = 0;
        state.panY = 0;
        zoomSlider.value = 100;
        const zoomValueEl = document.getElementById('zoom-value');
        if (zoomValueEl) zoomValueEl.textContent = '100%';
        updateTransform();
    }

    // ==================== 颜色统计功能 ====================
    function updateColorStats(imageData) {
        const statsContainer = document.getElementById('color-stats-container');
        const t = TRANSLATIONS[currentLanguage];

        if (!imageData) {
            statsContainer.innerHTML = `<p>${t.processImageFirst}</p>`;
            return;
        }

        const colorCounts = {};
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] < 128) continue;
            const colorKey = `rgb(${data[i]}, ${data[i+1]}, ${data[i+2]})`;
            colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
        }

        const sortedColors = Object.entries(colorCounts).sort(([,a],[,b]) => b - a);

        statsContainer.innerHTML = '';

        if (sortedColors.length === 0) {
            statsContainer.innerHTML = `<p>${t.noColorsDetected}</p>`;
            return;
        }

        for (const [colorKey, count] of sortedColors) {
            const colorInfo = COLOR_INFO[colorKey] || { name: 'Unknown Color', isPaid: false };
            let displayName = colorInfo.name;
            if (colorInfo.name === 'Salmon') {
                displayName = 'Salmon【三文鱼、肉意思】';
            }
            displayName += colorInfo.isPaid ? ' ★' : '';

            const row = document.createElement('div');
            row.className = 'color-stat-row';
            row.innerHTML = `
                <div class="color-stat-swatch" style="background-color: ${colorKey};"></div>
                <span class="color-stat-name">${displayName}</span>
                <span class="color-stat-count">${count.toLocaleString()} px</span>
            `;
            statsContainer.appendChild(row);
        }
    }

    function handleExportColors() {
        if (!state.processedImageData) return;

        const selectedColorSet = new Set();
        state.selectedFreeColors.forEach(colorStr => selectedColorSet.add(colorStr));
        state.selectedPaidColors.forEach(colorStr => selectedColorSet.add(colorStr));

        const originalData = state.processedImageData.data;
        const width = state.processedImageData.width;
        const height = state.processedImageData.height;
        const newData = new Uint8ClampedArray(originalData.length);

        for (let i = 0; i < originalData.length; i += 4) {
            const color = [originalData[i], originalData[i+1], originalData[i+2]];
            const colorStr = JSON.stringify(color);

            if (selectedColorSet.has(colorStr)) {
                newData[i] = originalData[i];
                newData[i+1] = originalData[i+1];
                newData[i+2] = originalData[i+2];
                newData[i+3] = 255;
            } else {
                newData[i] = 0;
                newData[i+1] = 0;
                newData[i+2] = 0;
                newData[i+3] = 0;
            }
        }

        const newImageData = new ImageData(newData, width, height);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(newImageData, 0, 0);

        const link = document.createElement('a');
        link.href = tempCanvas.toDataURL('image/png');
        link.download = 'selected_colors_export.png';
        link.click();
    }

    // ==================== 颜色选择和替换功能 ====================
    function handleColorPickerModeToggle(e) {
        state.colorPickerMode = e.target.checked;

        if (state.colorPickerMode) {
            previewCanvas.classList.add('color-picker-active');
            viewport.style.pointerEvents = 'none';
            previewCanvas.style.pointerEvents = 'auto';
        } else {
            previewCanvas.classList.remove('color-picker-active');
            viewport.style.pointerEvents = 'auto';
            previewCanvas.style.pointerEvents = 'none';
            selectedColorDisplay.style.display = 'none';
            replacementColorSection.style.display = 'none';
            state.selectedSourceColor = null;
            state.selectedReplacementColor = null;
        }
    }

    function createPixelTooltip() {
        if (pixelTooltip) return pixelTooltip;

        pixelTooltip = document.createElement('div');
        pixelTooltip.className = 'pixel-tooltip';
        document.body.appendChild(pixelTooltip);
        return pixelTooltip;
    }

    function showPixelTooltip(x, y, color, mouseX, mouseY) {
        const tooltip = createPixelTooltip();
        const [r, g, b] = color;

        const colorKey = `rgb(${r}, ${g}, ${b})`;
        const colorInfo = COLOR_INFO[colorKey] || { name: 'Unknown Color', isPaid: false };
        let colorName = colorInfo.name;
        if (colorInfo.name === 'Salmon') {
            colorName = '鲑鱼色';
        }
        colorName += colorInfo.isPaid ? ' ★' : '';

        const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        tooltip.innerHTML = `
            <span class="color-preview-small" style="background-color: rgb(${r}, ${g}, ${b});"></span>
            <span>${colorName}</span><br>
            <span style="font-size: 11px; opacity: 0.8;">RGB(${r}, ${g}, ${b}) ${hexColor}</span><br>
            <span style="font-size: 11px; opacity: 0.8;">位置: (${x}, ${y})</span>
        `;

        tooltip.style.left = mouseX + 'px';
        tooltip.style.top = mouseY + 'px';
        tooltip.classList.add('visible');
    }

    function hidePixelTooltip() {
        if (pixelTooltip) {
            pixelTooltip.classList.remove('visible');
        }
        if (tooltipThrottleTimer) {
            clearTimeout(tooltipThrottleTimer);
            tooltipThrottleTimer = null;
        }
    }

    function handleCanvasMouseMove(e) {
        if (!state.colorPickerMode || !state.processedImageData) {
            hidePixelTooltip();
            return;
        }

        if (tooltipThrottleTimer) return;

        tooltipThrottleTimer = setTimeout(() => {
            const rect = previewCanvas.getBoundingClientRect();
            const scaleX = previewCanvas.width / rect.width;
            const scaleY = previewCanvas.height / rect.height;

            const x = Math.floor((e.clientX - rect.left) * scaleX);
            const y = Math.floor((e.clientY - rect.top) * scaleY);

            if (x >= 0 && x < previewCanvas.width && y >= 0 && y < previewCanvas.height) {
                const imageData = state.processedImageData;
                const index = (y * imageData.width + x) * 4;

                const r = imageData.data[index];
                const g = imageData.data[index + 1];
                const b = imageData.data[index + 2];
                const a = imageData.data[index + 3];

                if (a < 128) {
                    hidePixelTooltip();
                    tooltipThrottleTimer = null;
                    return;
                }

                const color = [r, g, b];
                showPixelTooltip(x, y, color, e.clientX, e.clientY);
            } else {
                hidePixelTooltip();
            }

            tooltipThrottleTimer = null;
        }, TOOLTIP_THROTTLE_DELAY);
    }

    function handleCanvasClick(e) {
        if (!state.colorPickerMode || !state.processedImageData) return;

        e.preventDefault();
        e.stopPropagation();

        const rect = previewCanvas.getBoundingClientRect();
        const scaleX = previewCanvas.width / rect.width;
        const scaleY = previewCanvas.height / rect.height;

        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);

        if (x >= 0 && x < previewCanvas.width && y >= 0 && y < previewCanvas.height) {
            const imageData = state.processedImageData;
            const index = (y * imageData.width + x) * 4;

            const r = imageData.data[index];
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];
            const a = imageData.data[index + 3];

            if (a < 128) return;

            const selectedColor = [r, g, b];
            state.selectedSourceColor = selectedColor;

            showSelectedColor(selectedColor);
            showReplacementColorSection();
        }
    }

    function showSelectedColor(color) {
        const colorKey = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        const colorInfo = COLOR_INFO[colorKey] || { name: 'Unknown Color', isPaid: false };

        let displayName = colorInfo.name;
        if (colorInfo.name === 'Salmon') {
            displayName = 'Salmon【三文鱼、肉意思】';
        }
        displayName += colorInfo.isPaid ? ' ★' : '';

        selectedColorPreview.style.backgroundColor = colorKey;
        selectedColorName.textContent = displayName;
        selectedColorDisplay.style.display = 'block';
    }

    function showReplacementColorSection() {
        replacementColorSection.style.display = 'block';
        renderReplacementPalettes();
    }

    function handleReplacementTabClick(e) {
        if (!e.target.classList.contains('tab-btn')) return;

        const tab = e.target.dataset.tab;
        state.activeReplacementTab = tab;

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        if (tab === 'free') {
            replacementFreeGrid.style.display = 'flex';
            replacementPaidGrid.style.display = 'none';
        } else {
            replacementFreeGrid.style.display = 'none';
            replacementPaidGrid.style.display = 'flex';
        }
    }

    function renderReplacementPalettes() {
        // 为免费颜色面板添加透明颜色选项
        const transparentColor = [0, 0, 0, 0]; // RGBA: 完全透明
        const freeColorsWithTransparent = [transparentColor, ...state.freeColors];
        
        renderReplacementPalette(replacementFreeGrid, freeColorsWithTransparent, true);
        renderReplacementPalette(replacementPaidGrid, state.paidColors, false);
    }

    function renderReplacementPalette(grid, colors, includeTransparent) {
        grid.innerHTML = '';
        const t = TRANSLATIONS[currentLanguage];

        colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            
            // 检查是否是透明颜色（数组长度为4且第4个元素为0）
            const isTransparent = includeTransparent && color.length === 4 && color[3] === 0;
            
            if (isTransparent) {
                // 透明颜色使用特殊的棋盘格背景
                swatch.style.background = `linear-gradient(45deg, #ccc 25%, transparent 25%), 
                                          linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                                          linear-gradient(45deg, transparent 75%, #ccc 75%), 
                                          linear-gradient(-45deg, transparent 75%, #ccc 75%)`;
                swatch.style.backgroundSize = '10px 10px';
                swatch.style.backgroundPosition = '0 0, 0 5px, 5px -5px, -5px 0px';
                swatch.style.backgroundColor = 'white';
            } else {
                swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            }
            
            swatch.dataset.color = JSON.stringify(color);

            const tooltip = document.createElement('span');
            tooltip.className = 'tooltip-text';
            
            if (isTransparent) {
                tooltip.textContent = t.transparentColor || 'Transparent';
            } else {
                const colorKey = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                const colorInfo = COLOR_INFO[colorKey] || { name: 'Unknown', isPaid: false };
                let displayName = colorInfo.name;
                if (colorInfo.name === 'Salmon') {
                    displayName = 'Salmon【三文鱼、肉意思】';
                }
                displayName += colorInfo.isPaid ? ' ★' : '';
                tooltip.textContent = displayName;
            }
            
            swatch.appendChild(tooltip);

            grid.appendChild(swatch);
        });
    }

    function handleReplacementColorClick(e) {
        if (!e.target.classList.contains('color-swatch')) return;

        e.target.parentElement.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.classList.remove('selected');
        });

        e.target.classList.add('selected');

        const colorStr = e.target.dataset.color;
        state.selectedReplacementColor = JSON.parse(colorStr);

        applyReplacementBtn.disabled = false;
    }

    function handleApplyReplacement() {
        if (!state.selectedSourceColor || !state.selectedReplacementColor) return;

        const sourceKey = JSON.stringify(state.selectedSourceColor);
        const replacementKey = JSON.stringify(state.selectedReplacementColor);

        state.colorReplacements.set(sourceKey, state.selectedReplacementColor);

        updateReplacementList();
        smartUpdatePreview();

        handleClearReplacement();
    }

    function handleClearReplacement() {
        state.selectedSourceColor = null;
        state.selectedReplacementColor = null;
        selectedColorDisplay.style.display = 'none';
        replacementColorSection.style.display = 'none';
        applyReplacementBtn.disabled = true;

        document.querySelectorAll('.replacement-palette-grid .color-swatch').forEach(swatch => {
            swatch.classList.remove('selected');
        });
    }

    function handleResetAllReplacements() {
        state.colorReplacements.clear();
        updateReplacementList();
        smartUpdatePreview();
        handleClearReplacement();
    }

    function updateReplacementList() {
        const t = TRANSLATIONS[currentLanguage];
        
        if (state.colorReplacements.size === 0) {
            replacementItems.innerHTML = `<p class="no-replacements">${t.noReplacements || 'No color replacements'}</p>`;
            return;
        }

        replacementItems.innerHTML = '';

        state.colorReplacements.forEach((replacementColor, sourceColorStr) => {
            const sourceColor = JSON.parse(sourceColorStr);

            const item = document.createElement('div');
            item.className = 'replacement-item';

            const sourceColorKey = `rgb(${sourceColor[0]}, ${sourceColor[1]}, ${sourceColor[2]})`;
            
            // 检查替换颜色是否是透明颜色
            const isTransparentReplacement = replacementColor.length === 4 && replacementColor[3] === 0;
            const replacementColorKey = isTransparentReplacement ? 'transparent' : `rgb(${replacementColor[0]}, ${replacementColor[1]}, ${replacementColor[2]})`;

            const sourceColorInfo = COLOR_INFO[sourceColorKey] || { name: 'Unknown', isPaid: false };
            
            let sourceDisplayName = sourceColorInfo.name;
            if (sourceColorInfo.name === 'Salmon') {
                sourceDisplayName = 'Salmon【三文鱼、肉意思】';
            }
            sourceDisplayName += sourceColorInfo.isPaid ? ' ★' : '';

            let replacementDisplayName;
            if (isTransparentReplacement) {
                replacementDisplayName = t.transparentColor || 'Transparent';
            } else {
                const replacementColorInfo = COLOR_INFO[replacementColorKey] || { name: 'Unknown', isPaid: false };
                replacementDisplayName = replacementColorInfo.name;
                if (replacementColorInfo.name === 'Salmon') {
                    replacementDisplayName = 'Salmon【三文鱼、肉意思】';
                }
                replacementDisplayName += replacementColorInfo.isPaid ? ' ★' : '';
            }

            item.innerHTML = `
                <div class="replacement-mapping">
                    <div class="color-preview" style="background-color: ${sourceColorKey};"></div>
                    <span>${sourceDisplayName}</span>
                    <span class="replacement-arrow">→</span>
                    <div class="color-preview" style="background-color: ${replacementColorKey}; ${isTransparentReplacement ? 'background: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%); background-size: 10px 10px; background-position: 0 0, 0 5px, 5px -5px, -5px 0px; background-color: white;' : ''}"></div>
                    <span>${replacementDisplayName}</span>
                </div>
                <button class="remove-replacement-btn" data-source="${sourceColorStr}">${t.remove || 'Remove'}</button>
            `;

            const removeBtn = item.querySelector('.remove-replacement-btn');
            removeBtn.addEventListener('click', () => {
                state.colorReplacements.delete(sourceColorStr);
                updateReplacementList();
                smartUpdatePreview();
            });

            replacementItems.appendChild(item);
        });
    }

    function applyColorReplacements(imageData) {
        const newData = new Uint8ClampedArray(imageData.data.length);

        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const a = imageData.data[i + 3];

            const colorKey = JSON.stringify([r, g, b]);

            if (state.colorReplacements.has(colorKey)) {
                const replacementColor = state.colorReplacements.get(colorKey);
                
                // 检查是否是透明颜色（数组长度为4且第4个元素为0）
                const isTransparent = replacementColor.length === 4 && replacementColor[3] === 0;
                
                if (isTransparent) {
                    // 设置为完全透明
                    newData[i] = 0;
                    newData[i + 1] = 0;
                    newData[i + 2] = 0;
                    newData[i + 3] = 0;
                } else {
                    // 正常颜色替换
                    newData[i] = replacementColor[0];
                    newData[i + 1] = replacementColor[1];
                    newData[i + 2] = replacementColor[2];
                    newData[i + 3] = a;
                }
            } else {
                newData[i] = r;
                newData[i + 1] = g;
                newData[i + 2] = b;
                newData[i + 3] = a;
            }
        }

        return new ImageData(newData, imageData.width, imageData.height);
    }

    // ==================== 抖动算法实现 ====================
    function applyErrorDither(imageData, palette, strength, kernel, isLocked) {
        const originalWidth = imageData.width;
        const originalHeight = imageData.height;
        const ditherScale = state.ditherScale || 1;

        const downsampledWidth = Math.max(1, Math.floor(originalWidth / ditherScale));
        const downsampledHeight = Math.max(1, Math.floor(originalHeight / ditherScale));

        const downsampledData = new Float32Array(downsampledWidth * downsampledHeight * 4);

        for (let y = 0; y < downsampledHeight; y++) {
            for (let x = 0; x < downsampledWidth; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;

                for (let dy = 0; dy < ditherScale; dy++) {
                    for (let dx = 0; dx < ditherScale; dx++) {
                        const srcX = x * ditherScale + dx;
                        const srcY = y * ditherScale + dy;

                        if (srcX < originalWidth && srcY < originalHeight) {
                            const srcIndex = (srcY * originalWidth + srcX) * 4;
                            r += imageData.data[srcIndex];
                            g += imageData.data[srcIndex + 1];
                            b += imageData.data[srcIndex + 2];
                            a += imageData.data[srcIndex + 3];
                            count++;
                        }
                    }
                }

                if (count > 0) {
                    const downsampledIndex = (y * downsampledWidth + x) * 4;
                    downsampledData[downsampledIndex] = r / count;
                    downsampledData[downsampledIndex + 1] = g / count;
                    downsampledData[downsampledIndex + 2] = b / count;
                    downsampledData[downsampledIndex + 3] = a / count;
                }
            }
        }

        const fullPalette = state.quantizedPalette;
        const selectedColorSet = new Set();
        if (isLocked && fullPalette && fullPalette.length > 0) {
            state.selectedFreeColors.forEach(colorStr => selectedColorSet.add(colorStr));
            state.selectedPaidColors.forEach(colorStr => selectedColorSet.add(colorStr));
        }

        for (let y = 0; y < downsampledHeight; y++) {
            for (let x = 0; x < downsampledWidth; x++) {
                const i = (y * downsampledWidth + x) * 4;
                const oldColor = [downsampledData[i], downsampledData[i+1], downsampledData[i+2]];
                const originalAlpha = downsampledData[i+3];

                if (originalAlpha < 128) {
                    downsampledData[i] = 0;
                    downsampledData[i+1] = 0;
                    downsampledData[i+2] = 0;
                    downsampledData[i+3] = 0;
                    continue;
                }

                if (isLocked && fullPalette && fullPalette.length > 0) {
                    const selectedColorsArray = Array.from(selectedColorSet).map(colorStr => JSON.parse(colorStr));
                    if (selectedColorsArray.length > 0) {
                        const originalQuantizedColor = findClosestColor(oldColor, fullPalette);

                        if (!selectedColorSet.has(JSON.stringify(originalQuantizedColor))) {
                            downsampledData[i] = 0;
                            downsampledData[i+1] = 0;
                            downsampledData[i+2] = 0;
                            downsampledData[i+3] = 0;
                            continue;
                        }
                    } else {
                        downsampledData[i] = 0;
                        downsampledData[i+1] = 0;
                        downsampledData[i+2] = 0;
                        downsampledData[i+3] = 0;
                        continue;
                    }
                }

                const newColor = findClosestColor(oldColor, palette);
                downsampledData[i] = newColor[0];
                downsampledData[i+1] = newColor[1];
                downsampledData[i+2] = newColor[2];
                downsampledData[i+3] = originalAlpha;

                if (strength > 0 && kernel) {
                    const error = [
                        (oldColor[0] - newColor[0]) * strength,
                        (oldColor[1] - newColor[1]) * strength,
                        (oldColor[2] - newColor[2]) * strength,
                    ];

                    for (const [pos, factor] of kernel) {
                        const [dx, dy] = pos;
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < downsampledWidth && ny >= 0 && ny < downsampledHeight) {
                            const ni = (ny * downsampledWidth + nx) * 4;
                            downsampledData[ni]   += error[0] * factor;
                            downsampledData[ni+1] += error[1] * factor;
                            downsampledData[ni+2] += error[2] * factor;
                        }
                    }
                }
            }
        }

        const outputData = new Uint8ClampedArray(originalWidth * originalHeight * 4);

        for (let y = 0; y < originalHeight; y++) {
            for (let x = 0; x < originalWidth; x++) {
                const downsampledX = Math.floor(x / ditherScale);
                const downsampledY = Math.floor(y / ditherScale);

                if (downsampledX < downsampledWidth && downsampledY < downsampledHeight) {
                    const downsampledIndex = (downsampledY * downsampledWidth + downsampledX) * 4;
                    const outputIndex = (y * originalWidth + x) * 4;

                    outputData[outputIndex] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex])));
                    outputData[outputIndex + 1] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 1])));
                    outputData[outputIndex + 2] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 2])));
                    outputData[outputIndex + 3] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 3])));
                }
            }
        }

        return new ImageData(outputData, originalWidth, originalHeight);
    }

    function applyOrderedDither(imageData, palette, strength, bayerMatrix, isLocked) {
        const originalWidth = imageData.width;
        const originalHeight = imageData.height;
        const ditherScale = state.ditherScale || 1;

        const downsampledWidth = Math.max(1, Math.floor(originalWidth / ditherScale));
        const downsampledHeight = Math.max(1, Math.floor(originalHeight / ditherScale));

        const downsampledData = new Float32Array(downsampledWidth * downsampledHeight * 4);

        for (let y = 0; y < downsampledHeight; y++) {
            for (let x = 0; x < downsampledWidth; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;

                for (let dy = 0; dy < ditherScale; dy++) {
                    for (let dx = 0; dx < ditherScale; dx++) {
                        const srcX = x * ditherScale + dx;
                        const srcY = y * ditherScale + dy;

                        if (srcX < originalWidth && srcY < originalHeight) {
                            const srcIndex = (srcY * originalWidth + srcX) * 4;
                            r += imageData.data[srcIndex];
                            g += imageData.data[srcIndex + 1];
                            b += imageData.data[srcIndex + 2];
                            a += imageData.data[srcIndex + 3];
                            count++;
                        }
                    }
                }

                if (count > 0) {
                    const downsampledIndex = (y * downsampledWidth + x) * 4;
                    downsampledData[downsampledIndex] = r / count;
                    downsampledData[downsampledIndex + 1] = g / count;
                    downsampledData[downsampledIndex + 2] = b / count;
                    downsampledData[downsampledIndex + 3] = a / count;
                }
            }
        }

        const n = bayerMatrix.length;
        const bayerFactor = 255 / (n * n);
        const fullPalette = state.quantizedPalette;

        const selectedColorSet = new Set();
        if (isLocked && fullPalette && fullPalette.length > 0) {
            state.selectedFreeColors.forEach(colorStr => selectedColorSet.add(colorStr));
            state.selectedPaidColors.forEach(colorStr => selectedColorSet.add(colorStr));
        }

        for (let y = 0; y < downsampledHeight; y++) {
            for (let x = 0; x < downsampledWidth; x++) {
                const i = (y * downsampledWidth + x) * 4;
                const oldColor = [downsampledData[i], downsampledData[i+1], downsampledData[i+2]];
                const originalAlpha = downsampledData[i+3];

                if (originalAlpha < 128) {
                    downsampledData[i] = 0;
                    downsampledData[i+1] = 0;
                    downsampledData[i+2] = 0;
                    downsampledData[i+3] = 0;
                    continue;
                }

                if (isLocked && fullPalette && fullPalette.length > 0) {
                    const selectedColorsArray = Array.from(selectedColorSet).map(colorStr => JSON.parse(colorStr));
                    if (selectedColorsArray.length > 0) {
                        const originalQuantizedColor = findClosestColor(oldColor, fullPalette);

                        if (!selectedColorSet.has(JSON.stringify(originalQuantizedColor))) {
                            downsampledData[i] = 0;
                            downsampledData[i+1] = 0;
                            downsampledData[i+2] = 0;
                            downsampledData[i+3] = 0;
                            continue;
                        }
                    } else {
                        downsampledData[i] = 0;
                        downsampledData[i+1] = 0;
                        downsampledData[i+2] = 0;
                        downsampledData[i+3] = 0;
                        continue;
                    }
                }

                const threshold = (bayerMatrix[y % n][x % n] - n*n/2) * bayerFactor * strength * 0.2;
                const r = downsampledData[i] + threshold;
                const g = downsampledData[i+1] + threshold;
                const b = downsampledData[i+2] + threshold;
                const closest = findClosestColor([r, g, b], palette);
                downsampledData[i] = closest[0];
                downsampledData[i+1] = closest[1];
                downsampledData[i+2] = closest[2];
                downsampledData[i+3] = originalAlpha;
            }
        }

        const outputData = new Uint8ClampedArray(originalWidth * originalHeight * 4);

        for (let y = 0; y < originalHeight; y++) {
            for (let x = 0; x < originalWidth; x++) {
                const downsampledX = Math.floor(x / ditherScale);
                const downsampledY = Math.floor(y / ditherScale);

                if (downsampledX < downsampledWidth && downsampledY < downsampledHeight) {
                    const downsampledIndex = (downsampledY * downsampledWidth + downsampledX) * 4;
                    const outputIndex = (y * originalWidth + x) * 4;

                    outputData[outputIndex] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex])));
                    outputData[outputIndex + 1] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 1])));
                    outputData[outputIndex + 2] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 2])));
                    outputData[outputIndex + 3] = Math.round(Math.max(0, Math.min(255, downsampledData[downsampledIndex + 3])));
                }
            }
        }

        return new ImageData(outputData, originalWidth, originalHeight);
    }

    // ==================== 移动端触摸事件处理 ====================
    let touchState = {
        isTouching: false,
        lastTouchX: 0,
        lastTouchY: 0,
        lastDistance: 0,
        isPinching: false
    };

    function handleTouchStart(e) {
        // 在颜色选择模式下，允许点击事件传播
        if (state.colorPickerMode) {
            return; // 不阻止事件，让 canvas 的 click 事件处理
        }

        e.preventDefault();

        if (e.touches.length === 1) {
            // 单指触摸 - 平移
            touchState.isTouching = true;
            touchState.isPinching = false;
            touchState.lastTouchX = e.touches[0].clientX;
            touchState.lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            // 双指触摸 - 缩放
            touchState.isTouching = true;
            touchState.isPinching = true;
            touchState.lastDistance = getTouchDistance(e.touches[0], e.touches[1]);
        }
    }

    function handleTouchMove(e) {
        // 在颜色选择模式下，允许触摸事件传播
        if (state.colorPickerMode) {
            return;
        }

        e.preventDefault();

        if (!touchState.isTouching) return;

        if (e.touches.length === 1 && !touchState.isPinching) {
            // 单指平移
            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;

            const dx = touchX - touchState.lastTouchX;
            const dy = touchY - touchState.lastTouchY;

            state.panX += dx;
            state.panY += dy;

            touchState.lastTouchX = touchX;
            touchState.lastTouchY = touchY;

            updateTransform();
        } else if (e.touches.length === 2 && touchState.isPinching) {
            // 双指缩放
            const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
            const oldZoom = state.zoom;

            // 计算缩放比例
            const scaleFactor = currentDistance / touchState.lastDistance;
            state.zoom *= scaleFactor;
            state.zoom = Math.max(0.2, Math.min(5, state.zoom));

            // 计算双指中心点
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            const rect = viewport.getBoundingClientRect();
            const mouseX = centerX - rect.left;
            const mouseY = centerY - rect.top;

            // 调整平移以保持缩放中心点
            state.panX = mouseX - (mouseX - state.panX) * (state.zoom / oldZoom);
            state.panY = mouseY - (mouseY - state.panY) * (state.zoom / oldZoom);

            // 更新缩放滑块
            zoomSlider.value = Math.round(state.zoom * 100);
            const zoomValueEl = document.getElementById('zoom-value');
            if (zoomValueEl) zoomValueEl.textContent = `${Math.round(state.zoom * 100)}%`;

            touchState.lastDistance = currentDistance;
            updateTransform();
        }
    }

    function handleTouchEnd(e) {
        touchState.isTouching = false;
        touchState.isPinching = false;
    }

    // Canvas 触摸结束事件（用于颜色选择）
    function handleCanvasTouchEnd(e) {
        if (!state.colorPickerMode) return;
        
        // 触发点击事件
        const touch = e.changedTouches[0];
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        previewCanvas.dispatchEvent(clickEvent);
    }

    function getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ==================== 移动端可拖动分隔条 ====================
    function initMobileResizer() {
        const resizer = document.getElementById('mobile-resizer');
        const previewPanel = document.getElementById('preview-panel');
        const controlsPanel = document.getElementById('controls-panel');
        const mainContainer = document.querySelector('.main-container');

        if (!resizer || !previewPanel || !controlsPanel) return;

        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        function handleResizeStart(e) {
            e.preventDefault();
            isResizing = true;
            startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            startHeight = previewPanel.offsetHeight;
            resizer.style.background = 'var(--primary-color)';
        }

        function handleResize(e) {
            if (!isResizing) return;
            e.preventDefault();

            const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = currentY - startY;
            const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, startHeight + deltaY));

            previewPanel.style.flex = `0 0 ${newHeight}px`;

            // 更新缩放和居中
            if (state.inputImage) {
                setTimeout(() => {
                    centerImage();
                }, 10);
            }
        }

        function handleResizeEnd() {
            isResizing = false;
            resizer.style.background = '';
        }

        // 鼠标事件
        resizer.addEventListener('mousedown', handleResizeStart);
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', handleResizeEnd);

        // 触摸事件
        resizer.addEventListener('touchstart', handleResizeStart, { passive: false });
        document.addEventListener('touchmove', handleResize, { passive: false });
        document.addEventListener('touchend', handleResizeEnd);
    }

    // --- Start the app ---
    init();

    // 清理 Web Worker
    window.addEventListener('beforeunload', function() {
        if (ditherWorker) {
            ditherWorker.terminate();
            ditherWorker = null;
        }
    });
});
