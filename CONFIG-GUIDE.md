# Pixel-Master 配置说明

## 项目结构

```
Pixel-Master/
├── index.html              # 主 HTML 文件（精简版）
├── config/                 # 配置文件目录
│   ├── palette-config.js   # 调色板配置
│   ├── algorithm-config.js # 算法配置
│   ├── language-config.js  # 多语言配置
│   └── color-info.js       # 颜色信息配置
├── css/                    # 样式文件目录
│   └── style.css           # 主样式表
└── js/                     # JavaScript 文件目录
    └── app.js              # 主应用逻辑
```

## 配置文件说明

### 1. 调色板配置 (config/palette-config.js)

**用途**: 管理预设调色板和 UI 相关配置

**可修改内容**:
- `presets.free`: 免费调色板的 Base64 图片数据
- `presets.all`: 完整调色板（包含付费）的 Base64 图片数据
- `ui.panelWidth`: 控制面板宽度
- `ui.colorSwatchSize`: 颜色样本大小

**示例 - 修改面板宽度**:
```javascript
ui: {
    panelWidth: '600px',  // 改为 600px
    colorSwatchSize: '25px',
    colorSwatchBorderRadius: '5px'
}
```

### 2. 算法配置 (config/algorithm-config.js)

**用途**: 管理所有抖动算法和它们的参数

**可修改内容**:
- `defaultAlgorithm`: 默认选中的算法
- `errorDiffusionKernels`: 误差扩散抖动算法的核
- `bayerMatrices`: Bayer 有序抖动矩阵
- `algorithms`: 算法定义

**示例 - 添加新算法**:
```javascript
// 在 errorDiffusionKernels 中添加
MyCustomDither: [
    [[1, 0], 1/2],
    [[0, 1], 1/2]
]

// 在 algorithms 中添加
'My Custom Dither': { type: 'error', kernel: null }

// 在 initialize() 函数中关联
this.algorithms['My Custom Dither'].kernel = this.errorDiffusionKernels.MyCustomDither;
```

**示例 - 修改默认算法**:
```javascript
defaultAlgorithm: 'Floyd Steinberg'  // 改为 Floyd Steinberg
```

### 3. 多语言配置 (config/language-config.js)

**用途**: 管理所有界面文本的多语言翻译

**可修改内容**:
- `defaultLanguage`: 默认语言 ('zh', 'ru', 'en', 'ja')
- `supportedLanguages`: 支持的语言列表
- `translations`: 各语言的翻译文本

**示例 - 添加新语言（如韩语）**:
```javascript
supportedLanguages: [
    { code: 'zh', name: '中文' },
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' }  // 新增
],

translations: {
    // ... 现有语言
    ko: {  // 新增韩语翻译
        title: "더 나은 Wplace 색상 변환기",
        selectPalette: "1. 팔레트 선택",
        // ... 其他翻译
    }
}
```

**示例 - 修改默认语言**:
```javascript
defaultLanguage: 'en'  // 改为英语
```

### 4. 颜色信息配置 (config/color-info.js)

**用途**: 定义每个颜色的名称和是否付费

**可修改内容**:
- 颜色键值对: `"rgb(r, g, b)": { name: "颜色名", isPaid: true/false }`

**示例 - 添加新颜色**:
```javascript
"rgb(128, 0, 128)": { name: "Purple", isPaid: false },
"rgb(255, 192, 203)": { name: "Pink", isPaid: true }
```

**示例 - 修改颜色名称**:
```javascript
"rgb(0, 0, 0)": { name: "纯黑色", isPaid: false },  // 原来是 "Black"
```

**示例 - 修改颜色付费状态**:
```javascript
"rgb(170, 170, 170)": { name: "Medium Gray", isPaid: false },  // 从 true 改为 false
```

## 样式修改 (css/style.css)

**用途**: 管理所有界面样式

**常用修改**:

### 修改主题颜色
```css
:root {
    --primary-color: #ff5722;      /* 主色调 */
    --primary-hover: #e64a19;      /* 悬停颜色 */
    --background-color: #fafafa;   /* 背景色 */
    --surface-color: #ffffff;      /* 表面色 */
}
```

### 修改字体
```css
body {
    font-family: 'Microsoft YaHei', sans-serif;  /* 改为微软雅黑 */
}
```

### 修改面板宽度
```css
#controls-panel {
    width: 600px;  /* 改为 600px */
}
```

## 快速开始

1. 直接在浏览器中打开 `index.html` 即可使用
2. 要修改配置，编辑对应的配置文件后刷新页面

## 注意事项

1. **修改 Base64 调色板**: 需要先生成 PNG 图片的 Base64 编码
2. **添加新算法**: 需要了解抖动算法的原理
3. **修改颜色配置**: RGB 值必须与调色板中的颜色完全匹配
4. **CSS 变量**: 修改 `:root` 中的变量会影响全局样式

## 备份建议

在修改任何配置文件之前，建议先备份原文件，以便出现问题时可以恢复。
