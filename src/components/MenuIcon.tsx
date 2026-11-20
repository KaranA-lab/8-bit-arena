const K = '#03050B', Y = '#FFC21A', D = '#D98E00', L = '#FFE27A';

/** Pixel "list" icon from the Figma frame; morphs into an X when the menu is open. */
export function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 14 14" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="0" width="12" height="14" fill={K} />
      <rect x="0" y="1" width="14" height="12" fill={K} />
      <rect x="1" y="1" width="12" height="12" fill={Y} />
      <rect x="1" y="11" width="12" height="1" fill={D} />
      <rect x="11" y="1" width="1" height="11" fill={D} />
      <rect x="1" y="1" width="10" height="1" fill={L} />
      <rect x="1" y="1" width="1" height="10" fill={L} />
      {open ? (
        <g fill={K}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i}>
              <rect x={3 + i} y={3 + i} width="2" height="2" />
              <rect x={9 - i} y={3 + i} width="2" height="2" />
            </g>
          ))}
        </g>
      ) : (
        <g fill={K}>
          {[3, 6, 9].map((y) => (
            <g key={y}>
              <rect x="3" y={y} width="2" height="2" />
              <rect x="6" y={y} width="5" height="2" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
