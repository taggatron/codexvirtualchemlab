const playwrightEntry = new URL('./qa_playwright_shim.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright') return { url: playwrightEntry, shortCircuit: true };
  return nextResolve(specifier, context);
}
