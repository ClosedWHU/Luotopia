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
    icon: "mobile",
    desc: "APK 直接安装（arm64-v8a / armeabi-v7a / x86_64）",
    note: "Android 8+ 兼容",
  },
  {
    id: "apple",
    name: "Apple",
    icon: "ios",
    desc: "iOS / iPadOS TestFlight 与 macOS DMG",
    note: "iOS 16+ 需 TestFlight · macOS 13.5+（Apple 芯片）",
    externalUrl: testFlightUrl,
    externalLabel: "加入 TestFlight",
  },
  {
    id: "windows",
    name: "Windows",
    icon: "desktop_windows",
    desc: "zip / MSIX / Scoop 清单",
    note: "Windows 10+ 兼容",
  },
  {
    id: "linux",
    name: "Linux",
    icon: "terminal",
    desc: "x64 / arm64 多格式",
    note: "tar.gz · AppImage · deb · AUR",
  },
];
