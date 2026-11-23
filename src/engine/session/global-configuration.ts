/**
 * Global configuration: the one persisted set of application-wide settings; see CONFIG, Global configuration. Only
 * values the player has set are stored, so an unset setting follows the Game build default.
 */
export type SettingValue = number | string | boolean;

export interface SettingDescriptor {
  readonly setting: string;
  readonly name: string;
  readonly gameBuildDefault: SettingValue;
  /** The permitted values, described for an interface. */
  readonly permitted: string;
  isPermitted(value: unknown): value is SettingValue;
}

/**
 * The complete set of Global configuration settings of this Game build, in the order of the Global configuration table
 * in CONFIG; see MUSIC, Music settings, SOUNDS, Sound settings, and CSCR, Autopilot settings.
 */
export const SETTINGS: readonly SettingDescriptor[] = [
  {
    setting: 'autosaveLimit',
    name: 'Autosave limit',
    gameBuildDefault: 5,
    permitted: 'A whole number of at least 0',
    isPermitted: (value): value is SettingValue =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  },
  {
    setting: 'autopilotAutosaveLimit',
    name: 'Autopilot Autosave limit',
    gameBuildDefault: 5,
    permitted: 'A whole number of at least 0',
    isPermitted: (value): value is SettingValue =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
  },
  {
    setting: 'musicOn',
    name: 'Music on',
    gameBuildDefault: true,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  {
    setting: 'musicVolume',
    name: 'Music volume',
    gameBuildDefault: 50,
    permitted: 'A whole number from 0 to 100',
    isPermitted: (value): value is SettingValue =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100,
  },
  {
    setting: 'soundsOn',
    name: 'Sounds on',
    gameBuildDefault: true,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  {
    setting: 'soundsVolume',
    name: 'Sounds volume',
    gameBuildDefault: 100,
    permitted: 'A whole number from 0 to 100',
    isPermitted: (value): value is SettingValue =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100,
  },
  // CSCR, Autopilot settings: whether the Autopilot controls are shown, and the number of Turns of the Turns field.
  {
    setting: 'autopilotControlsShown',
    name: 'Autopilot controls shown',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  {
    setting: 'autopilotTurns',
    name: 'Autopilot Turns',
    gameBuildDefault: 10,
    permitted: 'A whole number of at least 1',
    isPermitted: (value): value is SettingValue =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 1,
  },
];

export interface SettingReport {
  readonly setting: string;
  readonly name: string;
  readonly effectiveValue: SettingValue;
  readonly gameBuildDefault: SettingValue;
  /** Whether a stored value overrides the Game build default. */
  readonly stored: boolean;
  readonly permitted: string;
}

export interface GlobalConfigurationReport {
  readonly settings: readonly SettingReport[];
  /** Stored values that are invalid in this Game build; the Game build default applies to each. */
  readonly problems: readonly string[];
}

export class GlobalConfiguration {
  private stored = new Map<string, unknown>();
  private readonly loadProblems: string[] = [];

  /** Reads the stored text. Starting the game never fails because of an invalid stored value. */
  load(text: string | null): void {
    this.stored = new Map();
    this.loadProblems.length = 0;
    if (text === null) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          this.stored.set(key, value);
        }
        return;
      }
    } catch {
      // reported below
    }
    this.loadProblems.push('The stored Global configuration could not be read; Game build defaults apply.');
  }

  encode(): string {
    return JSON.stringify(Object.fromEntries(this.stored));
  }

  descriptor(setting: string): SettingDescriptor | null {
    return SETTINGS.find((item) => item.setting === setting) ?? null;
  }

  effective(setting: string): SettingValue {
    const descriptor = this.descriptor(setting);
    if (!descriptor) {
      throw new Error(`Unknown setting ${setting}`);
    }
    const value = this.stored.get(setting);
    return descriptor.isPermitted(value) ? value : descriptor.gameBuildDefault;
  }

  report(): GlobalConfigurationReport {
    const problems = [...this.loadProblems];
    const settings = SETTINGS.map((descriptor) => {
      const has = this.stored.has(descriptor.setting);
      const value = this.stored.get(descriptor.setting);
      const valid = has && descriptor.isPermitted(value);
      if (has && !valid) {
        problems.push(
          `The stored value of ${descriptor.name} is not permitted in this Game build; the Game build default applies.`,
        );
      }
      return {
        setting: descriptor.setting,
        name: descriptor.name,
        effectiveValue: valid ? value : descriptor.gameBuildDefault,
        gameBuildDefault: descriptor.gameBuildDefault,
        stored: valid,
        permitted: descriptor.permitted,
      };
    });
    return { settings, problems };
  }

  set(setting: string, value: SettingValue): void {
    this.stored.set(setting, value);
  }

  reset(setting: string): void {
    this.stored.delete(setting);
  }
}
