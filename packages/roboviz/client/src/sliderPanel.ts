import type { SerializedRobotModel, Joint } from './types.js';

export interface SliderPanel {
  updateFromState(data: { qpos?: number[]; joints?: Record<string, number> }): void;
}

interface SliderEntry {
  joint: Joint;
  input: HTMLInputElement;
  valueDisplay: HTMLSpanElement;
}

const PANEL_CSS = `
#roboviz-slider-panel {
  position: fixed;
  top: 0;
  left: 0;
  height: 100%;
  width: 260px;
  background: rgba(18, 18, 36, 0.95);
  color: #ccc;
  font: 12px monospace;
  overflow-y: auto;
  z-index: 999;
  box-sizing: border-box;
  transition: transform 0.2s ease;
  border-right: 1px solid #333;
}
#roboviz-slider-panel.collapsed {
  transform: translateX(-260px);
}
#roboviz-slider-panel .panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(30, 30, 60, 0.9);
  border-bottom: 1px solid #333;
  position: sticky;
  top: 0;
  z-index: 1;
}
#roboviz-slider-panel .panel-header span {
  font-size: 13px;
  font-weight: bold;
  color: #e0e0e0;
}
#roboviz-slider-panel .panel-header button {
  background: rgba(255,255,255,0.1);
  border: 1px solid #555;
  color: #ccc;
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  font: 11px monospace;
}
#roboviz-slider-panel .panel-header button:hover {
  background: rgba(255,255,255,0.2);
}
.slider-row {
  padding: 6px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.slider-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 3px;
}
.slider-name {
  color: #8cf;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}
.slider-value {
  color: #aaa;
  min-width: 55px;
  text-align: right;
}
#roboviz-slider-panel input[type=range] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: #333;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
#roboviz-slider-panel input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #4fc3f7;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}
#roboviz-slider-panel input[type=range]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #4fc3f7;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}
#roboviz-slider-toggle {
  position: fixed;
  top: 8px;
  left: 260px;
  width: 24px;
  height: 28px;
  background: rgba(18, 18, 36, 0.95);
  border: 1px solid #333;
  border-left: none;
  border-radius: 0 4px 4px 0;
  color: #ccc;
  cursor: pointer;
  font: 14px monospace;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.2s ease;
  padding: 0;
}
#roboviz-slider-toggle.collapsed {
  left: 0;
}
`;

export function createSliderPanel(
  model: SerializedRobotModel,
  onJointChange: (joints: Record<string, number>) => void
): SliderPanel {
  // Only create sliders for 1-DOF joints (hinge and slide)
  const controllable = model.joints.filter(
    (j: Joint) => j.type === 'hinge' || j.type === 'slide'
  );

  // No controllable joints — return no-op
  if (controllable.length === 0) {
    return { updateFromState() {} };
  }

  // Inject styles
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);

  // Panel container
  const panel = document.createElement('div');
  panel.id = 'roboviz-slider-panel';
  document.body.appendChild(panel);

  // Toggle button (collapse/expand)
  const toggle = document.createElement('button');
  toggle.id = 'roboviz-slider-toggle';
  toggle.textContent = '\u25C0';
  document.body.appendChild(toggle);

  let collapsed = false;
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    toggle.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? '\u25B6' : '\u25C0';
  });

  // Header with title and reset button
  const header = document.createElement('div');
  header.className = 'panel-header';
  const title = document.createElement('span');
  title.textContent = 'Joint Controls';
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  header.appendChild(title);
  header.appendChild(resetBtn);
  panel.appendChild(header);

  // Build slider for each controllable joint
  const sliderMap = new Map<string, SliderEntry>();

  for (const joint of controllable) {
    let min: number;
    let max: number;

    if (joint.range) {
      min = joint.range[0];
      max = joint.range[1];
    } else if (joint.type === 'hinge') {
      min = -Math.PI;
      max = Math.PI;
    } else {
      min = -1;
      max = 1;
    }

    const step = joint.type === 'hinge' ? 0.01 : 0.001;

    const row = document.createElement('div');
    row.className = 'slider-row';

    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'slider-name';
    nameSpan.textContent = joint.name;
    nameSpan.title = joint.name;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'slider-value';
    valueSpan.textContent = '0.000';

    labelRow.appendChild(nameSpan);
    labelRow.appendChild(valueSpan);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = '0';

    input.addEventListener('input', () => {
      valueSpan.textContent = parseFloat(input.value).toFixed(3);
      emitAll();
    });

    row.appendChild(labelRow);
    row.appendChild(input);
    panel.appendChild(row);

    sliderMap.set(joint.name, { joint, input, valueDisplay: valueSpan });
  }

  function emitAll(): void {
    const joints: Record<string, number> = {};
    for (const [name, entry] of sliderMap) {
      joints[name] = parseFloat(entry.input.value);
    }
    onJointChange(joints);
  }

  resetBtn.addEventListener('click', () => {
    for (const entry of sliderMap.values()) {
      entry.input.value = '0';
      entry.valueDisplay.textContent = '0.000';
    }
    emitAll();
  });

  return {
    updateFromState(data: { qpos?: number[]; joints?: Record<string, number> }): void {
      if (data.joints) {
        for (const [name, value] of Object.entries(data.joints)) {
          const entry = sliderMap.get(name);
          if (entry) {
            entry.input.value = String(value);
            entry.valueDisplay.textContent = value.toFixed(3);
          }
        }
      } else if (data.qpos) {
        for (const qEntry of model.qposMap) {
          const entry = sliderMap.get(qEntry.jointName);
          if (entry && qEntry.dof === 1) {
            const value = data.qpos[qEntry.qposOffset];
            entry.input.value = String(value);
            entry.valueDisplay.textContent = value.toFixed(3);
          }
        }
      }
    },
  };
}
