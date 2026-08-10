import { chromium as installedChromium } from '../pptpresentationtowebagent/node_modules/playwright/index.mjs';

const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const chromium = new Proxy(installedChromium, {
  get(target, property, receiver) {
    if (property === 'launch') {
      return options => {
        const args = [...(options?.args || [])];
        if (!args.includes('--enable-unsafe-swiftshader')) {
          args.push('--enable-unsafe-swiftshader');
        }
        return target.launch({ ...options, args, executablePath: chromeExecutable });
      };
    }
    return Reflect.get(target, property, receiver);
  }
});
