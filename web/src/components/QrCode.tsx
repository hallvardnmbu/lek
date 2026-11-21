import { createMemo } from 'solid-js';
import { encode } from 'uqr';

interface QrCodeProps {
  value: string;
  size?: number;
}

export function QrCode(props: QrCodeProps) {
  const size = () => props.size ?? 240;

  const svgData = createMemo(() => {
    const qr = encode(props.value, { ecc: 'M', border: 2 });
    const count = qr.size;
    let paths = '';
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.data[y][x]) {
          paths += `M${x},${y}h1v1h-1z`;
        }
      }
    }
    return { count, paths };
  });

  return (
    <svg
      width={size()}
      height={size()}
      viewBox={`0 0 ${svgData().count} ${svgData().count}`}
      shape-rendering="crispEdges"
      class="qr-svg"
      role="img"
      aria-label={`QR code for ${props.value}`}
    >
      <rect width="100%" height="100%" fill="#d4d4d8" rx="1" />
      <path d={svgData().paths} fill="#09090b" />
    </svg>
  );
}
