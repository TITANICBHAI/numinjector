import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { NativeEventEmitter, NativeModules, Platform, Vibration } from "react-native";

export type TargetMode = "auto" | "manual";

export interface InjectorConfig {
  startNumber: number;
  endNumber: number;
  step: number;
  delayMs: number;
  fieldMode: TargetMode;
  fieldHint: string;
  buttonMode: TargetMode;
  buttonHint: string;
  padding: number;
  padChar: string;
  useCommonPins: boolean;
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  config: InjectorConfig;
  result: "found" | "stopped" | "error";
  foundValue: string | null;
  attempts: number;
  durationMs: number;
}

export interface InjectionState {
  running: boolean;
  current: number;
  attempts: number;
  found: boolean;
  foundValue: string | null;
  error: string | null;
  serviceEnabled: boolean;
  overlayGranted: boolean;
}

interface InjectorContextType {
  config: InjectorConfig;
  setConfig: (c: Partial<InjectorConfig>) => void;
  state: InjectionState;
  history: SessionRecord[];
  clearHistory: () => void;
  replaySession: (record: SessionRecord) => void;
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  refreshServiceStatus: () => Promise<void>;
  openAccessibilitySettings: () => void;
  openOverlaySettings: () => void;
  // Tap-to-pick targeting
  pickedField: string | null;
  pickedButton: string | null;
  startFieldPick: () => void;
  startButtonPick: () => void;
  cancelPick: () => void;
  clearPickedField: () => void;
  clearPickedButton: () => void;
  // Floating overlay bubble
  overlayVisible: boolean;
  showOverlay: () => void;
  hideOverlay: () => void;
}

const defaultConfig: InjectorConfig = {
  startNumber: 0,
  endNumber: 9999,
  step: 1,
  delayMs: 400,
  fieldMode: "auto",
  fieldHint: "",
  buttonMode: "auto",
  buttonHint: "",
  padding: 0,
  padChar: "0",
  useCommonPins: false,
};

const defaultState: InjectionState = {
  running: false,
  current: 0,
  attempts: 0,
  found: false,
  foundValue: null,
  error: null,
  serviceEnabled: false,
  overlayGranted: false,
};

// Top ~80 most common 4-digit PINs in the wild
export const COMMON_PINS = [
  "0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","0123","2345","3456","4567","5678","6789","7890",
  "9876","8765","7654","6543","5432","4321","3210",
  "1212","1122","0101","2580","1010","2020","1001","1100","0110","2468",
  "1357","0007","1337","6969","8008","7007","4200","1313","2525","0420",
  "1990","1991","1992","1993","1994","1995","1996","1997","1998","1999",
  "2000","2001","2002","2003","2004","2005","2006","2007","2008","2009","2010",
  "1104","0911","1206","2112","0000","1234","1111","0000",
];

const InjectorContext = createContext<InjectorContextType>({
  config: defaultConfig,
  setConfig: () => {},
  state: defaultState,
  history: [],
  clearHistory: () => {},
  replaySession: () => {},
  onboarded: false,
  setOnboarded: () => {},
  start: async () => {},
  stop: () => {},
  refreshServiceStatus: async () => {},
  openAccessibilitySettings: () => {},
  openOverlaySettings: () => {},
  pickedField: null,
  pickedButton: null,
  startFieldPick: () => {},
  startButtonPick: () => {},
  cancelPick: () => {},
  clearPickedField: () => {},
  clearPickedButton: () => {},
  overlayVisible: false,
  showOverlay: () => {},
  hideOverlay: () => {},
});

const NativeInjector =
  Platform.OS === "android" ? NativeModules.NumberInjector : null;

const STORAGE_KEY_CONFIG = "@numinjector_config";
const STORAGE_KEY_ONBOARDED = "@numinjector_onboarded";
const STORAGE_KEY_HISTORY = "@numinjector_history";
const MAX_HISTORY = 50;

