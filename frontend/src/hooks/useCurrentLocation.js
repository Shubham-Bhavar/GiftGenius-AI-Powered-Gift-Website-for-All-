import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api.js';

export const LOCATION_MESSAGES = {
  idle: '',
  locating: 'Locating you…',
  success: 'Location detected. Please check the address details below.',
  denied: 'Location access was not allowed. You can enter your address manually.',
  unsupported: "Your browser can't share your location. Please enter your address manually.",
  failed: 'Could not detect your location. Enter your address manually.',
  outside: 'You seem to be outside India. We deliver within India only, so please enter the delivery address manually.',
};

// About 11 m: plenty to find the street, and less precise than the device's fix.
const round4 = (n) => Math.round(n * 10_000) / 10_000;

function currentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 15_000,
      maximumAge: 5 * 60_000,
    });
  });
}

/**
 * One-time "Use my current location": asks for permission only when called (from a click), reads the position
 * once (no tracking), and turns it into address parts through our backend. Coordinates are rounded before they
 * leave the browser and are not kept afterwards. Resolves to the address parts, or null (see `status`).
 */
export function useCurrentLocation() {
  const [status, setStatus] = useState('idle');
  const busy = useRef(false);

  const locate = useCallback(async () => {
    if (busy.current) return null;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return null;
    }
    busy.current = true;
    setStatus('locating');
    try {
      const { coords } = await currentPosition();
      const address = await api.reverseGeocode(round4(coords.latitude), round4(coords.longitude));
      if (address?.countryCode && address.countryCode !== 'IN') {
        setStatus('outside');
        return null;
      }
      setStatus('success');
      return address;
    } catch (err) {
      // GeolocationPositionError.PERMISSION_DENIED is 1; anything else (timeout, no fix, lookup error) is a failure.
      setStatus(err?.code === 1 ? 'denied' : 'failed');
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  return { status, message: LOCATION_MESSAGES[status], locate };
}
