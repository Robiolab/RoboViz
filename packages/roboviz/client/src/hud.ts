/**
 * HUD overlay module — fixed-position DOM elements for diagnostic display.
 * These are screen-fixed (position:fixed) and do NOT use CSS2DObject (which is 3D-attached).
 */

/**
 * Creates a fixed-position HUD overlay showing FPS and socket update rate.
 * REND-09: FPS and update rate HUD overlay.
 */
export function createHUD(): { updateFPS: (dt: number) => void; recordUpdate: () => void } {
  const hud = document.createElement('div');
  hud.id = 'roboviz-hud';
  hud.style.cssText = 'position:fixed;top:8px;right:8px;color:#0f0;font:12px monospace;background:rgba(0,0,0,0.6);padding:6px 10px;border-radius:4px;pointer-events:none;z-index:1000;';
  document.body.appendChild(hud);

  let frameTime = 16.67; // initial estimate ~60fps
  let updateCount = 0;
  let updateRate = 0;
  let lastRateCheck = performance.now();

  return {
    updateFPS(dt: number): void {
      // Exponential moving average for smooth FPS display
      frameTime = frameTime * 0.9 + dt * 0.1;
      const now = performance.now();
      if (now - lastRateCheck > 1000) {
        updateRate = updateCount;
        updateCount = 0;
        lastRateCheck = now;
      }
      hud.textContent = `FPS: ${Math.round(1000 / frameTime)}  Updates/s: ${updateRate}`;
    },
    recordUpdate(): void {
      updateCount++;
    },
  };
}

/**
 * Creates a fixed-position connection status indicator.
 * REND-10: Connection status indicator (connected/disconnected/reconnecting).
 */
export function createConnectionStatus(): (state: 'connected' | 'disconnected' | 'reconnecting') => void {
  const el = document.createElement('div');
  el.id = 'roboviz-connection-status';
  el.style.cssText = 'position:fixed;bottom:8px;right:8px;font:12px monospace;padding:4px 8px;border-radius:4px;pointer-events:none;z-index:1000;background:rgba(0,0,0,0.6);';
  document.body.appendChild(el);

  const colors: Record<string, string> = {
    connected: '#0f0',
    disconnected: '#f44',
    reconnecting: '#fa0',
  };

  return (state: 'connected' | 'disconnected' | 'reconnecting'): void => {
    el.style.color = colors[state];
    el.textContent = state.toUpperCase();
  };
}
