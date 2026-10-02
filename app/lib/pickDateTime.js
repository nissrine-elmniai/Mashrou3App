import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { localDateToIso, localTimeToHm } from "../constants/tests";

/**
 * Enchaîne une date puis une heure.
 * Android ouvre deux dialogues natifs ; la date choisie est passée
 * directement au dialogue heure, sans state React.
 * iOS laisse le picker inline de l'écran : la valeur courante est un ref,
 * lu seulement au « تم » de l'étape heure.
 *
 * @param {{ minimumDate?: Date, initialDate?: Date, timeOnly?: boolean }} options
 * @returns {Promise<{ date: string, heure: string } | null>}
 */
export function pickDateTime(options = {}) {
  if (Platform.OS === "android") return pickAndroid(options);
  const bridge = iosBridges[iosBridges.length - 1];
  if (!bridge) return Promise.resolve(null);
  return bridge.start(options);
}

function openAndroidDialog({ mode, value, minimumDate }) {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      mode,
      value,
      is24Hour: true,
      minimumDate: mode === "date" ? minimumDate : undefined,
      onChange: (event, selected) => {
        if (event?.type !== "set" || !(selected instanceof Date)) {
          resolve(null);
          return;
        }
        resolve(selected);
      },
    });
  });
}

async function pickAndroid({ minimumDate, initialDate, timeOnly = false }) {
  const start = initialDate instanceof Date ? initialDate : new Date();
  if (timeOnly) {
    const picked = await openAndroidDialog({ mode: "time", value: start });
    if (!picked) return null;
    const heure = localTimeToHm(picked);
    if (!heure) return null;
    return { date: localDateToIso(start), heure };
  }

  const pickedDate = await openAndroidDialog({
    mode: "date",
    value: start,
    minimumDate,
  });
  if (!pickedDate) return null;
  const date = localDateToIso(pickedDate);
  if (!date) return null;

  const pickedTime = await openAndroidDialog({ mode: "time", value: pickedDate });
  if (!pickedTime) return null;
  const heure = localTimeToHm(pickedTime);
  if (!heure) return null;
  return { date, heure };
}

const iosBridges = [];

/** Picker inline iOS branché sur pickDateTime. Android n'affiche rien. */
export function useIosDateTimePicker() {
  const draftRef = useRef(new Date());
  const dateIsoRef = useRef("");
  const requestRef = useRef(null);
  const [step, setStep] = useState(null);
  const [shown, setShown] = useState(() => new Date());
  const [minimumDate, setMinimumDate] = useState(undefined);

  const start = useCallback((options) => {
    return new Promise((resolve) => {
      if (requestRef.current) requestRef.current.resolve(null);
      const initial = options.initialDate instanceof Date ? options.initialDate : new Date();
      draftRef.current = initial;
      dateIsoRef.current = options.timeOnly ? localDateToIso(initial) : "";
      requestRef.current = { resolve };
      setMinimumDate(options.minimumDate);
      setShown(initial);
      setStep(options.timeOnly ? "time" : "date");
    });
  }, []);

  useEffect(() => {
    const bridge = { start };
    iosBridges.push(bridge);
    return () => {
      const index = iosBridges.lastIndexOf(bridge);
      if (index >= 0) iosBridges.splice(index, 1);
      if (requestRef.current) {
        requestRef.current.resolve(null);
        requestRef.current = null;
      }
    };
  }, [start]);

  const onChange = (_event, selected) => {
    if (!(selected instanceof Date)) return;
    draftRef.current = selected;
    setShown(selected);
  };

  const confirm = () => {
    const request = requestRef.current;
    if (!request || !step) return;
    if (step === "date") {
      const iso = localDateToIso(draftRef.current);
      if (!iso) return;
      dateIsoRef.current = iso;
      setStep("time");
      return;
    }
    const heure = localTimeToHm(draftRef.current);
    const date = dateIsoRef.current;
    requestRef.current = null;
    setStep(null);
    if (!date || !heure) {
      request.resolve(null);
      return;
    }
    request.resolve({ date, heure });
  };

  if (Platform.OS !== "ios" || !step) return null;

  return {
    step,
    value: shown,
    minimumDate: step === "date" ? minimumDate : undefined,
    onChange,
    confirm,
  };
}

export function IosDateTimePicker({ picker }) {
  if (!picker) return null;
  return (
    <DateTimePicker
      value={picker.value}
      mode={picker.step === "date" ? "date" : "time"}
      is24Hour
      locale="en-GB"
      minimumDate={picker.minimumDate}
      display="spinner"
      onChange={picker.onChange}
    />
  );
}
