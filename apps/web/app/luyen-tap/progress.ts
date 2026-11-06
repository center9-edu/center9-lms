'use client';

import { useSyncExternalStore } from 'react';

// ponytail: progress stays in this browser only; move it to the API when students have accounts.
const STORAGE_KEY = 'center9.practice.completed';
const CHANGE_EVENT = 'center9-practice-progress';

function read(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return ''; // Storage can be blocked by browser settings; progress is optional.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useCompletedSlugs(): string[] {
  const stored = useSyncExternalStore(subscribe, read, () => '');
  return stored ? stored.split(',') : [];
}

export function markCompleted(slug: string): void {
  const completed = new Set(read().split(',').filter(Boolean)).add(slug);
  try {
    window.localStorage.setItem(STORAGE_KEY, [...completed].join(','));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage can be blocked by browser settings; progress is optional.
  }
}
