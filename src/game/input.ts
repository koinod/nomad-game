// Shared input state written by keyboard/mouse handlers and the mobile
// touch controls, read by the player controller each tick.
export interface InputState {
  moveX: number; // -1..1 strafe right
  moveY: number; // -1..1 forward
  lookDX: number; // accumulated pixels, consumed per tick
  lookDY: number;
  sprint: boolean;
  jump: boolean; // edge-triggered
  ascend: boolean; // held: helicopter collective up (Space while flying)
  crouch: boolean; // held
  attackMelee: boolean; // edge-triggered: set true on press, controller clears
  attackRanged: boolean; // edge-triggered
  attackHeld: boolean; // held: LMB fire button currently down (drives auto fire)
  blocking: boolean; // held: right-click block with melee
  leanLeft: boolean; // held: Q
  leanRight: boolean; // held: E (tap still interacts)
  fpToggle: boolean; // edge-triggered: V toggles first/third person
  zoomIn: boolean; // held: mobile zoom-in button
  zoomOut: boolean; // held: mobile zoom-out button
  aimTap: boolean; // edge-triggered: RMB with a gun cycles hip → shoulder → ADS
  interact: boolean; // edge-triggered
  storage: boolean; // edge-triggered: T opens vehicle/trailer storage
  refuel: boolean; // edge-triggered: R near a vehicle pours a fuel can in
  phone: boolean; // edge-triggered
  backpack: boolean; // edge-triggered
  pause: boolean; // edge-triggered
  hotbar: number; // 0 = none, 1..4 edge-triggered
}

export const input: InputState = {
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
  sprint: false,
  jump: false,
  ascend: false,
  crouch: false,
  attackMelee: false,
  attackRanged: false,
  attackHeld: false,
  blocking: false,
  leanLeft: false,
  leanRight: false,
  fpToggle: false,
  aimTap: false,
  zoomIn: false,
  zoomOut: false,
  interact: false,
  storage: false,
  refuel: false,
  phone: false,
  backpack: false,
  pause: false,
  hotbar: 0,
};

export function consumeLook(): [number, number] {
  const dx = input.lookDX;
  const dy = input.lookDY;
  input.lookDX = 0;
  input.lookDY = 0;
  return [dx, dy];
}

export function resetEdgeTriggers(): void {
  input.jump = false;
  input.attackMelee = false;
  input.attackRanged = false;
  input.interact = false;
  input.storage = false;
  input.refuel = false;
  input.phone = false;
  input.backpack = false;
  input.pause = false;
  input.fpToggle = false;
  input.aimTap = false;
  input.hotbar = 0;
}
