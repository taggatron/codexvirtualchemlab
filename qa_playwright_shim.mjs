import { chromium as installedChromium } from './node_modules/playwright/index.mjs';

const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const chromium = new Proxy(installedChromium, {
  get(target, property, receiver) {
    if (property === 'launch') {
      return options => target.launch({ ...options, executablePath: chromeExecutable });
    }
    return Reflect.get(target, property, receiver);
  }
});
