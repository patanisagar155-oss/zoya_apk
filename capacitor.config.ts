interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: Record<string, unknown>;
  android?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
}

const config: CapacitorConfig = {
  appId: 'com.sagar.zoya.jarvis',
  appName: 'ZOYA JARVIS AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#07080F',
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    Preferences: {
      group: 'ZoyaJarvisPrefs',
    },
  },
};

export default config;
