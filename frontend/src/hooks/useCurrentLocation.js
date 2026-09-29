import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api.js';

export const LOCATION_MESSAGES = {
  idle: '',
  locating: 'Locating you…',
  found: 'Location detected. Check the address below, then choose “Use this address”.',
  applied: 'Address filled in from your location. Add your flat or house number and check the details.',
  denied: 'Location access was not allowed. You can enter your address manually.',
  unsupported: "Your browser can't share your location. Please enter your address manually.",
  unavailable: "Your device couldn't work out its location. Please enter your address manually.",
  timeout: 'Finding your location took too long. Try again, or enter your address manually.',
  failed: 'Could not detect your location. Enter your address manually.',
  outside: 'We currently deliver within India. Please enter an Indian delivery address.',
};

/**
 * Beyond this many metres the browser's fix is an estimate (typically from the network on a laptop or
 * desktop without GPS), which can point to the wrong neighbourhood or even the wrong city.
 */
export const APPROXIMATE_METRES = 1000;

// 5 decimals is about 1 m: enough for the right street, without sending the device's full precision.
const round5 = (n) => Math.round(n * 100_000) / 100_000;
const validCoords = (c) => c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)
  && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;

// GeolocationPositionError codes.
const ERROR_STATUS = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

function currentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, // GPS / Wi-Fi where available, not just a network estimate
      timeout: 20_000,
      maximumAge: 0, // a fresh fix, never a cached position from somewhere else
    });
  });
}

/**
 * One-time "Use my current location": asks for permission only when called (from a click), reads the
 * position once (no tracking), and looks up the address through our backend. Nothing is filled in here:
 * the caller shows `result` and lets the shopper confirm it. Coordinates are rounded before they leave the
 * browser and are not kept.
 */
export function useCurrentLocation() {
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null); // { address, accuracy, approximate }
  const busy = useRef(false);

  const locate = useCallback(async () => {
    if (busy.current) return null;
    setResult(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return null;
    }
    busy.current = true;
    setStatus('locating');
    try {
      let position;
      try {
        position = await currentPosition();
      } catch (err) {
        setStatus(ERROR_STATUS[err?.code] ?? 'failed');
        return null;
      }
      const { coords } = position;
      if (!validCoords(coords)) {
        setStatus('unavailable');
        return null;
      }
      const address = await api.reverseGeocode(round5(coords.latitude), round5(coords.longitude));
      if (!address || (address.countryCode && address.countryCode !== 'IN')) {
        setStatus(address ? 'outside' : 'failed');
        return null;
      }
      const accuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : null;
      const found = { address, accuracy, approximate: accuracy == null || accuracy > APPROXIMATE_METRES };
      setResult(found);
      setStatus('found');
      return found;
    } catch {
      setStatus('failed'); // the lookup failed: the shopper types the address
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  /** The shopper used the detected address. */
  const markApplied = useCallback(() => {
    setResult(null);
    setStatus('applied');
  }, []);

  /** The shopper chose to type the address instead. */
  const dismiss = useCallback(() => {
    setResult(null);
    setStatus('idle');
  }, []);

  return { status, message: LOCATION_MESSAGES[status], result, locate, markApplied, dismiss };
}
