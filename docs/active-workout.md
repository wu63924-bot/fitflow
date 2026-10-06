# Active workout experience

Training remains in the existing `workoutSessions` IndexedDB table. Returning home saves current input through the existing set validation and repository transaction. It does not complete the session or change `startedAt` or `restEndsAt`. The application shell observes the active session with Dexie `liveQuery`, so the mini training card updates after completion, including changes from another tab. No database schema changes are required.

The session still displays one current exercise, with existing previous/next and quick navigation. Each exercise has independent, initially expanded UI state. Collapsing hides controls with `inert`, preserves draft values, and does not write training data. Collapse state resets when leaving the session page.

Weight uses a text input with `inputMode="decimal"`: WebKit does not reliably support selection in number inputs. Initial focus selects the value. The first pointer click reapplies selection in the next animation frame because touch placement can otherwise override it. Later clicks permit cursor editing. Existing numeric validation and persistence remain in place; empty weight on blur becomes zero. Weight buttons use 2 kg and the existing decimal rounding; repetition buttons remain unchanged.

## Rest notifications and platform limits

The notification entry appears after a rest timer starts, never on initial training entry. Permission requests only follow the explicit **开启通知** click. Denial and dismissal leave the timer working. Dismissal is an optional localStorage UI preference, outside IndexedDB and backups; browser notification permission remains authoritative.

The application-level timer checks the existing timestamp once per second, and recalibrates on visibility/pageshow. Completion is claimed transactionally through `expiredNotified` to avoid duplicate reminders. Foreground completion retains the in-page rest display and configured vibration, and adds a toast. Background completion attempts a notification titled **FitFlow**, with **休息结束，可以开始下一组了**. It prefers an existing service worker registration's `showNotification`, with a desktop Notification constructor fallback. Unsupported APIs, insecure origins, denied permission and display failures do not stop training.

**This is a best-effort local reminder, not scheduled Web Push.** Browser throttling can delay callbacks. If the page is suspended or closed, JavaScript cannot reliably run at the deadline. The generated PWA service worker does not schedule a wakeup. Returning to FitFlow recalculates the remaining time from the saved timestamp. No polling workaround, persistent background process or push server is added.

iPhone/iPad notifications depend on supported iOS versions and installation as a Home Screen web app. Ordinary iPhone Safari tabs must not be assumed to support notifications. iOS 16.4 introduced Home Screen Web Push and requires direct user interaction for permission. API availability and permission alone do not guarantee local deadline delivery. Reliable delivery while a page is closed requires a separate push architecture, outside this change.

References: [WebKit Home Screen notifications](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [MDN showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification).

## Verification

Start the development server with `npm run dev -- --host 127.0.0.1`. Run `npm run test:workout` with an installed Playwright module, or pass its `index.mjs` absolute path as the first argument. The test uses fresh isolated browser contexts and fixture IndexedDB data. It never touches the user's production records. Set `WORKOUT_BROWSER=webkit` to test WebKit; default is installed Chrome. Set `WORKOUT_TEST_URL` to change the target origin/base path.

Coverage includes zero/existing weight replacement, empty blur, two-kilogram steps and zero clamp, fractional weight, unchanged repetitions, independent collapse and draft preservation, 16 px computed fonts, 320/390 px overflow, desktop/mobile navigation clearance, active session minimization and resumption, elapsed/rest timestamps, saved completion/history data, foreground reminders, unsupported/denied notification behavior, explicit permission interaction and no repeated requests. Mocked notification branches cover background service worker display, constructor fallback, foreground suppression and API failures.

WebKit automation is not an actual iPhone Safari/PWA device test. Manually verify the real iPhone keyboard, cursor editing, safe areas, text zoom, installed PWA permission flow, background/lock-screen behavior and reminder delay after suspension. Native OS notification display and sound/vibration behavior depend on device settings and remain device acceptance checks.

Pushing `main` triggers the existing GitHub Pages deployment workflow. This frontend change does not require a Phase 6B-3 cloud API upload. Existing installed PWAs may need to reopen after their service worker updates.
