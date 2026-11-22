export const ARM_CANVAS = { width: 590, height: 280 };

export interface Arm {
  image: string;
  enter: 'top' | 'bottom' | 'right';
  box: { x: number; y: number; width: number; height: number };
  label: { x: number; y: number; angle: number };
}

export const ARMS: readonly Arm[] = [
  {
    image: 'negroni',
    enter: 'top',
    box: { x: 345, y: 0, width: 65, height: 142 },
    label: { x: 74.9, y: 40.7, angle: 0 },
  },
  {
    image: 'boot',
    enter: 'bottom',
    box: { x: 309, y: 145, width: 64, height: 135 },
    label: { x: 53.6, y: 84.3, angle: -75 },
  },
  {
    image: 'wine',
    enter: 'bottom',
    box: { x: 407, y: 165, width: 57, height: 115 },
    label: { x: 81.2, y: 85.7, angle: 75 },
  },
  {
    image: 'spritz',
    enter: 'bottom',
    box: { x: 240, y: 134, width: 72, height: 146 },
    label: { x: 50.5, y: 44.3, angle: 0 },
  },
  {
    image: 'champagne',
    enter: 'right',
    box: { x: 467, y: 176, width: 123, height: 104 },
    label: { x: 88.8, y: 61.4, angle: 0 },
  },
  {
    image: 'shaker',
    enter: 'top',
    box: { x: 157, y: 0, width: 94, height: 95 },
    label: { x: 33.9, y: 37.9, angle: 0 },
  },
  {
    image: 'rose',
    enter: 'top',
    box: { x: 506, y: 0, width: 84, height: 157 },
    label: { x: 97.3, y: 45.7, angle: -90 },
  },
  {
    image: 'heels',
    enter: 'bottom',
    box: { x: 152, y: 124, width: 74, height: 156 },
    label: { x: 36.3, y: 49.3, angle: 0 },
  },
];

export const armSrc = (arm: Arm) => `/lobby/${arm.image}.png`;
