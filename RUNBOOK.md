# RUNBOOK — do you eat 运行说明

> 本文件是项目的「怎么跑起来」存档（Day 7 第 5 步产出）。
> 换电脑、换同学、隔了几周回来，照着这份文档都能把项目跑起来。

## 一、项目是什么

「do you eat（今天吃啥）」：帮大学生解决"今天吃什么"选择困难的抽卡网页。
纯前端、免登录、免安装，评分数据存在用户自己的浏览器（localStorage）里。

- 技术栈：React 18 + Vite 5 + TypeScript 5
- 架构文档：`TECH_DESIGN.md`；产品需求：`PRD.md`；竞品调研：`research.md`

## 二、环境要求

| 依赖 | 最低版本 | 查看命令 |
|---|---|---|
| Node.js | 18（建议 20+） | `node -v` |
| npm | 9+（随 Node 自带） | `npm -v` |
| Git | 任意较新版本 | `git --version` |

> 不需要全局安装任何其他东西，所有依赖都在 `package.json` 里，`npm install` 一次装齐。

## 三、首次运行（三步）

```bash
# 1. 克隆（已有本地目录可跳过）
git clone git@github.com:XingHo-VibeCoding/do-you-eat.git
cd do-you-eat

# 2. 安装依赖（首次约 1~2 分钟，只用在拉取后 / 依赖变更后执行）
npm install

# 3. 启动开发服务器
npm run dev
```

启动成功后终端会显示：

```
  VITE v5.4.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

浏览器打开 **http://localhost:5173/** 即可使用。
修改代码会自动热更新（HMR），不用手动刷新。

## 四、日常命令速查

| 命令 | 作用 | 什么时候用 |
|---|---|---|
| `npm run dev` | 启动本地开发服务器（端口 5173） | 每次开发 |
| `npm run build` | 类型检查 + 生产构建，产物在 `dist/` | 每次提交前（项目规则强制） |
| `npm run preview` | 本地预览 `dist/` 构建产物 | 检查打包后是否正常 |

## 五、目录结构

```
do-you-eat/
├── index.html              # Vite 入口（页面壳）
├── package.json            # 依赖与脚本清单
├── vite.config.ts          # Vite 配置（React 插件、base 路径）
├── tsconfig.json           # TypeScript 编译规则
├── src/
│   ├── main.tsx            # 应用挂载入口
│   ├── App.tsx             # 三态状态机（idle → rolling → result）
│   ├── vite-env.d.ts       # Vite 环境类型声明
│   ├── types/food.ts       # Food / UserRating 等类型定义
│   ├── data/foods.ts       # 内置食物库（24 条）
│   ├── services/storage.ts # ⚠️ 评分读写唯一出口（localStorage）
│   ├── lib/
│   │   ├── gacha.ts        # pickRandom 抽卡纯函数
│   │   ├── rating.ts       # 评分展示逻辑
│   │   └── constants.ts    # 文案与常量
│   ├── components/         # UI 组件
│   │   ├── GachaButton.tsx
│   │   ├── ResultCard.tsx
│   │   ├── StarRating.tsx
│   │   └── IntroHint.tsx
│   └── styles/app.css      # 全局样式 + 抽卡动画
└── dist/                   # 构建产物（不进 git）
```

## 六、项目专属纪律（写在这里防止忘）

1. **评分读写只能走 `src/services/storage.ts`**，组件里禁止直接写
   `localStorage.getItem/setItem`（AGENTS.md 第八节规则 1）。
2. **文件名 / 标识符用英文小写，注释和界面文案用中文**（规则 2）。
3. **改完代码必须跑 `npm run build` 并确认通过**才算完成（规则 3）。

## 七、常见问题

**Q：`npm run dev` 报端口被占用？**
Vite 会自动换端口（5174、5175…），看终端实际输出的地址即可。

**Q：评分不见了？**
评分存在当前浏览器 profile 的 localStorage 里。换浏览器、清缓存、无痕模式都会看不到，这是预期行为（无后端设计，见 TECH_DESIGN.md）。

**Q：`npm install` 很慢或失败？**
换国内镜像：`npm install --registry=https://registry.npmmirror.com`。

**Q：构建报类型错误？**
`npm run build` 的第一步就是 `tsc --noEmit`，报错信息里会带文件名和行号，按提示修类型即可。

## 八、部署（Day 7 尚未做，留给后续）

计划走 CloudBase 静态网站托管（见 TECH_DESIGN.md），届时把 `npm run build` 产出的
`dist/` 目录上传即可，本文件届时补充部署章节。
