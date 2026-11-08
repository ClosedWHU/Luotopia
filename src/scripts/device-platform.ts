export type DevicePlatform = "android" | "ios" | "macos" | "windows" | "linux" | "harmony";

export function detectDevicePlatform(): DevicePlatform | null {
  const userAgent = navigator.userAgent || "";
  const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = userAgentData?.platform || navigator.platform || "";
  if (/Android/i.test(userAgent)) return "android";
  if (/OpenHarmony|HarmonyOS/i.test(userAgent)) return "harmony";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Mac/i.test(platform) || /Macintosh/i.test(userAgent)) return "macos";
  if (/Win/i.test(platform) || /Windows/i.test(userAgent)) return "windows";
  if (/Linux|X11|CrOS/i.test(userAgent) || /Linux/i.test(platform)) return "linux";
  return null;
}
