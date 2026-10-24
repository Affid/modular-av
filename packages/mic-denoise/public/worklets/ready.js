// Loaded into a capture context before a noise model's worklet. The
// models of @sapphi-red/web-noise-suppressor compile their WASM after the
// node is made and send silence until then, without saying when they are
// ready. This wraps their processors so each node posts READY once its
// model runs (the library assigns `this.processor` then; version pinned).
const READY = "modular-av-mic-denoise:ready";
const LIBRARY = "@sapphi-red/web-noise-suppressor/";
const register = globalThis.registerProcessor;

globalThis.registerProcessor = (name, Processor) => {
  if (!name.startsWith(LIBRARY)) {
    register(name, Processor);
    return;
  }
  class Announced extends Processor {
    constructor(options) {
      super(options);
      let model = this.processor;
      let announced = false;
      const announce = () => {
        if (announced || model === undefined) return;
        announced = true;
        this.port.postMessage(READY);
      };
      Object.defineProperty(this, "processor", {
        configurable: true,
        get: () => model,
        set: (next) => {
          model = next;
          announce();
        },
      });
      announce();
    }
  }
  register(name, Announced);
};
