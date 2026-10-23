---
title: 状态管理（Riverpod）
slug: docs/client/state-management
description: Riverpod 与 ViewModel / Notifier 约定
sidebar:
  order: 5
  label: 状态管理
---

## 角色

| 概念 | 用法 |
|------|------|
| `Provider` | 无状态依赖（Repository、配置） |
| `Notifier` / `AsyncNotifier` | 页面或会话状态 |
| `ref.watch` | build / 依赖图订阅 |
| `ref.read` | 回调里发动作、读一次性 |
| `ref.listen` | 副作用（导航、SnackBar） |

页面级 Notifier 建议 **`autoDispose`**，离开路由释放。

**SnackBar**：在 `ref.listen` / 回调里用 `showAppSnackBarText(context, …)`（`shared/presentation/widgets/app_snackbar.dart`），避免 dialog / root 导航下被挡住。

## 模式

1. domain 定义接口与实体  
2. data 实现仓储  
3. presentation 的 Notifier 调仓储，暴露不可变 `State`  
4. Widget 只 `watch` 状态、调用 Notifier 方法  

示例类名以仓库为准；下面仅为结构示意：

```dart
@immutable
class ExampleState {
  const ExampleState({this.loading = false});
  final bool loading;
  ExampleState copyWith({bool? loading}) =>
      ExampleState(loading: loading ?? this.loading);
}

class ExampleNotifier extends Notifier<ExampleState> {
  @override
  ExampleState build() => const ExampleState();

  Future<void> load() async {
    state = state.copyWith(loading: true);
    // await repo...
    state = state.copyWith(loading: false);
  }
}
```

## 与认证 / API

- `luotopiaAuthProvider` 管登录态  
- `dioProvider` watch token 与 `customServerUrl`  

见 [认证](/docs/client/auth/) · [API 对接](/docs/client/api-integration/)。

## 相关

- [架构](/docs/client/architecture/)
- [测试](/docs/client/testing/)
