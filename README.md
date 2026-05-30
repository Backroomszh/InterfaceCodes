# 后室中文数据库站点界面代码库

本项目用于管理后室中文数据库站点的 MediaWiki 界面代码（小工具/全局样式/全局脚本），通过自动化构建与部署流水线将本地代码推送至站点。

## 环境准备

```bash
pnpm install
```

## 目录结构

```
├── scripts/                 # 构建与部署脚本
│   ├── run.ts               # 入口，解析 --mode 参数
│   ├── build/               # 构建模块
│   │   ├── index.ts         # 导出 build
│   │   ├── build.ts         # 构建逻辑（编译 JS/TS/CSS、生成定义文件）
│   │   └── definition.ts    # 解析 definition.yaml 并生成 Gadgets-definition
│   ├── deploy/              # 部署模块
│   │   ├── index.ts         # 导出 deploy
│   │   ├── deploy.ts        # 通过 mwn bot 将构建产物推送到站点
│   │   └── utils.ts         # 文件哈希计算与变更检测
│   └── types/               # TypeScript 类型定义
├── src/
│   ├── gadgets/             # 小工具目录
│   │   ├── Gadgets-definition-list.yaml   # 小工具分组与排序
│   │   └── <gadget-name>/   # 每个小工具一个独立文件夹
│   └── global/              # 全局脚本/样式
├── dist/                    # 构建产物（自动生成，勿手动修改）
└── .github/workflows/       # CI/CD 流水线
```

## 修改配置

### 小工具定义 (definition.yaml)

每个小工具在 `src/gadgets/<小工具名称>/` 下有一个 `definition.yaml`，控制其加载行为。VS Code 中编辑时有 JSON Schema 校验与自动补全。主要字段：

| 字段             | 类型                     | 说明                                                                |
| ---------------- | ------------------------ | ------------------------------------------------------------------- |
| `ResourceLoader` | boolean                  | 通常为 `true`                                                       |
| `hidden`         | boolean                  | 是否在参数设置中隐藏                                                |
| `default`        | boolean                  | 是否默认启用                                                        |
| `type`           | `"general"` / `"styles"` | `general` 为普通型（加载 JS+CSS），`styles` 为纯 CSS 型             |
| `rights`         | string[]                 | 所需用户权限，无权限要求则留空数组 `[]`                             |
| `dependencies`   | string[]                 | 依赖的 ResourceLoader 模块（如 `mediawiki.api`），无依赖则留空 `[]` |
| `skins`          | string[]                 | 限定皮肤（如 `vector-2022`、`citizen`），空数组则不限制             |
| `actions`        | string[]                 | 限定操作页面（如 `edit`、`delete`），空数组则不限制                 |
| `namespaces`     | number[]                 | 限定命名空间，空数组则不限制                                        |
| `peers`          | string[]                 | 只加载 CSS 部分的依赖小工具                                         |
| `package`        | boolean                  | 是否作为可被 `require` 加载的包                                     |
| `enable`         | boolean                  | 是否启用此小工具                                                    |
| `files`          | string[]                 | 需包含的源码文件（文件名以 `Gadget-` 开头）                         |

### 小工具列表 (Gadgets-definition-list.yaml)

`src/gadgets/Gadgets-definition-list.yaml` 控制小工具在参数设置界面的分组与显示顺序。修改时添加或调整 `gadgets` 数组中的小工具名称即可：

```yaml
- section: User # 分区名称
  gadgets:
      - Navigation_popups # 引用小工具的文件夹名称
      - whoisactive
```

## 新建小工具

1. 在 `src/gadgets/` 下创建以该小工具命名的文件夹（推荐小驼峰命名）

2. 在文件夹内创建源码文件和 `definition.yaml`，例如：

    ```
    src/gadgets/myGadget/
    ├── definition.yaml
    └── Gadget-myGadget.js     # 文件名必须以 Gadget- 开头
    ```

3. 编写 `definition.yaml`：

    ```yaml
    ResourceLoader: true
    hidden: false
    default: false
    type: general
    rights: []
    dependencies: []
    enable: true
    files:
        - Gadget-myGadget.js
    ```

4. 在 `src/gadgets/Gadgets-definition-list.yaml` 中对应的分区下添加该小工具的文件夹名称。

5. 运行构建验证：

    ```bash
    pnpm run build
    ```

## 构建与部署

CI/CD 通过 GitHub Actions 自动执行：向 `main` 分支推送时触发 `pnpm run deploy`，凭据通过仓库 Secrets 注入。

## 辅助命令

```bash
pnpm run fmt          # 格式化代码（oxfmt）
pnpm run lint:dev     # ESLint 检查 scripts 目录
```
