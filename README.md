# Wplace-Master

<div align="center">

**属于Wplace像素画创作与图像转换工具**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web-green.svg)](https://github.com/CoralHymn/Wplace-Master)

</div>

---

## 📜 版权声明

本项目基于三文鱼大佬的html文件进行二次开发与功能扩展。

- **源码**: 像素转换器算法源码[ColorDitherer](https://github.com/PRTSSourceCode/ColorDitherer) 
- **原网页制作者**: 【三文鱼、肉意思】【P.R.T.S Alliance】Discord群组
- **修改与功能扩展**: 【coralhymn】（和平之师）

感谢原作者的开源贡献，本项目在原有基础上添加了像素绘画工具、以及欠缺的移动端适配等新功能。

我没有原作者的github链接，原作者看到了请联系我，我在文档里加上你的github链接！！！！

---

## 📖 项目介绍

Wplace-Master 是一个功能完善的 Web 端像素图像处理工具，集成了**图像颜色转换**和**像素绘画**两大核心功能模块。

### 🎨 主要功能

#### 1. Wplace 颜色转换器（index.html）

将普通图片转换为符合 Wplace 调色板规范的像素画，支持多种抖动算法和颜色替换功能。

**核心特性：**
- **多调色板支持**：内置免费和付费两套调色板，可自由选择组合
- **多种抖动算法**：包含 Floyd-Steinberg、Stucki、Burkes、Atkinson、Sierra 等经典误差扩散算法，以及 Bayer 有序抖动
- **智能颜色映射**：自动将图片颜色匹配到最接近的调色板颜色
- **颜色选择与替换**：点击图像选择特定颜色，并替换为其他调色板颜色
- **参数调节**：支持调整抖动强度、抖动倍率、图片尺寸等参数
- **实时预览**：处理结果实时显示，支持缩放查看细节
- **颜色统计**：自动统计处理后各颜色的使用数量
- **多语言支持**：支持中文、英文、日文、俄文四种语言界面
- **导出功能**：支持导出处理后的 PNG 图片

#### 2. 在线像素绘画工具（pixel-draw.html）

专业的像素画创作工具，支持从基础绘制到高级图形工具的完整工作流程。

**核心特性：**
- **丰富的绘图工具**：
  - 铅笔工具：逐像素绘制
  - 橡皮擦：清除像素
  - 填充工具：区域 flood fill 填充
  - 取色器：从画布拾取颜色
  - 直线工具：绘制直线
  - 矩形工具：绘制矩形
  - 圆形工具：绘制圆形
- **完整的调色板**：包含免费和付费颜色，直观的颜色名称显示
- **撤销/重做**：支持多步操作历史回溯
- **网格显示**：可切换显示像素网格辅助线
- **画布控制**：
  - 自由缩放（20x - 500x）
  - 平移导航
  - 背景颜色切换（4种预设）
- **导入/导出**：
  - 支持导入外部图片作为底图
  - 导出为 PNG 格式
- **快捷键支持**：常用工具绑定键盘快捷键
- **移动端优化**：完整的触摸手势支持

---

## 🚀 部署方式

### 本地部署

本地部署非常简单，无需任何服务器环境：

1. 从 GitHub 下载本仓库的 ZIP 压缩包
2. 解压到本地任意文件夹
3. 双击 `index.html` 或 `pixel-draw.html` 即可在浏览器中打开使用

**注意**：建议使用 Chrome、Firefox、Edge 等现代浏览器以获得最佳体验。

### 网络部署（Cloudflare Workers）

通过 Cloudflare Workers 可以快速将项目部署到互联网上：

1. 克隆或下载本仓库代码
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
3. 进入 **Workers & Pages** 页面
4. 点击 **Create Application**
5. 选择 **Upload Assets** 方式
6. 上传本仓库的所有文件
7. 等待自动构建完成
8. 获得可公开访问的 URL

部署完成后，用户可以通过分配的域名直接在线使用，无需本地安装。

---

## ⚙️ 配置说明

项目采用模块化配置设计，所有配置文件位于 `config/` 目录下。

### 配置文件清单

| 文件 | 用途 |
|------|------|
| `config/palette-config.js` | 调色板图片和 UI 配置 |
| `config/algorithm-config.js` | 抖动算法定义和参数 |
| `config/language-config.js` | 多语言翻译文本 |
| `config/color-info.js` | 颜色名称和付费状态定义 |

### 常用配置修改

#### 修改默认语言

编辑 `config/language-config.js`：
```javascript
defaultLanguage: 'en'  // 可选: 'zh', 'ru', 'en', 'ja'
```

#### 添加新颜色

编辑 `config/color-info.js`：
```javascript
"rgb(128, 0, 128)": { name: "Purple", isPaid: false }
```

#### 修改默认算法

编辑 `config/algorithm-config.js`：
```javascript
defaultAlgorithm: 'Floyd Steinberg'
```

#### 修改主题样式

编辑 `css/style.css` 中的 CSS 变量：
```css
:root {
    --primary-color: #ff5722;
    --background-color: #fafafa;
}
```

详细配置说明请参考 [CONFIG-GUIDE.md](CONFIG-GUIDE.md)。

---

## 📱 移动端支持

项目已针对移动设备进行全面优化：

- **响应式布局**：自动适配手机、平板、桌面不同屏幕尺寸
- **触摸手势**：单指拖动、双指缩放、点击选择
- **触控优化**：按钮和控件尺寸符合移动端
- **横屏支持**：自动适应横屏模式
- **性能优化**：减少重绘，流畅的触摸响应

---

## 📂 项目结构

```
Pixel-Master/
├── index.html                  # 颜色转换器主页面
├── pixel-draw.html             # 像素绘画工具主页面
├── config/                     # 配置文件目录
│   ├── palette-config.js       # 调色板配置
│   ├── algorithm-config.js     # 算法配置
│   ├── language-config.js      # 多语言配置
│   └── color-info.js           # 颜色信息配置
├── css/                        # 样式文件目录
│   ├── style.css               # 转换器样式
│   └── pixel-draw.css          # 绘画工具样式
├── js/                         # JavaScript 文件目录
│   ├── app.js                  # 转换器主逻辑
│   └── pixel-draw.js           # 绘画工具主逻辑
├── CONFIG-GUIDE.md             # 配置指南
└── README.md                   # 项目说明文档
```

---

## 🛠️ 技术栈

- **前端框架**：原生 HTML5 + CSS3 + JavaScript (ES6+)
- **图像处理**：Canvas API
- **算法实现**：纯 JavaScript 实现的多种抖动算法
- **响应式设计**：CSS Media Queries + Flexbox/Grid
- **无依赖**：零第三方库依赖，轻量级设计


---

## 🤝 致谢

- **原始项目**：[ColorDitherer](https://github.com/PRTSSourceCode/ColorDitherer) - 提供核心的颜色转换功能
- **社区支持**：【P.R.T.S Alliance】Discord 群组
- **AI 辅助**：本项目部分功能由 AI 辅助开发完成

---

## 📄 许可证

本项目继承自 ColorDitherer 的开源精神，供学习和研究使用。请遵守原始项目的许可协议。

---

<div align="center">

**Made with ❤️ by 和平之师**

</div>
