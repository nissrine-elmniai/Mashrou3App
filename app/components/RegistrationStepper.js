import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  REGISTRATION_STEPS,
  REGISTRATION_STATUS,
} from "../constants/roles";
import { colors, radii } from "../constants/theme";
import { rtlText, row } from "../constants/rtl";

/**
 * Stepper 5 étapes : التسجيل → المراجعة → مقبول → الدعوة → إنشاء حساب
 * activeStep: 1..5
 */
export default function RegistrationStepper({
  activeStep = 1,
  rejected = false,
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {REGISTRATION_STEPS.map((step, index) => {
          const n = index + 1;
          const done = n < activeStep && !rejected;
          const active = n === activeStep && !rejected;
          const isRejected = rejected && n === 2;
          const circleBg = isRejected
            ? colors.red
            : active || done
              ? colors.primary
              : colors.inputBg;
          const circleFg =
            active || done || isRejected ? "#fff" : colors.muted;
          const showLine = index < REGISTRATION_STEPS.length - 1;
          const lineDone = n < activeStep && !rejected;

          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepCol}>
                <View style={[styles.circle, { backgroundColor: circleBg }]}>
                  <Text style={[styles.circleText, { color: circleFg }]}>
                    {n}
                  </Text>
                </View>
              </View>
              {showLine ? (
                <View
                  style={[
                    styles.line,
                    { backgroundColor: lineDone ? colors.primary : "#D1D5DB" },
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {REGISTRATION_STEPS.map((step, index) => {
          const n = index + 1;
          const done = n < activeStep && !rejected;
          const active = n === activeStep && !rejected;
          const isRejected = rejected && n === 2;
          const pillActive = active || done || isRejected;
          return (
            <View
              key={step.key}
              style={[
                styles.pill,
                {
                  backgroundColor: pillActive
                    ? isRejected
                      ? colors.red
                      : colors.primary
                    : colors.inputBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: pillActive ? "#fff" : colors.muted },
                ]}
                numberOfLines={1}
              >
                {isRejected ? "مرفوض" : step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function statusToStepper(status) {
  if (status === REGISTRATION_STATUS.REJECTED) {
    return { activeStep: 2, rejected: true };
  }
  if (status === REGISTRATION_STATUS.PENDING) {
    return { activeStep: 2, rejected: false };
  }
  if (status === REGISTRATION_STATUS.ACCEPTED) {
    return { activeStep: 3, rejected: false };
  }
  if (status === REGISTRATION_STATUS.INVITED) {
    return { activeStep: 4, rejected: false };
  }
  if (status === REGISTRATION_STATUS.ACTIVATED) {
    return { activeStep: 5, rejected: false };
  }
  return { activeStep: 1, rejected: false };
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20, width: "100%" },
  row: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  stepCol: { alignItems: "center" },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  circleText: { fontSize: 14, fontWeight: "700" },
  line: { flex: 1, height: 2, marginHorizontal: 4 },
  labelsRow: {
    flexDirection: row,
    justifyContent: "space-between",
    marginTop: 10,
    gap: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  pillText: {
    fontSize: 10,
    fontWeight: "600",
    ...rtlText,
    textAlign: "center",
  },
});
