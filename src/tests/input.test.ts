// Lane 11 (1): the drive-input abstraction. Keyboard, touch and the
// vehicle controller all read/write drive state through these helpers;
// the legacy fields stay the storage, so Game/Vehicles see no change.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDriveInput, input, resetDriveInputs, resetEdgeTriggers, setDriveAxes, setHandbrake,
} from '../game/input';

beforeEach(() => {
  input.moveX = 0;
  input.moveY = 0;
  input.ascend = false;
  input.sprint = false;
});

describe('drive input abstraction', () => {
  it('reads throttle/steer/handbrake from the shared axes', () => {
    input.moveY = 0.5;
    input.moveX = -0.25;
    input.ascend = true;
    expect(getDriveInput()).toEqual({ throttle: 0.5, steer: -0.25, handbrake: true });
  });

  it('setDriveAxes writes through to the movement axes', () => {
    setDriveAxes(0.8, -0.4);
    expect(input.moveY).toBe(0.8);
    expect(input.moveX).toBe(-0.4);
    expect(getDriveInput().throttle).toBe(0.8);
  });

  it('setDriveAxes clamps to the -1..1 axis range', () => {
    setDriveAxes(2.5, -7);
    expect(input.moveY).toBe(1);
    expect(input.moveX).toBe(-1);
  });

  it('setHandbrake drives the shared ascend field (handbrake while driving)', () => {
    setHandbrake(true);
    expect(input.ascend).toBe(true);
    expect(getDriveInput().handbrake).toBe(true);
    setHandbrake(false);
    expect(input.ascend).toBe(false);
  });

  it('resetDriveInputs zeroes axes and brake together', () => {
    setDriveAxes(1, 1);
    setHandbrake(true);
    resetDriveInputs();
    expect(getDriveInput()).toEqual({ throttle: 0, steer: 0, handbrake: false });
  });

  it('edge-trigger reset never clears held drive state', () => {
    // resetEdgeTriggers runs every tick; if it cleared held fields the
    // handbrake would flicker off between frames.
    setDriveAxes(0.6, 0.1);
    setHandbrake(true);
    input.jump = true;
    resetEdgeTriggers();
    expect(input.jump).toBe(false);
    expect(getDriveInput()).toEqual({ throttle: 0.6, steer: 0.1, handbrake: true });
  });
});
