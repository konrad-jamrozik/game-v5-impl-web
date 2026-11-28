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
 * in CONFIG; see MUSIC, Music settings, SOUNDS, Sound settings, CSCR, Autopilot settings, and VIS, Screen limit.
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
  // TSUM, Tutorials: whether the game teaches the Player as they play; nothing reads it yet.
  {
    setting: 'tutorialsOn',
    name: 'Tutorials on',
    gameBuildDefault: true,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
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
  // CSCR, Autopilot settings: whether the Autopilot controls are expanded, and the chosen Autopilot AI, '' for none.
  {
    setting: 'autopilotControlsExpanded',
    name: 'Autopilot controls expanded',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  {
    setting: 'autopilotAi',
    name: 'Autopilot AI',
    gameBuildDefault: '',
    permitted: 'The ID of an Autopilot AI, or empty text for none',
    isPermitted: (value): value is SettingValue => typeof value === 'string',
  },
  // GUI, Developer tools: whether the GUI keeps Dev mode enabled, and whether Reveal hidden content is on.
  {
    setting: 'devModeOn',
    name: 'Dev mode on',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  {
    setting: 'revealHiddenContentOn',
    name: 'Reveal hidden content on',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  // CSIM, Opening the Combat simulator: whether the Main menu shows the Combat simulator button.
  {
    setting: 'combatSimulatorShown',
    name: 'Combat simulator shown',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  // CSIM, Teams: the setup of the Combat simulator as JSON, or empty text for the Game build default. Whether its rows
  // name only Weapons, Armors, and EnemyArchetypes of the Game build is checked where the setup is read.
  {
    setting: 'combatSimulatorSetup',
    name: 'Combat simulator setup',
    gameBuildDefault: '',
    permitted:
      'A JSON object of the rows, the presets, and the Detached seed, or empty text for the Game build default',
    isPermitted: (value): value is SettingValue => value === '' || isJsonSetup(value),
  },
  // VIS, Screen limit: whether every screen is drawn at the size of the Reference window, centred in the window.
  {
    setting: 'screenLimit',
    name: 'Screen limit',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  // CSCR, Hiding the Side panel: whether the Side panel is hidden.
  {
    setting: 'sidePanelHidden',
    name: 'Side panel hidden',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  // CSCR, Globe devastation controls: whether the Globe stage shows them, while Dev mode is enabled.
  {
    setting: 'globeDevastationControlsShown',
    name: 'Globe devastation controls shown',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
  // VIS, Charts: the charts whose "Last 100 Turns" checkbox is checked, as a JSON array of chart names.
  {
    setting: 'lastTurnsCharts',
    name: 'Last 100 Turns charts',
    gameBuildDefault: '[]',
    permitted: 'A JSON array of chart names',
    isPermitted: (value): value is SettingValue => isJsonArrayOfText(value),
  },
  // VIS, Artwork tuning: the tuned values of each BackgroundArtwork, as a JSON object by BackgroundArtwork ID.
  {
    setting: 'artworkTuning',
    name: 'Artwork tuning',
    gameBuildDefault: '{}',
    permitted:
      'A JSON object of tuned values, each an opacity percentage and an image path, by BackgroundArtwork ID',
    isPermitted: (value): value is SettingValue => isJsonTuning(value),
  },
  // CRPLAY, Options: whether the Options of the Combat replay are shown.
  {
    setting: 'combatReplayOptionsShown',
    name: 'Combat replay Options shown',
    gameBuildDefault: false,
    permitted: 'true or false',
    isPermitted: (value): value is SettingValue => typeof value === 'boolean',
  },
];

function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isJsonArrayOfText(value: unknown): boolean {
  const parsed = parsedJson(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string');
}

function isJsonSetup(value: unknown): boolean {
  const parsed = parsedJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const { team, site, seed, agents, enemies } = parsed as Record<string, unknown>;
  return (
    typeof team === 'string' &&
    typeof site === 'string' &&
    typeof seed === 'string' &&
    Array.isArray(agents) &&
    Array.isArray(enemies)
  );
}

function isJsonTuning(value: unknown): boolean {
  const parsed = parsedJson(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  return Object.values(parsed as Record<string, unknown>).every((tuning) => {
    if (typeof tuning !== 'object' || tuning === null) {
      return false;
    }
    const { opacityPct, image } = tuning as Record<string, unknown>;
    return (
      typeof opacityPct === 'number' &&
      Number.isSafeInteger(opacityPct) &&
      opacityPct >= 0 &&
      opacityPct <= 100 &&
      typeof image === 'string'
    );
  });
}

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
