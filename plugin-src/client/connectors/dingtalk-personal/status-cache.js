import { fetchDingtalkPersonalStatus } from './api.js';

export const DINGTALK_PERSONAL_STATUS_CACHE_TTL_MS = 15_000;

let statusCache;
let statusCachedAt = 0;
let preloadInFlight;

export function cachedDingtalkPersonalStatus() {
  return statusCache;
}

export function cacheDingtalkPersonalStatus(_rpcCall, status) {
  statusCache = status;
  statusCachedAt = Date.now();
  return status;
}

export function clearDingtalkPersonalStatusCache() {
  statusCache = undefined;
  statusCachedAt = 0;
  preloadInFlight = undefined;
}

export function isDingtalkPersonalStatusCacheFresh(now = Date.now()) {
  return statusCache !== undefined
    && now - statusCachedAt <= DINGTALK_PERSONAL_STATUS_CACHE_TTL_MS;
}

export function preloadDingtalkPersonalStatus(rpcCall, { refresh = false } = {}) {
  if (!refresh && isDingtalkPersonalStatusCacheFresh()) return Promise.resolve(statusCache);
  if (!refresh && preloadInFlight !== undefined) return preloadInFlight;
  const request = fetchDingtalkPersonalStatus(rpcCall)
    .then((status) => cacheDingtalkPersonalStatus(rpcCall, status))
    .finally(() => {
      if (preloadInFlight === request) preloadInFlight = undefined;
    });
  preloadInFlight = request;
  return request;
}
