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
        // 实时调整开关
        realtimeEnabled: true
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
    const brightnessValue = document.getElementById('brightness-value');
    const contrastValue = document.getElementById('contrast-value');
    const saturationValue = document.getElementById('saturation-value');
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

    // 像素悬浮提示框相关变量
    let pixelTooltip = null;
    let tooltipThrottleTimer = null;
    const TOOLTIP_THROTTLE_DELAY = 16; // 约60fps

    // --- Initialization ---
    function init() {
        // 初始化语言选择器
        const languageSelect = document.getElementById('language-select');
        languageSelect.addEventListener('change', (e) => {
            updateLanguage(e.target.value);
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
        if (resetImageAdjustmentsBtn) resetImageAdjustmentsBtn.addEventListener('click', resetImageAdjustments);
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
        if (h2Elements[4]) h2Elements[4].textContent = t.colorStats;

        const paletteTitles = document.querySelectorAll('.palette-title');
        if (paletteTitles[0]) paletteTitles[0].textContent = t.freePalette;
        if (paletteTitles[1]) paletteTitles[1].textContent = t.paidPalette;

        const inputText = document.getElementById('input-text');
        if (inputText) inputText.textContent = t.clickOrDrag;

        // 更新标签文本（不破坏input元素）
        const ditherStrengthLabel = document.getElementById('dither-strength-label');
        if (ditherStrengthLabel) ditherStrengthLabel.textContent = t.ditherStrength;

        const imageSizeLabel = document.getElementById('image-size-label');
        if (imageSizeLabel) imageSizeLabel.textContent = t.imageSize;

        const brightnessLabel = document.getElementById('brightness-label');
        if (brightnessLabel) brightnessLabel.textContent = t.brightness || 'Brightness';

        const contrastLabel = document.getElementById('contrast-label');
        if (contrastLabel) contrastLabel.textContent = t.contrast || 'Contrast';

        const saturationLabel = document.getElementById('saturation-label');
        if (saturationLabel) saturationLabel.textContent = t.saturation || 'Saturation';

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
        const imageProcessingTitle = document.querySelector('.experimental-section h3');
        if (imageProcessingTitle) imageProcessingTitle.textContent = t.imageProcessing || 'Image Processing (Experimental)';
        
        const resetBtn = document.getElementById('reset-image-adjustments');
        if (resetBtn) resetBtn.textContent = t.resetAdjustments || 'Reset All Adjustments';

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
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));     // R
            data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128)); // G
            data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128)); // B
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
        
        // 按顺序应用调整：亮度 -> 对比度 -> 饱和度
        imageData = adjustBrightness(imageData, state.brightness);
        imageData = adjustContrast(imageData, state.contrast);
        imageData = adjustSaturation(imageData, state.saturation);
        
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
     * 重置所有图片调整
     */
    function resetImageAdjustments() {
        state.brightness = 100;
        state.contrast = 100;
        state.saturation = 100;
        
        brightnessSlider.value = 100;
        contrastSlider.value = 100;
        saturationSlider.value = 100;
        
        const brightnessEl = document.getElementById('brightness-value');
        const contrastEl = document.getElementById('contrast-value');
        const saturationEl = document.getElementById('saturation-value');
        
        if (brightnessEl) brightnessEl.value = 100;
        if (contrastEl) contrastEl.value = 100;
        if (saturationEl) saturationEl.value = 100;
        
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

    function updatePreview() {
        if (!state.inputImage || !state.activePalette || state.activePalette.length === 0) {
            updateColorStats(null);
            return;
        }

        const newWidth = Math.round(state.originalWidth * state.imageSize);
        const newHeight = Math.round(state.originalHeight * state.imageSize);

        previewCanvas.width = newWidth;
        previewCanvas.height = newHeight;

        // 应用图片处理（亮度、对比度、饱和度）
        let sourceImageData;
        if (state.brightness !== 100 || state.contrast !== 100 || state.saturation !== 100) {
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
            processedImageData = applyErrorDither(sourceImageData, state.activePalette, state.ditherStrength, algo.kernel, state.isLocked);
        } else if (algo.type === 'ordered') {
            processedImageData = applyOrderedDither(sourceImageData, state.activePalette, state.ditherStrength, algo.matrix, state.isLocked);
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
        renderReplacementPalette(replacementFreeGrid, state.freeColors);
        renderReplacementPalette(replacementPaidGrid, state.paidColors);
    }

    function renderReplacementPalette(grid, colors) {
        grid.innerHTML = '';

        colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            swatch.dataset.color = JSON.stringify(color);

            const colorKey = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            const colorInfo = COLOR_INFO[colorKey] || { name: 'Unknown', isPaid: false };
            let displayName = colorInfo.name;
            if (colorInfo.name === 'Salmon') {
                displayName = 'Salmon【三文鱼、肉意思】';
            }
            displayName += colorInfo.isPaid ? ' ★' : '';

            const tooltip = document.createElement('span');
            tooltip.className = 'tooltip-text';
            tooltip.textContent = displayName;
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
        updatePreview();

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
        updatePreview();
        handleClearReplacement();
    }

    function updateReplacementList() {
        if (state.colorReplacements.size === 0) {
            replacementItems.innerHTML = '<p class="no-replacements">暂无颜色替换</p>';
            return;
        }

        replacementItems.innerHTML = '';

        state.colorReplacements.forEach((replacementColor, sourceColorStr) => {
            const sourceColor = JSON.parse(sourceColorStr);

            const item = document.createElement('div');
            item.className = 'replacement-item';

            const sourceColorKey = `rgb(${sourceColor[0]}, ${sourceColor[1]}, ${sourceColor[2]})`;
            const replacementColorKey = `rgb(${replacementColor[0]}, ${replacementColor[1]}, ${replacementColor[2]})`;

            const sourceColorInfo = COLOR_INFO[sourceColorKey] || { name: 'Unknown', isPaid: false };
            const replacementColorInfo = COLOR_INFO[replacementColorKey] || { name: 'Unknown', isPaid: false };

            let sourceDisplayName = sourceColorInfo.name;
            if (sourceColorInfo.name === 'Salmon') {
                sourceDisplayName = 'Salmon【三文鱼、肉意思】';
            }
            sourceDisplayName += sourceColorInfo.isPaid ? ' ★' : '';

            let replacementDisplayName = replacementColorInfo.name;
            if (replacementColorInfo.name === 'Salmon') {
                replacementDisplayName = 'Salmon【三文鱼、肉意思】';
            }
            replacementDisplayName += replacementColorInfo.isPaid ? ' ★' : '';

            item.innerHTML = `
                <div class="replacement-mapping">
                    <div class="color-preview" style="background-color: ${sourceColorKey};"></div>
                    <span>${sourceDisplayName}</span>
                    <span class="replacement-arrow">→</span>
                    <div class="color-preview" style="background-color: ${replacementColorKey};"></div>
                    <span>${replacementDisplayName}</span>
                </div>
                <button class="remove-replacement-btn" data-source="${sourceColorStr}">删除</button>
            `;

            const removeBtn = item.querySelector('.remove-replacement-btn');
            removeBtn.addEventListener('click', () => {
                state.colorReplacements.delete(sourceColorStr);
                updateReplacementList();
                updatePreview();
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
                newData[i] = replacementColor[0];
                newData[i + 1] = replacementColor[1];
                newData[i + 2] = replacementColor[2];
                newData[i + 3] = a;
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
});
