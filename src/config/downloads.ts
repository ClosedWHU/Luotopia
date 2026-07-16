export interface PlatformDownload {
  id: string;
  name: string;
  icon: string;
  desc: string;
  note: string;
  /** External install URL when GitHub has no artifact (e.g. TestFlight). */
  externalUrl?: string;
  externalLabel?: string;
}

export const testFlightUrl = "https://testflight.apple.com/join/dMwZT97V";

export const platforms: PlatformDownload[] = [
  {
    id: "android",
    name: "Android",
    icon: "smartphone",
    desc: "APK 直接安装，支持侧载",
    note: "Android 8+ 兼容",
  },
  {
    id: "ios",
    name: "iOS",
    icon: "tablet_mac",
    desc: "TestFlight 内测",
    note: "通过 TestFlight 安装",
    externalUrl: testFlightUrl,
    externalLabel: "加入 TestFlight",
  },
  {
    id: "windows",
    name: "Windows",
    icon: "desktop_windows",
    desc: "Windows 桌面客户端",
    note: "Windows 10+ 兼容",
  },
  {
    id: "macos",
    name: "macOS",
    icon: "laptop",
    desc: "macOS 原生体验",
    note: "敬请期待",
  },
  {
    id: "linux",
    name: "Linux",
    icon: "terminal",
    desc: "x64 便携包（tar.gz）",
    note: "解压后运行 luotopia",
  },
];
