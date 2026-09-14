type SetupFn = (signal: AbortSignal) => void | (() => void);

/*
 * `addEventListener(..., { signal })` is Chrome 90+ / Safari 15+. Below that
 * the key is silently ignored — and the cleanup contract this module offers
 * quietly stops working: every client navigation would pile duplicate
 * intervals and listeners onto the still-live window/document. Every page
 * script imports this module before binding anything, so a one-time patch
 * here restores the contract on old kernels (the site has to run in Android
 * WebViews that never left the factory Chromium).
 */
let signalOptionReady = false;

function supportsListenerSignalOption(): boolean {
  try {
    const probe = document.createElement("div");
    const controller = new AbortController();
    let fired = false;
    probe.addEventListener("lt-signal-probe", () => { fired = true; }, { signal: controller.signal });
    controller.abort();
    probe.dispatchEvent(new Event("lt-signal-probe"));
    return !fired;
  } catch {
    return false;
  }
}

function ensureListenerSignalOption(): void {
  if (signalOptionReady) return;
  signalOptionReady = true;
  if (typeof AbortController !== "function") return;
  if (supportsListenerSignalOption()) return;

  const native = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    const signal =
      options && typeof options === "object"
        ? (options as AddEventListenerOptions).signal
        : undefined;
    if (!signal || typeof listener !== "function") {
      return native.call(this, type, listener, options);
    }
    if (signal.aborted) return;
    native.call(this, type, listener, options);
    // The engine ignores the `signal` key, so a plain remove with the same
    // (type, listener, capture) unbinds it; `once` is Chrome 55+.
    signal.addEventListener(
      "abort",
      () => this.removeEventListener(type, listener, options),
      { once: true },
    );
  };
}

ensureListenerSignalOption();

/**
 * Run page-owned setup after every Astro Client Router navigation.
 *
 * Bundled Astro scripts are deduplicated by URL/content: visiting the same page
 * a second time does not re-execute the script, while the DOM it previously
 * bound has been replaced. `astro:page-load` is therefore the only reliable
 * per-navigation entry point. The AbortSignal lets listeners, observers and
 * fetches clean up automatically before the next swap.
 */
export function onPageSetup(init: SetupFn): void {
  let controller: AbortController | null = null;
  let dispose: (() => void) | null = null;
  let active = false;

  function teardown() {
    if (!active) return;
    active = false;
    dispose?.();
    controller?.abort();
    controller = null;
    dispose = null;
  }

  function setup() {
    if (active) return;
    active = true;
    controller = new AbortController();
    const result = init(controller.signal);
    dispose = typeof result === "function" ? result : null;
  }

  document.addEventListener("astro:before-swap", teardown);
  document.addEventListener("astro:page-load", setup);

  /*
   * The first setup cannot wait for `astro:page-load`: Astro fires that on
   * `window.load`, and this site loads many subsetted CJK fonts, so waiting
   * would delay scroll reveals and page effects until every font request
   * settles. DOM-ready is enough for the initial document. The `active` guard
   * makes the subsequent initial `astro:page-load` a no-op, while client-side
   * navigations still teardown before swap and setup after it.
   */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
}

/** Close transient UI as soon as a client navigation is requested. */
export function onBeforeNavigation(handler: () => void): void {
  document.addEventListener("astro:before-preparation", handler);
}
