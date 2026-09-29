import * as Ably from 'ably';

const CHANNEL = 'debatehub:main';

/**
 * Connects to Ably and returns { publish, close }.
 * Every action (create / join / message / vote) is published as an event
 * and applied to state when it arrives, so all devices stay in sync.
 * If no key is configured, events are applied locally (offline mode).
 */
export function createBus(clientId, onEvent, onStatus = () => {}) {
  const key = import.meta.env.VITE_ABLY_KEY;

  if (!key) {
    onStatus('offline');
    return { publish: (name, data) => onEvent({ name, data }), close: () => {} };
  }

  const client = new Ably.Realtime({ key, clientId });
  const channel = client.channels.get(CHANNEL, { params: { rewind: '200' } });

  client.connection.on((change) => {
    onStatus(change.current === 'connected' ? 'online' : change.current);
  });

  channel.subscribe((msg) => onEvent({ name: msg.name, data: msg.data }));

  return {
    publish: (name, data) => {
      channel.publish(name, data).catch(() => onStatus('error'));
    },
    close: () => {
      try { channel.unsubscribe(); client.close(); } catch { /* ignore */ }
    },
  };
}
