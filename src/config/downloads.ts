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
    id: "apple",
    name: "Apple",
    icon: "phone_iphone",
    desc: "iOS / iPadOS TestFlight 与 macOS DMG",
    note: "iOS / iPadOS 需 TestFlight · macOS 13.5+",
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
    id: "linux",
    name: "Linux",
    icon: "terminal",
    desc: "多格式 / 多架构",
    note: "x64·arm64 · tar/AppImage/deb",
  },
];
