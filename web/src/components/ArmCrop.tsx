import { ARM_CANVAS, armSrc, type Arm } from './arms';

interface ArmCropProps {
  arm: Arm;
  class?: string;
}

export function ArmCrop(props: ArmCropProps) {
  return (
    <div
      class={props.class ? `arm-crop ${props.class}` : 'arm-crop'}
      style={{ 'aspect-ratio': `${props.arm.box.width} / ${props.arm.box.height}` }}
    >
      <img
        src={armSrc(props.arm)}
        alt=""
        style={{
          width: `${(ARM_CANVAS.width / props.arm.box.width) * 100}%`,
          left: `${(-props.arm.box.x / props.arm.box.width) * 100}%`,
          top: `${(-props.arm.box.y / props.arm.box.height) * 100}%`,
        }}
      />
    </div>
  );
}
