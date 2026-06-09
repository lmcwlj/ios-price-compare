# iOS 代理工具比价脚本（京东 / 淘宝 / 天猫）

在 **Shadowrocket** 或 **Quantumult X** 中运行时，自动拦截京东/淘宝/天猫的商品详情请求，查询当前价格、折扣信息，并通过系统通知展示比价结果。

## 文件说明

| 文件 | 说明 |
|------|------|
| `jd_tb_price.js` | 比价脚本核心（兼容所有主流iOS代理工具） |
| `sr_price.conf` | Shadowrocket 配置片段（直接贴入配置文件） |
| `qx_price.conf` | Quantumult X 配置片段（直接贴入配置文件） |

## 快速开始

### 1. 部署脚本

将 `jd_tb_price.js` 上传到你的 GitHub/Gitee 仓库，或直接用下方的 Raw 链接。

### 2. 配置工具

#### Shadowrocket

打开 Shadowrocket → 配置 → 编辑纯文本 → 在 `[Script]` 区添加：

```
[Script]
http-response ^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=(wareBusiness|getWareBusiness|getDetail|getJdPrice) requires-body=1,max-size=-1,script-path=https://你的托管地址/jd_tb_price.js
http-response ^https?:\/\/(.+)?\.(taobao|tmall)\.com\/(.+)? requires-body=1,max-size=-1,script-path=https://你的托管地址/jd_tb_price.js

[MITM]
hostname = *.m.jd.com, *.taobao.com, *.tmall.com, api.m.jd.com
```

#### Quantumult X

打开 Quantumult X → 设置 → 配置文件 → 编辑 → 在 `[rewrite_local]` 和 `[mitm]` 区添加：

```
[rewrite_local]
^https?:\/\/api\.m\.jd\.com\/client\.action\?functionId=(wareBusiness|getWareBusiness|getDetail|getJdPrice) url script-response-body jd_tb_price.js
^https?:\/\/(.+)?\.(taobao|tmall)\.com\/(.+)? url script-response-body jd_tb_price.js

[mitm]
hostname = *.m.jd.com, *.taobao.com, *.tmall.com, api.m.jd.com
```

然后将 `jd_tb_price.js` 放入 Quantumult X 的 `Profiles/scripts/` 目录下。

### 3. 开启 MitM

- 确保在工具中启用了 **MitM**（中间人解密）
- 安装并信任 MitM 证书（iOS 设置 → 通用 → 关于本机 → 证书信任设置）

### 4. 开始使用

在 Safari 中打开京东或淘宝商品页面，等待几秒后会弹出通知显示比价信息。

## 功能特点

- ✅ 自动检测平台（京东 / 淘宝 / 天猫）
- ✅ 自动提取商品 ID
- ✅ 查询当前价格、原价、折扣比例
- ✅ 系统通知推送比价结果
- ✅ 响应体注入比价元数据
- ✅ 兼容几乎所有主流 iOS 代理工具

## 注意事项

- 部分京东接口需要登录态 Cookie 才能获取完整价格数据（可先在 Safari 登录京东）
- 淘宝的价格接口存在访问频率限制，频繁刷新可能暂时失效
- 跨平台比价功能需要接入第三方 API，当前版本为框架演示
- 脚本运行需保持 MitM 开启

## 常见问题

**Q: 没有弹出比价通知？**
A: 检查 MitM 是否开启且证书已信任，确认配置文件没有语法错误。

**Q: 价格显示为 "—"？**
A: 可能是商品接口变更或未登录导致，尝试先在 Safari 中登录京东/淘宝。

## License

MIT
