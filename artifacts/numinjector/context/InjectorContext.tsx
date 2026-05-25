import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  NativeEventEmitter,
  NativeModules,
  Platform,
} from "react-native";

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
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;
  start: () => Promise<void>;
  stop: () => void;
  refreshServiceStatus: () => Promise<void>;
  openAccessibilitySettings: () => void;
  openOverlaySettings: () => void;
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

const InjectorContext = createContext<InjectorContextType>({
  config: defaultConfig,
  setConfig: () => {},
  state: defaultState,
  onboarded: false,
  setOnboarded: () => {},
  start: async () => {},
  stop: () => {},
  refreshServiceStatus: async () => {},
  openAccessibilitySettings: () => {},
  openOverlaySettings: () => {},
});

const NativeInjector =
  Platform.OS === "android" ? NativeModules.NumberInjector : null;

const STORAGE_KEY_CONFIG = "@numinjector_config";
const STORAGE_KEY_ONBOARDED = "@numinjector_onboarded";

export function InjectorProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<InjectorConfig>(defaultConfig);
  const [state, setState] = useState<InjectionState>(defaultState);
  const [onboarded, setOnboardedState] = useState(false);
  const emitterRef = useRef<NativeEventEmitter | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_CONFIG).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<InjectorConfig>;
          setConfigState((prev) => ({ ...prev, ...saved }));
        } catch {}
      }
    });
    AsyncStorage.getItem(STORAGE_KEY_ONBOARDED).then((val) => {
      if (val === "true") setOnboardedState(true);
    });
  }, []);

  useEffect(() => {
    if (!NativeInjector) return;

    const emitter = new NativeEventEmitter(NativeInjector);
    emitterRef.current = emitter;

    const sub = emitter.addListener(
      "NumberInjectorEvent",
      (event: {
        type: string;
        current?: number;
        attempts?: number;
        found?: boolean;
        value?: string;
        error?: string;
      }) => {
        if (event.type === "progress") {
          setState((prev) => ({
            ...prev,
            current: event.current ?? prev.current,
            attempts: event.attempts ?? prev.attempts,
          }));
        } else if (event.type === "found") {
          setState((prev) => ({
            ...prev,
            running: false,
            found: true,
            foundValue: event.value ?? null,
          }));
        } else if (event.type === "stopped") {
          setState((prev) => ({ ...prev, running: false }));
        } else if (event.type === "error") {
          setState((prev) => ({
            ...prev,
            running: false,
            error: event.error ?? "Unknown error",
          }));
        }
      }
    );

    return () => sub.remove();
  }, []);

  const refreshServiceStatus = useCallback(async () => {
    if (!NativeInjector) return;
    try {
      const [enabled, overlay] = await Promise.all([
        NativeInjector.isAccessibilityServiceEnabled() as Promise<boolean>,
        NativeInjector.hasOverlayPermission() as Promise<boolean>,
      ]);
      setState((prev) => ({
        ...prev,
        serviceEnabled: enabled,
        overlayGranted: overlay,
      }));
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
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((prev) => ({ ...prev, running: false, error: msg }));
    }
  }, [config]);

  const stop = useCallback(() => {
    if (NativeInjector) {
      NativeInjector.stopInjection().catch(() => {});
    }
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  const openAccessibilitySettings = useCallback(() => {
    if (NativeInjector) {
      NativeInjector.openAccessibilitySettings().catch(() => {});
    }
  }, []);

  const openOverlaySettings = useCallback(() => {
    if (NativeInjector) {
      NativeInjector.openOverlaySettings().catch(() => {});
    }
  }, []);

  return (
    <InjectorContext.Provider
      value={{
        config,
        setConfig,
        state,
        onboarded,
        setOnboarded,
        start,
        stop,
        refreshServiceStatus,
        openAccessibilitySettings,
        openOverlaySettings,
      }}
    >
      {children}
    </InjectorContext.Provider>
  );
}

export function useInjector() {
  return useContext(InjectorContext);
}
