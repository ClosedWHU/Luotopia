export interface DomainProtectionConfig {
  mainDomain: string;
  whitelist: string[];
  blacklist: string[];
}

export const domainProtection: DomainProtectionConfig = {
  mainDomain: 'www.whu.sb',

  whitelist: [
    'localhost',
    'localhost:4321',
    '127.0.0.1',
    '127.0.0.1:4321',
    '*.whu.sb',
    '*.luotopia.cc',
    '*.pages.dev',
    '*.vercel.app',
  ],

  blacklist: [
    'malicious-whu-sb.pages.dev',
    'phishing-whu-sb.vercel.app',
  ],
};
