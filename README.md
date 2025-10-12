# exfat-reader

一个用于读取 exFAT 镜像（image）的轻量工具库，支持列目录、判断存在与读取文件。

- **运行环境**: Node.js >= 20
- **包管理器**: pnpm (建议)，亦可使用 npm/yarn
- **模块格式**: 提供 ESM 与 CJS 构建产物，内置类型声明（`.d.ts`）

## 安装

```bash
# pnpm
pnpm add exfat-reader

# npm
npm i exfat-reader

# yarn
yarn add exfat-reader
```

## 快速开始

传入 exFAT 镜像的二进制数据（`Uint8Array` 或 `ArrayBuffer`）。

```ts
// ESM
import { ExfatReader, createExfatReader } from "exfat-reader";

// 假设你已经以某种方式获取了 exFAT 镜像的二进制数据
// 例如：从文件、网络、Buffer 等转换为 Uint8Array 或 ArrayBuffer
const imageUint8 = new Uint8Array(/* ... */);

// 方式一：使用类
const reader = new ExfatReader(imageUint8);

// 方式二：工厂函数
// const reader = createExfatReader(imageUint8);

// 列出根目录
const listRoot = reader.list("/");
console.log(listRoot);

// 判断路径是否存在（文件或目录）
console.log(reader.exists("/Documents"));

// 读取文件
const data = reader.readFile("/hello.txt");
if (data) {
  // data 是 Uint8Array，按需转为字符串或写入文件等
  console.log("file size:", data.byteLength);
}
```

### CommonJS 用法

```js
// CJS
const { ExfatReader, createExfatReader } = require("exfat-reader");

const imageUint8 = new Uint8Array(/* ... */);
const reader = new ExfatReader(imageUint8);
console.log(reader.list("/"));
```

## 许可

本项目使用 MIT 许可，详见 `LICENSE` 文件。
