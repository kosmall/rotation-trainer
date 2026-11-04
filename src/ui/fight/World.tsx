// The world in the arena's middle (spec §5.2): the selection ring the target stands in and its
// nameplate, low in the area so the combat text zones beside it rise past the ring. Decorative (aria-hidden). The ring's inner ellipse turns slowly while the fight runs
// (the only loop; off under reduced motion, CSS).

import { memo } from 'react';
import { TARGET_NAME } from './TargetFrame';

export const World = memo(function World() {
  return (
    <div className="fv-world" aria-hidden="true">
      <div className="fv-spot">
        <svg className="fv-ring" viewBox="0 0 260 100">
          <ellipse cx="130" cy="50" rx="120" ry="42" fill="rgba(224,82,82,0.08)" stroke="currentColor" strokeWidth="2" opacity="0.85" />
          <g transform="translate(130 50) scale(1 0.3333)">
            <circle className="fv-ring-inner" r="108" fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.6" />
          </g>
        </svg>
        <div className="fv-nameplate">
          <b>{TARGET_NAME}</b>
          <div className="fv-np">
            <i />
          </div>
        </div>
      </div>
    </div>
  );
});