export function InjectorProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<InjectorConfig>(defaultConfig);
  const [state, setState] = useState<InjectionState>(defaultState);
  const [history, setHistory] = useState<SessionRecord[]>([]);
  const [onboarded, setOnboardedState] = useState(false);
  const [pickedField, setPickedField] = useState<string | null>(null);
  const [pickedButton, setPickedButton] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  const sessionConfigRef = useRef<InjectorConfig>(defaultConfig);

  // Load persisted state
  useEffect(() => {
    AsyncStorage.multiGet([
      STORAGE_KEY_CONFIG,
      STORAGE_KEY_ONBOARDED,
      STORAGE_KEY_HISTORY,
    ]).then((pairs) => {
      for (const [key, raw] of pairs) {
        if (!raw) continue;
        try {
          if (key === STORAGE_KEY_CONFIG) {
            const saved = JSON.parse(raw) as Partial<InjectorConfig>;
            setConfigState((prev) => ({ ...prev, ...saved }));
          } else if (key === STORAGE_KEY_ONBOARDED) {
            if (raw === "true") setOnboardedState(true);
          } else if (key === STORAGE_KEY_HISTORY) {
            setHistory(JSON.parse(raw) as SessionRecord[]);
          }
        } catch {}
      }
    });
  }, []);

  // Native event listener
  useEffect(() => {
    if (!NativeInjector) return;
    const emitter = new NativeEventEmitter(NativeInjector);
    const sub = emitter.addListener(
      "NumberInjectorEvent",
      (event: {
        type: string;
        current?: number;
        attempts?: number;
        value?: string;
        error?: string;
      }) => {
        if (event.type === "progress") {
          setState((prev) => ({
            ...prev,
            current: event.current ?? prev.current,
            attempts: event.attempts ?? prev.attempts,
          }));
        } else if (event.type === "fieldPicked") {
          setPickedField(event.label ?? "field");
        } else if (event.type === "buttonPicked") {
          setPickedButton(event.label ?? "button");
        } else if (event.type === "found") {
          const dur = sessionStartRef.current
            ? Date.now() - sessionStartRef.current
            : 0;
          // Triple-pulse haptic: success found signal
          Vibration.vibrate([0, 200, 100, 200, 100, 400]);
          setState((prev) => {
            addToHistory({
              result: "found",
              foundValue: event.value ?? null,
              attempts: event.attempts ?? prev.attempts,
              durationMs: dur,
              config: sessionConfigRef.current,
            });
            return { ...prev, running: false, found: true, foundValue: event.value ?? null };
          });
        } else if (event.type === "stopped") {
          const dur = sessionStartRef.current
            ? Date.now() - sessionStartRef.current
            : 0;
          setState((prev) => {
            addToHistory({
              result: "stopped",
              foundValue: null,
              attempts: event.attempts ?? prev.attempts,
              durationMs: dur,
              config: sessionConfigRef.current,
            });
            return { ...prev, running: false };
          });
        } else if (event.type === "error") {
          const dur = sessionStartRef.current
            ? Date.now() - sessionStartRef.current
            : 0;
          setState((prev) => {
            addToHistory({
              result: "error",
              foundValue: null,
              attempts: prev.attempts,
              durationMs: dur,
              config: sessionConfigRef.current,
            });
            return { ...prev, running: false, error: event.error ?? "Unknown error" };
          });
        }
      }
    );
    return () => sub.remove();
  }, []);

  const addToHistory = useCallback(
    (partial: Omit<SessionRecord, "id" | "timestamp">) => {
      const record: SessionRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        ...partial,
      };
      setHistory((prev) => {
        const next = [record, ...prev].slice(0, MAX_HISTORY);
        AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(STORAGE_KEY_HISTORY);
  }, []);

  const replaySession = useCallback((record: SessionRecord) => {
    setConfigState(record.config);
    AsyncStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(record.config));
  }, []);

  const refreshServiceStatus = useCallback(async () => {
    if (!NativeInjector) return;
    try {
      const [enabled, overlay] = await Promise.all([
        NativeInjector.isAccessibilityServiceEnabled() as Promise<boolean>,
        NativeInjector.hasOverlayPermission() as Promise<boolean>,
      ]);
      setState((prev) => ({ ...prev, serviceEnabled: enabled, overlayGranted: overlay }));
    } catch {}
  }, []);

  useEffect(() => {
    refreshServiceStatus();
  }, [refreshServiceStatus]);

  const setConfig = useCallback((partial: Partial<InjectorConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(next));
      return next;
    });
  }, []);

  const setOnboarded = useCallback((v: boolean) => {
    setOnboardedState(v);
    AsyncStorage.setItem(STORAGE_KEY_ONBOARDED, v ? "true" : "false");
  }, []);

  const start = useCallback(async () => {
    if (!NativeInjector) {
      setState((prev) => ({
        ...prev,
        error: "Native module not available. Build a development APK.",
      }));
      return;
    }
    sessionStartRef.current = Date.now();
    sessionConfigRef.current = config;
    setState((prev) => ({
      ...prev,
      running: true,
      found: false,
      foundValue: null,
      error: null,
      attempts: 0,
      current: config.startNumber,
    }));
    try {
      await NativeInjector.startInjection({
        startNumber: config.startNumber,
        endNumber: config.endNumber,
        step: config.step,
        delayMs: config.delayMs,
        fieldMode: config.fieldMode,
        fieldHint: config.fieldHint,
        buttonMode: config.buttonMode,
        buttonHint: config.buttonHint,
        padding: config.padding,
        padChar: config.padChar,
        useCommonPins: config.useCommonPins,
        priorityPins: config.useCommonPins ? COMMON_PINS : [],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((prev) => ({ ...prev, running: false, error: msg }));
    }
  }, [config]);

  const stop = useCallback(() => {
    if (NativeInjector) NativeInjector.stopInjection().catch(() => {});
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  const openAccessibilitySettings = useCallback(() => {
    NativeInjector?.openAccessibilitySettings().catch(() => {});
  }, []);

  const openOverlaySettings = useCallback(() => {
    NativeInjector?.openOverlaySettings().catch(() => {});
  }, []);

  // ── Tap-to-pick targeting ────────────────────────────────────────────────

  const startFieldPick = useCallback(() => {
    NativeInjector?.startFieldPick().catch(() => {});
  }, []);

  const startButtonPick = useCallback(() => {
    NativeInjector?.startButtonPick().catch(() => {});
  }, []);

  const cancelPick = useCallback(() => {
    NativeInjector?.cancelPick().catch(() => {});
  }, []);

  const clearPickedField = useCallback(() => {
    setPickedField(null);
    NativeInjector?.clearPickedField().catch(() => {});
  }, []);

  const clearPickedButton = useCallback(() => {
    setPickedButton(null);
    NativeInjector?.clearPickedButton().catch(() => {});
  }, []);

  // ── Floating overlay bubble ──────────────────────────────────────────────

  const showOverlay = useCallback(() => {
    NativeInjector?.showOverlay()
      .then(() => setOverlayVisible(true))
      .catch(() => {});
  }, []);

  const hideOverlay = useCallback(() => {
    NativeInjector?.hideOverlay()
      .then(() => setOverlayVisible(false))
      .catch(() => {});
  }, []);

  return (
    <InjectorContext.Provider
      value={{
        config,
        setConfig,
        state,
        history,
        clearHistory,
        replaySession,
        onboarded,
        setOnboarded,
        start,
        stop,
        refreshServiceStatus,
        openAccessibilitySettings,
        openOverlaySettings,
        pickedField,
        pickedButton,
        startFieldPick,
        startButtonPick,
        cancelPick,
        clearPickedField,
        clearPickedButton,
        overlayVisible,
        showOverlay,
        hideOverlay,
      }}
    >
      {children}
    </InjectorContext.Provider>
  );
}

export function useInjector() {
  return useContext(InjectorContext);
}
