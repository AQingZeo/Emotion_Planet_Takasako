/**
 * Sync between controller (/) and display (/display) via BroadcastChannel.
 * Persist last state in localStorage.
 */

const CHANNEL_NAME = 'emotion-planet';
const STORAGE_KEY = 'emotion-planet-state';

export interface ChannelPayload {
  seed: number;
  valence: number;
  arousal: number;
  maturity: number;
  label: string;
  mapData: number[];
  mapWidth: number;
  mapHeight: number;
  mapMin: number;
  mapMax: number;
}

export function broadcast(payload: ChannelPayload): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  } catch (_) {}
}

export function subscribe(callback: (payload: ChannelPayload) => void): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (ev: MessageEvent<ChannelPayload>) => callback(ev.data);
  return () => channel.close();
}

export function persistState(payload: ChannelPayload): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

export function loadPersistedState(): ChannelPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ChannelPayload;
  } catch {
    return null;
  }
}

export function payloadFromState(state: {
  seed: number;
  valence: number;
  arousal: number;
  maturity: number;
  label: string;
  mapData: Float32Array;
  mapWidth: number;
  mapHeight: number;
  mapMin: number;
  mapMax: number;
}): ChannelPayload {
  return {
    seed: state.seed,
    valence: state.valence,
    arousal: state.arousal,
    maturity: state.maturity,
    label: state.label,
    mapData: Array.from(state.mapData),
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    mapMin: state.mapMin,
    mapMax: state.mapMax,
  };
}

export function stateFromPayload(payload: ChannelPayload): {
  seed: number;
  valence: number;
  arousal: number;
  maturity: number;
  label: string;
  mapData: Float32Array;
  mapWidth: number;
  mapHeight: number;
  mapMin: number;
  mapMax: number;
} {
  return {
    seed: payload.seed,
    valence: payload.valence,
    arousal: payload.arousal,
    maturity: payload.maturity ?? 0,
    label: payload.label,
    mapData: new Float32Array(payload.mapData),
    mapWidth: payload.mapWidth,
    mapHeight: payload.mapHeight,
    mapMin: payload.mapMin,
    mapMax: payload.mapMax,
  };
}
