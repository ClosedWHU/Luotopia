---
title: WebView 页面调用规范
slug: docs/client/webview
description: AppWebViewPage 接入方式
sidebar:
  order: 13
  label: WebView
---

新增 WebView 页面应优先使用 `AppWebViewPage`，不要在业务页面重复编写加载层、错误层、返回和刷新逻辑。

## 框架边界

底层栈为 `zikzak_inappwebview`，页面层通过平台中立抽象 `AppWebViewController`（`shared/presentation/widgets/webview/app_web_view_types.dart`）访问：Linux 走 `webview_all`（WebKitGTK）后端，其余原生平台走 Zikzak 后端。业务代码只面向抽象，不直接依赖插件类型。

`AppWebViewPage` 负责通用生命周期：

- 创建并持有 `AppWebViewController`  
- 默认启用 JavaScript  
- Android：`controller.configureAndroid(useWideViewPort: true, textZoom: 100, ...)`  
- 首次导航前自动注入校园 CAS 会话（见下）  
- 统一标题栏、返回、刷新、加载层、进度条、主框架错误层  
- 返回：WebView 可后退时先 `goBack()`，否则退出页面  
- 导航拦截与带 headers 重新加载  

会话与业务边界：

- 默认 `primeCampusSession: true`：自动调用 `whuAuthProvider.primeCasCookiesForWebView(controller)`，把当前武大 CAS Cookie 写入 WebView Cookie 存储，校园页免登录打开；无有效会话时静默匿名打开  
- 绝不能触碰武大会话的页面显式传 `primeCampusSession: false`  
- 框架不判断是否已登录、不做登录跳转  
- 不解析业务 URL、Cookie 或 JS 消息  
- 不注入业务 JS  

业务逻辑留在业务页面，通过回调接入。

开发者选项中的 **WebView 调试** 仅用于排查，正式用户路径不应依赖。WebView 内若需 Toast，优先页面级 UI 或 `showAppSnackBar*`（root），勿假设 WebView 内嵌 Scaffold 一定有 messenger。

## 基本页面

```dart
return AppWebViewPage(
  title: '页面标题',
  initialRequest: (_) {
    return AppWebViewRequest(uri: Uri.parse('https://example.com'));
  },
);
```

不需要刷新按钮时传入 `showRefresh: false`。

## 需要登录或会话准备

CAS Cookie 注入由框架自动完成（`primeCampusSession` 默认 `true`），业务侧无需再手动调用。登录检查、服务授权等业务前置条件放在 `initialRequest` 中。未满足条件时返回 `null`，并用页面状态配合 `overlayBuilder` 展示业务提示。

```dart
return AppWebViewPage(
  title: '校园应用',
  preparingMessage: '正在准备校园应用...',
  loadingMessage: '正在加载校园应用...',
  initialRequest: (controller) async {
    if (!isAuthenticated) {
      setState(() => needsLogin = true);
      return null;
    }

    return AppWebViewRequest(uri: entryUri);
  },
  overlayBuilder: (context, state, controller) {
    if (!needsLogin) {
      return null;
    }
    return LoginRequiredOverlay(onLogin: openLoginPage);
  },
);
```

> [!NOTE]
> 特殊场景需在业务代码手动补注入时，使用新签名 `whuAuthProvider.primeCasCookiesForWebView(controller)`（参数为 `AppWebViewController`）；无有效 CAS 会话时抛 `WhuAuthException`。

## 需要指定 Headers

UA、`X-Requested-With`、`Referer` 等由业务页面定义；通用层避免重复拦截循环。

```dart
return AppWebViewPage(
  title: '珞珈 E 卡',
  initialRequest: (controller) async {
    await controller.setUserAgent(smartCampusUserAgent);
    return AppWebViewRequest(
      uri: entryUri,
      headers: smartCampusHeaders(entryUri),
    );
  },
  onNavigationRequest: (request, controller) {
    final uri = Uri.tryParse(request.url);
    if (uri == null || uri.scheme != 'https') {
      return const AppWebViewNavigationAction.prevent();
    }
    if (shouldReloadWithHeaders(uri)) {
      return AppWebViewNavigationAction.reloadWithHeaders(
        uri,
        smartCampusHeaders(uri),
      );
    }
    return const AppWebViewNavigationAction.navigate();
  },
);
```

## 需要 JS Bridge

在 `onControllerCreated` 注册 channel，在 `onPageFinished` 注入**该业务自有**脚本。  
channel 名、注入脚本内容属于业务实现，公开文档只用占位示意：

```dart
return AppWebViewPage(
  title: '业务页',
  enableZoom: false,
  initialRequest: buildBusinessRequest, // 含登录/会话准备
  onControllerCreated: (controller) {
    controller.addJavaScriptChannel(
      'BusinessBridge', // 名称由业务约定
      onMessageReceived: handleBridgeMessage,
    );
  },
  onPageFinished: (url, controller) async {
    await controller.runJavaScript(businessBridgeScript); // 业务侧提供
  },
);
```

Bridge 回调中可弹窗、写仓储或 `showAppSnackBar*`；不要把业务规则写进 `AppWebViewPage`。  
**不要**在公开文档粘贴完整注入脚本或校内页面 DOM 选择器。

## 新页面自查

- 除 `AppWebViewPage` 外，不直接实例化 WebView 控制器；业务代码只面向 `AppWebViewController` 抽象  
- 不复制加载层、错误层、返回键和刷新按钮样板  
- 认证、Header、JS bridge 只通过回调接入  
- 敏感 Cookie、token、学号、姓名、设备指纹不写入代码或可提交文档  
- 需要武大统一身份认证时优先复用 `whu_auth`，不要在页面层拼接 Cookie  
