type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeTicketUpdates(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyTicketValidated(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore listener error
    }
  }
}

