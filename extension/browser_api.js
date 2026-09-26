q(() => {
  const api = globalThis.browser || globalThis.chrome;

  async function call(target, method, ...args) {
    try {
      const result = target[method](...args);
      if (result && typeof result.then === 'function') return result;
    } catch (error) {
      throw error;
    }
    return new Promise((resolve, reject) => {
      target[method](...args, (value) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(value);
      });
    });
  }

  globalThis.PrivvyBrowserApi = Object.freeze({ api, call });
})();
