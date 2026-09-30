# Dev error overlay reappears after its report is cleared

This reproduces a race in the Nuxt development error overlay. A compile error is fixed and the browser receives `nuxt:dev:error:clear`, but the old overlay appears afterward when its delayed HTML response arrives.

The project pins `nuxt-nightly@4.6.0-29844781.aec739e9` (Nuxt source [`aec739e`](https://github.com/nuxt/nuxt/commit/aec739e93d7d83cd25c8e7f15f6db555e51ca4b0)). Reproduced with Node 24.15.0 and Chromium via Playwright on macOS.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run repro
```

The test starts the Nuxt dev server and controls the timing:

1. Load a healthy page and wait for the Vue app to mount.
2. Introduce a template compile error. Intercept the overlay HTML request and keep its successful response from reaching the page.
3. Restore the file and wait for the `nuxt:dev:error:clear` HMR message.
4. Deliver the old overlay response.

The overlay should stay absent. On the pinned version, the test fails with `Expected: 0, Received: 1`. The test restores the source file afterward. No manual timing is needed.

The race is in the browser's asynchronous overlay fetch and mount path. A separate race can occur when server-side report creation finishes after a clear; this repro covers the browser path.
