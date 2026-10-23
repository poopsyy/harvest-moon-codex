import Phaser from "phaser";
export class Controls {
  private scene: Phaser.Scene;
  private runLatched = false;
  private wasRunningHeld = false;
  private touchRun = false;
  private padHeld: Record<string, boolean> = {};
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  constructor(
    scene: Phaser.Scene,
    private bindings: () => Record<string, string> = () => ({}),
    private padBindings: () => Record<string, number> = () => ({}),
  ) {
    this.scene = scene;
    if (scene.input.keyboard)
      this.keys = scene.input.keyboard.addKeys(
        "W,A,S,D,UP,DOWN,LEFT,RIGHT,Z,SPACE,X,SHIFT,ENTER",
      ) as Record<string, Phaser.Input.Keyboard.Key>;
  }
  direction(): [number, number] {
    const pad = this.scene.input.gamepad?.getPad(0);
    if (pad) {
      const x = pad.axes[0]?.getValue() ?? 0,
        y = pad.axes[1]?.getValue() ?? 0;
      if (pad.left || x < -0.4) return [-1, 0];
      if (pad.right || x > 0.4) return [1, 0];
      if (pad.up || y < -0.4) return [0, -1];
      if (pad.down || y > 0.4) return [0, 1];
    }
    const down = (key: string) => this.bound(key.toLowerCase(), key)?.isDown;
    if (down("LEFT") || down("A")) return [-1, 0];
    if (down("RIGHT") || down("D")) return [1, 0];
    if (down("UP") || down("W")) return [0, -1];
    if (down("DOWN") || down("S")) return [0, 1];
    return [0, 0];
  }
  pressed(...keys: string[]): boolean {
    return keys.some((key) => {
      const k = this.keys[key];
      return k ? Phaser.Input.Keyboard.JustDown(k) : false;
    });
  }
  private bound(action: string, fallback: string) {
    const value = this.bindings()[action];
    const name = value
      ? value === " "
        ? "SPACE"
        : value.replace(/^Arrow/, "").toUpperCase()
      : fallback;
    if (!this.keys[name]) {
      const code = (Phaser.Input.Keyboard.KeyCodes as Record<string, number>)[
        name
      ];
      if (code !== undefined && this.scene.input.keyboard)
        this.keys[name] = this.scene.input.keyboard.addKey(code);
    }
    return this.keys[name];
  }
  interactPressed() {
    const key = this.bound("interact", "SPACE");
    return (
      Boolean(key && Phaser.Input.Keyboard.JustDown(key)) ||
      this.pressed("Z", "ENTER")
    );
  }
  padDown(action: string, fallback: number): boolean {
    return (
      this.scene.input.gamepad?.getPad(0)?.buttons[
        this.padBindings()[action] ?? fallback
      ]?.pressed ?? false
    );
  }
  padPressed(action: string, fallback: number): boolean {
    const down = this.padDown(action, fallback),
      pressed = down && !this.padHeld[action];
    this.padHeld[action] = down;
    return pressed;
  }
  gamepadAction(): boolean {
    return this.padPressed("interact", 0);
  }

  toggleRun(): void {
    this.touchRun = !this.touchRun;
  }
  running(toggleMode = false): boolean {
    const held =
      (this.bound("run", "SHIFT")?.isDown ?? false) || this.padDown("run", 2);
    if (toggleMode && held && !this.wasRunningHeld)
      this.runLatched = !this.runLatched;
    this.wasRunningHeld = held;
    return this.touchRun || (toggleMode ? this.runLatched : held);
  }
}
