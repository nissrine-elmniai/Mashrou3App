import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle, Polyline, Line } from "react-native-svg";
import { rtlText, row } from "../../constants/rtl";

const DEFAULT_COLORS = ["#2E7D32", "#81C784", "#A5D6A7", "#C8E6C9", "#FBC02D"];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

/** Camembert / donut pour répartitions. */
export function DonutChart({
  segments = [],
  size = 160,
  stroke = 22,
  centerLabel,
  centerSub,
  colors = DEFAULT_COLORS,
  emptyLabel = "لا بيانات",
}) {
  const total = segments.reduce((n, s) => n + (Number(s.value) || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let angle = 0;
    return segments
      .filter((s) => (Number(s.value) || 0) > 0)
      .map((s, i) => {
        const value = Number(s.value) || 0;
        const sweep = (value / total) * 360;
        const start = angle;
        const end = angle + Math.max(sweep, 0.5);
        angle += sweep;
        return {
          key: s.key || s.label || String(i),
          label: s.label,
          value,
          color: s.color || colors[i % colors.length],
          d: describeArc(cx, cy, r, start, end),
        };
      });
  }, [segments, total, cx, cy, r, colors]);

  return (
    <View style={styles.donutWrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="#E8E8E8"
            strokeWidth={stroke}
            fill="none"
          />
          {arcs.map((a) => (
            <Path
              key={a.key}
              d={a.d}
              stroke={a.color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="butt"
            />
          ))}
        </Svg>
        <View style={styles.donutCenter}>
          {total <= 0 ? (
            <Text style={styles.donutEmpty}>{emptyLabel}</Text>
          ) : (
            <>
              {centerLabel != null ? (
                <Text style={styles.donutCenterValue}>{centerLabel}</Text>
              ) : null}
              {centerSub ? (
                <Text style={styles.donutCenterSub}>{centerSub}</Text>
              ) : null}
            </>
          )}
        </View>
      </View>
      <View style={styles.legendCol}>
        {segments.map((s, i) => {
          const value = Number(s.value) || 0;
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <View key={s.key || s.label || i} style={styles.legendRow}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: s.color || colors[i % colors.length] },
                ]}
              />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {s.label}
              </Text>
              <Text style={styles.legendValue}>
                {value} · {pct}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Barres verticales pour comparer des catégories. */
export function BarChart({
  items = [],
  height = 140,
  barColor = "#2E7D32",
  valueSuffix = "",
  emptyLabel = "لا بيانات للمقارنة",
}) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));

  if (!items.length) {
    return <Text style={styles.chartEmpty}>{emptyLabel}</Text>;
  }

  return (
    <View style={[styles.barChart, { height: height + 36 }]}>
      {items.map((item, index) => {
        const value = Number(item.value) || 0;
        const h = Math.max(4, Math.round((value / max) * height));
        return (
          <View key={item.key || item.label || index} style={styles.barCol}>
            <Text style={styles.barValue}>
              {value}
              {valueSuffix}
            </Text>
            <View style={[styles.barTrack, { height }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    height: h,
                    backgroundColor: item.color || barColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.barLabel} numberOfLines={2}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Courbe d'évolution. */
export function LineChart({
  points = [],
  width = 300,
  height = 160,
  color = "#2E7D32",
  emptyLabel = "لا بيانات زمنية بعد",
}) {
  if (!points.length) {
    return <Text style={styles.chartEmpty}>{emptyLabel}</Text>;
  }

  const padL = 28;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const values = points.map((p) => Number(p.value) || 0);
  const max = Math.max(100, ...values, 1);
  const min = 0;

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? padL + chartW / 2
        : padL + (i / (points.length - 1)) * chartW;
    const y =
      padT + chartH - ((Number(p.value) || 0) - min) / (max - min) * chartH;
    return { x, y, ...p };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 0.5, 1].map((t) => {
          const y = padT + chartH * (1 - t);
          return (
            <Line
              key={t}
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="#E8E8E8"
              strokeWidth={1}
            />
          );
        })}
        <Polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={4} fill={color} />
        ))}
      </Svg>
      <View style={[styles.lineLabels, { paddingLeft: padL, paddingRight: padR }]}>
        {points.map((p, i) => (
          <Text key={p.key || i} style={styles.lineLabel} numberOfLines={1}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Barre de progression horizontale (indicateur %). */
export function ProgressMeter({
  label,
  value = 0,
  color = "#2E7D32",
  trackColor = "#E8F5E9",
}) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterValue, { color }]}>{clamped}%</Text>
      </View>
      <View style={[styles.meterTrack, { backgroundColor: trackColor }]}>
        <View
          style={[
            styles.meterFill,
            { width: `${clamped}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  donutWrap: {
    flexDirection: row,
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  donutCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  donutCenterValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2E7D32",
    ...rtlText,
  },
  donutCenterSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
    ...rtlText,
  },
  donutEmpty: {
    fontSize: 12,
    color: "#999",
    ...rtlText,
  },
  legendCol: {
    flex: 1,
    minWidth: 140,
    gap: 10,
  },
  legendRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    color: "#333",
    ...rtlText,
  },
  legendValue: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    ...rtlText,
  },
  barChart: {
    flexDirection: row,
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    minWidth: 36,
  },
  barValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2E7D32",
    marginBottom: 4,
    ...rtlText,
  },
  barTrack: {
    width: "70%",
    maxWidth: 36,
    justifyContent: "flex-end",
    backgroundColor: "#F0F0F0",
    borderRadius: 8,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barLabel: {
    marginTop: 6,
    fontSize: 10,
    color: "#666",
    textAlign: "center",
    ...rtlText,
  },
  chartEmpty: {
    textAlign: "center",
    color: "#999",
    paddingVertical: 24,
    fontSize: 13,
    ...rtlText,
  },
  lineLabels: {
    flexDirection: row,
    justifyContent: "space-between",
    marginTop: -20,
  },
  lineLabel: {
    flex: 1,
    fontSize: 10,
    color: "#666",
    textAlign: "center",
    ...rtlText,
  },
  meterWrap: { gap: 8 },
  meterHeader: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
  },
  meterLabel: {
    fontSize: 13,
    color: "#666",
    ...rtlText,
  },
  meterValue: {
    fontSize: 16,
    fontWeight: "800",
    ...rtlText,
  },
  meterTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 999,
  },
});
