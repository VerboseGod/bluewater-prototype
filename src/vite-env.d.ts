/// <reference types="vite/client" />

interface Navigator {
  /** Edge on Xbox. "gamepad" gives the controller to the page instead of the cursor. */
  gamepadInputEmulation?: 'keyboard' | 'mouse' | 'gamepad';
}
