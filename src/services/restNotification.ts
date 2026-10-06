export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' || !window.isSecureContext ? 'unsupported' : Notification.permission;
}

export async function requestRestNotification(): Promise<NotificationPermission | 'unsupported'> {
  if (notificationPermission() !== 'default') return notificationPermission();
  try { return await Notification.requestPermission(); }
  catch { return 'unsupported'; }
}

// Best effort only: suspended/closed pages cannot run this deadline handler.
// Service workers display notifications; they do not schedule local wakeups.
export async function notifyRestFinished(tag: string): Promise<void> {
  if (notificationPermission() !== 'granted' || document.visibilityState === 'visible') return;
  const options = { body: '休息结束，可以开始下一组了', tag };
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration?.showNotification) await registration.showNotification('FitFlow', options);
    else new Notification('FitFlow', options);
  } catch { /* Notification failures must never interrupt training. */ }
}
