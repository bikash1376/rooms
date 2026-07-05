import Phaser from "phaser";

// LimeZu character spritesheets are 52 frames of 32x48, laid out as:
// idle R/U/L/D (0-23), run R/U/L/D (24-47), sit D/L/R/U (48-51).
const DIRS = ["right", "up", "left", "down"] as const;

export function createCharacterAnims(
  anims: Phaser.Animations.AnimationManager,
  keys: string[]
) {
  const rate = 15;
  for (const key of keys) {
    DIRS.forEach((dir, i) => {
      anims.create({
        key: `${key}_idle_${dir}`,
        frames: anims.generateFrameNumbers(key, { start: i * 6, end: i * 6 + 5 }),
        repeat: -1,
        frameRate: rate * 0.6,
      });
      anims.create({
        key: `${key}_run_${dir}`,
        frames: anims.generateFrameNumbers(key, { start: 24 + i * 6, end: 24 + i * 6 + 5 }),
        repeat: -1,
        frameRate: rate,
      });
    });
    // sitting stills (down,left,right,up) at 48-51
    ["down", "left", "right", "up"].forEach((dir, i) => {
      anims.create({
        key: `${key}_sit_${dir}`,
        frames: anims.generateFrameNumbers(key, { start: 48 + i, end: 48 + i }),
        repeat: 0,
        frameRate: rate,
      });
    });
  }
}
