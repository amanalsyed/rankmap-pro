const SCAN_LISTING_NOTIFICATION_ID = 'scan:listing-complete';
const SCAN_FULL_NOTIFICATION_ID = 'scan:fully-complete';

function iconUrl(): string {
  return chrome.runtime.getURL('public/icons/icon128.png');
}

export async function notifyScanListingComplete(message: string): Promise<void> {
  try {
    await chrome.notifications.create(SCAN_LISTING_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: iconUrl(),
      title: 'Listing scan finished',
      message,
      priority: 1,
    });
  } catch {
    // notifications permission may be unavailable
  }
}

export async function notifyScanFullyComplete(message: string): Promise<void> {
  try {
    await chrome.notifications.create(SCAN_FULL_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: iconUrl(),
      title: 'Scan complete',
      message,
      priority: 2,
    });
  } catch {
    // notifications permission may be unavailable
  }
}

export function installScanNotificationClickHandler(
  openResults: () => void | Promise<void>
): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (
      notificationId !== SCAN_LISTING_NOTIFICATION_ID &&
      notificationId !== SCAN_FULL_NOTIFICATION_ID
    ) {
      return;
    }
    void openResults();
  });
}
