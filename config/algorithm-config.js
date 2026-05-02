// 抖动算法配置
const ALGORITHM_CONFIG = {
    // 默认算法
    defaultAlgorithm: 'No Dithering',

    // 误差扩散抖动核
    errorDiffusionKernels: {
        FloydSteinberg: [
            [[1, 0], 7/16],
            [[-1, 1], 3/16],
            [[0, 1], 5/16],
            [[1, 1], 1/16]
        ],
        JarvisJudiceNinke: [
            [[1, 0], 7/48], [[2, 0], 5/48],
            [[-2, 1], 3/48], [[-1, 1], 5/48], [[0, 1], 7/48], [[1, 1], 5/48], [[2, 1], 3/48],
            [[-2, 2], 1/48], [[-1, 2], 3/48], [[0, 2], 5/48], [[1, 2], 3/48], [[2, 2], 1/48]
        ],
        Stucki: [
            [[1, 0], 8/42], [[2, 0], 4/42],
            [[-2, 1], 2/42], [[-1, 1], 4/42], [[0, 1], 8/42], [[1, 1], 4/42], [[2, 1], 2/42],
            [[-2, 2], 1/42], [[-1, 2], 2/42], [[0, 2], 4/42], [[1, 2], 2/42], [[2, 2], 1/42]
        ],
        Atkinson: [
            [[1, 0], 1/8], [[2, 0], 1/8],
            [[-1, 1], 1/8], [[0, 1], 1/8], [[1, 1], 1/8],
            [[0, 2], 1/8]
        ],
        Burkes: [
            [[1, 0], 8/32], [[2, 0], 4/32],
            [[-2, 1], 2/32], [[-1, 1], 4/32], [[0, 1], 8/32], [[1, 1], 4/32], [[2, 1], 2/32]
        ],
        Sierra3: [
            [[1, 0], 5/32], [[2, 0], 3/32],
            [[-2, 1], 2/32], [[-1, 1], 4/32], [[0, 1], 5/32], [[1, 1], 4/32], [[2, 1], 2/32]
        ],
        Sierra2: [
            [[1, 0], 4/16], [[2, 0], 3/16],
            [[-1, 1], 2/16], [[0, 1], 3/16], [[1, 1], 2/16],
            [[-1, 2], 1/16], [[0, 2], 1/16]
        ],
        SierraLite: [
            [[1, 0], 2/4],
            [[-1, 1], 1/4],
            [[0, 1], 1/4]
        ]
    },

    // Bayer 有序抖动矩阵
    bayerMatrices: {
        Bayer4x4: [
            [0, 8, 2, 10],
            [12, 4, 14, 6],
            [3, 11, 1, 9],
            [15, 7, 13, 5]
        ],
        Bayer8x8: [
            [0, 32, 8, 40, 2, 34, 10, 42],
            [48, 16, 56, 24, 50, 18, 58, 26],
            [12, 44, 4, 36, 14, 46, 6, 38],
            [60, 28, 52, 20, 62, 30, 54, 22],
            [3, 35, 11, 43, 1, 33, 9, 41],
            [51, 19, 59, 27, 49, 17, 57, 25],
            [15, 47, 7, 39, 13, 45, 5, 37],
            [63, 31, 55, 23, 61, 29, 53, 21]
        ]
    },

    // 算法定义（由上面的配置组合而成）
    algorithms: {
        'No Dithering': { type: 'error', kernel: null },
        'Floyd Steinberg': { type: 'error', kernel: null }, // 将在初始化时填充
        'Jarvis Judice Ninke': { type: 'error', kernel: null },
        'Stucki': { type: 'error', kernel: null },
        'Burkes': { type: 'error', kernel: null },
        'Atkinson': { type: 'error', kernel: null },
        'Sierra3': { type: 'error', kernel: null },
        'Sierra2': { type: 'error', kernel: null },
        'SierraLite': { type: 'error', kernel: null },
        'Bayer2x2': { type: 'ordered', matrix: [[0, 2], [3, 1]] },
        'Bayer4x4': { type: 'ordered', matrix: null }, // 将在初始化时填充
        'Bayer8x8': { type: 'ordered', matrix: null }, // 将在初始化时填充
        'Ordered3x3': { type: 'ordered', matrix: [[0, 7, 3], [6, 5, 2], [4, 1, 8]] }
    },

    // 初始化函数：将配置组合到算法定义中
    initialize() {
        // 填充误差扩散算法的核
        this.algorithms['Floyd Steinberg'].kernel = this.errorDiffusionKernels.FloydSteinberg;
        this.algorithms['Jarvis Judice Ninke'].kernel = this.errorDiffusionKernels.JarvisJudiceNinke;
        this.algorithms['Stucki'].kernel = this.errorDiffusionKernels.Stucki;
        this.algorithms['Burkes'].kernel = this.errorDiffusionKernels.Burkes;
        this.algorithms['Atkinson'].kernel = this.errorDiffusionKernels.Atkinson;
        this.algorithms['Sierra3'].kernel = this.errorDiffusionKernels.Sierra3;
        this.algorithms['Sierra2'].kernel = this.errorDiffusionKernels.Sierra2;
        this.algorithms['SierraLite'].kernel = this.errorDiffusionKernels.SierraLite;

        // 填充 Bayer 矩阵
        this.algorithms['Bayer4x4'].matrix = this.bayerMatrices.Bayer4x4;
        this.algorithms['Bayer8x8'].matrix = this.bayerMatrices.Bayer8x8;

        return this.algorithms;
    }
};
