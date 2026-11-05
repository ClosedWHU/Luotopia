# Luotopia-Toolkit snapshot

`parsers.json` 是私有 `ClosedWHU/Luotopia-Toolkit` 的固定版本构建产物。
包含 parser 源码、契约和测试向量，源码沿用 AGPL-3.0-or-later（本仓库 LICENSE）。

唯一编辑源：Toolkit 仓库。不要手改此文件或生成的
`public/hot-update/scripts/score-parser.js` 和 `course-parser.js`。

更新：checkout Toolkit 固定 commit，`npm ci && npm test && npm run bundle`，然后：

```sh
node tools/sync-toolkit.mjs ../Luotopia-Toolkit/dist/parsers.json
npm run hot-update:verify-scripts
```

提交 snapshot + 生成的脚本。生成器会检查二者一致，普通构建无需私有仓库授权。
smoke vector 来自此快照；其余 parser 在各自迁移前继续由原生成器管理。

这次只迁移源码归属，不搬动 R2 对象、不修改下载 URL/签名协议。
当前 checkout 的 R2 handler 服务 manifest/模型目录，脚本仍经静态资源路径；
若生产环境另有 R2 路由，以实际部署为准。两种分发都应使用同一构建产物。
