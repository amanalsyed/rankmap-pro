let contextInvalidated = false;
let reloadNoticeShown = false;

export function isExtensionContextValid(): boolean {
  if (contextInvalidated) return false;
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    contextInvalidated = true;
    return false;
  }
}

export function markExtensionContextInvalid(): void {
  contextInvalidated = true;
}

export function isContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Extension context invalidated');
}

export function handleInvalidExtensionContext(onReloadNeeded?: () => void): void {
  markExtensionContextInvalid();
  if (!reloadNoticeShown) {
    reloadNoticeShown = true;
    onReloadNeeded?.();
  }
}

export async function safeRuntimeSendMessage<T = unknown>(
  message: Record<string, unknown>,
  onReloadNeeded?: () => void
): Promise<T | null> {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(onReloadNeeded);
    return null;
  }

  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      handleInvalidExtensionContext(onReloadNeeded);
      return null;
    }
    throw error;
  }
}

export function safeRuntimeOnMessage(
  listener: (message: Record<string, unknown>) => void,
  onReloadNeeded?: () => void
): void {
  if (!isExtensionContextValid()) {
    handleInvalidExtensionContext(onReloadNeeded);
    return;
  }

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!isExtensionContextValid()) {
        handleInvalidExtensionContext(onReloadNeeded);
        return;
      }
      try {
        listener(message as Record<string, unknown>);
      } catch (error) {
        if (isContextInvalidatedError(error)) {
          handleInvalidExtensionContext(onReloadNeeded);
        }
      }
    });
  } catch (error) {
    if (isContextInvalidatedError(error)) {
      handleInvalidExtensionContext(onReloadNeeded);
    }
  }
}
