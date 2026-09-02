import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { FREE_TIME_OPTIONS } from "../../data/seed";
import { colors, radii } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";
import { SectionCard, QuickButton, EmptyState } from "../../components/ui";

export default function MemberRegistrationPanel({
  openRegular,
  openSummer,
  selectedTimes,
  setSelectedTimes,
  summerTimes,
  setSummerTimes,
  onSubmit,
}) {
  return (
    <View>
      <SectionCard
        title="التسجيل في الموسم"
        subtitle="اختر أوقات فراغك ثم أرسل الطلب"
      >
        {openRegular.length === 0 ? (
          <EmptyState text="تسجيل الموسم العادي مغلق حالياً" />
        ) : (
          <RegistrationBlock
            options={FREE_TIME_OPTIONS}
            selected={selectedTimes}
            onToggle={(t) =>
              setSelectedTimes((prev) =>
                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
              )
            }
            seasons={openRegular}
            buttonLabel="إرسال استمارة الموسم"
            buttonColor={colors.primary}
            onSubmit={(id) => onSubmit(id, selectedTimes, setSelectedTimes)}
          />
        )}
      </SectionCard>

      <SectionCard
        title="المدرسة الصيفية"
        subtitle="تسجيل منفصل عن الموسم العادي"
        borderColor="#FFE0B2"
        primary={colors.orange}
      >
        {openSummer.length === 0 ? (
          <EmptyState text="تسجيل المدرسة الصيفية مغلق حالياً" />
        ) : (
          <RegistrationBlock
            options={FREE_TIME_OPTIONS}
            selected={summerTimes}
            onToggle={(t) =>
              setSummerTimes((prev) =>
                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
              )
            }
            seasons={openSummer}
            buttonLabel="إرسال استمارة الصيف"
            buttonColor={colors.orange}
            onSubmit={(id) => onSubmit(id, summerTimes, setSummerTimes)}
          />
        )}
      </SectionCard>
    </View>
  );
}
function RegistrationBlock({
  options,
  selected,
  onToggle,
  seasons,
  buttonLabel,
  buttonColor,
  onSubmit,
}) {
  return (
    <View>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.timeChip, selected.includes(opt) && styles.timeActive]}
          onPress={() => onToggle(opt)}
        >
          <Text
            style={[
              styles.timeText,
              selected.includes(opt) && styles.timeTextActive,
            ]}
          >
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
      {seasons.map((s) => (
        <QuickButton
          key={s.id}
          color={buttonColor}
          icon="send"
          label={`${buttonLabel} — ${s.name}`}
          onPress={() => onSubmit(s.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  timeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  timeActive: {
    backgroundColor: colors.soft,
    borderColor: colors.primary,
  },
  timeText: {
    ...rtlText,
    color: colors.muted,
  },
  timeTextActive: {
    color: colors.primary,
    fontWeight: "bold",
  },
});