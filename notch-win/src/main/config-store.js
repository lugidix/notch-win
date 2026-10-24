// Config store — same keys/defaults as boring.notch Defaults (models/Constants.swift),
// persisted to %APPDATA%/notch-win/config.json.
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_CONFIG = {
  // Behavior (Constants.swift:78-95)
  minimumHoverDuration: 0.3,
  openNotchOnHover: true,
  gestureSensitivity: 200,
  enableGestures: true,
  closeGestureEnabled: true,
  // Sizing (sizing/matters.swift + Constants.swift:83-92)
  closedNotchWidth: 185,
  closedNotchHeight: 32,
  openNotchWidth: 640,
  openNotchHeight: 190,
  // Appearance (Constants.swift:97-118)
  enableShadow: true,
  cornerRadiusScaling: true,
  lightingEffect: true,
  settingsIconInNotch: true,
  useMusicVisualizer: true,
  coloredSpectrogram: true,
  playerColorTinting: true,
  sliderColor: "white",
  // Media (Constants.swift:125-140)
  enableSneakPeek: false,
  waitInterval: 3,
  musicControlSlots: ["none", "previous", "playPause", "next", "none"],
  musicLiveActivityEnabled: true,
  // Battery (Constants.swift:141-145)
  showBatteryIndicator: true,
  showPowerStatusNotifications: true,
  showBatteryPercentage: true,
  // Shelf (Constants.swift:165-172)
  boringShelf: true,
  openShelfByDefault: true,
  // Calendar (Constants.swift:174-179)
  showCalendar: false,
  // Fullscreen (Constants.swift:180-181)
  hideNotchOption: "always",
  // Internal
  firstLaunch: true,
};

export class ConfigStore {
  constructor(dir) {
    this.file = path.join(dir, "config.json");
    this.data = { ...DEFAULT_CONFIG };
    this._load();
  }

  static create() {
    return new ConfigStore(app.getPath("userData"));
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        this.data = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(this.file, "utf8")) };
      }
    } catch {
      this.data = { ...DEFAULT_CONFIG };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }
}
