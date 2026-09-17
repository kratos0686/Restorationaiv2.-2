import { useEffect } from 'react';

export const useKeyboardShortcut = (
  keys: string[],
  callback: (event: KeyboardEvent) => void,
  options: { preventDefault?: boolean } = {}
) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        keys.every(
          (key) =>
            (key === 'ctrl' && event.ctrlKey) ||
            (key === 'shift' && event.shiftKey) ||
            (key === 'alt' && event.altKey) ||
            (key === 'meta' && event.metaKey) ||
            (typeof key === 'string' && event.key.toLowerCase() === key.toLowerCase())
        )
      ) {
        if (options.preventDefault) {
          event.preventDefault();
        }
        callback(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [keys, callback, options.preventDefault]);
};
