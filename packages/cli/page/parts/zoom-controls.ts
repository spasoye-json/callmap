import type { CameraView } from '../camera.ts';
import type { PagePart } from '../reader-page.ts';
import { svgOf } from '../svg.ts';

const ZOOM_OUT_ICON = 'M3 8h10';
const ZOOM_IN_ICON = 'M3 8h10M8 3v10';

const labelOf = ({ scale, band }: CameraView): string =>
  band === 'read' ? `${String(Math.round(scale * 100))}%` : 'Overview';

const buttonOf = (name: string, act: () => void, icon?: string): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  if (icon === undefined) {
    button.textContent = name;
  } else {
    button.setAttribute('aria-label', name);
    button.append(
      svgOf(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
        svgOf('path', { d: icon }),
      ),
    );
  }
  button.addEventListener('click', act);
  return button;
};

const zoomControls: PagePart = ({ graph, camera }) => {
  const controls = document.createElement('div');
  controls.className = 'zoom-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Zoom');
  const label = document.createElement('span');
  label.className = 'zoom-label';
  const fit = buttonOf('Fit', camera.fit);
  fit.className = 'zoom-fit';
  controls.append(
    buttonOf('Zoom out', camera.zoomOut, ZOOM_OUT_ICON),
    label,
    buttonOf('Zoom in', camera.zoomIn, ZOOM_IN_ICON),
    fit,
  );
  graph.append(controls);

  const show = (view: CameraView): void => {
    label.textContent = labelOf(view);
  };
  show(camera.view());
  camera.onChange(show);
};

export default zoomControls;
