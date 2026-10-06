import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, I18nManager } from "react-native";
import Svg, { Path, Circle, Polyline, Line, Text as SvgText } from "react-native-svg";
import { rtlText, row } from "../../constants/rtl";

const DEFAULT_COLORS = ["#2E7D32", "#81C784", "#A5D6A7", "#C8E6C9", "#FBC02D"];

/** Trait jaune sous un titre, sur 60 % de la largeur du texte, aligné à droite. */
export function UnderlinedTitle({ children, style }) {
  const [textWidth, setTextWidth] = useState(0);
  return (
    <View style={styles.underlinedTitle}>
      <Text
        style={style}
        onTextLayout={(event) => {
          const lines = event.nativeEvent.lines || [];
          const width = lines.reduce((max, line) => Math.max(max, line.width || 0), 0);
          if (width > 0 && Math.abs(width - textWidth) > 0.5) setTextWidth(width);
        }}
      >
        {children}
      </Text>
      <View style={[styles.titleUnderline, { width: textWidth * 0.6 }]} />
    </View>
  );
}

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
        // Un arc de 360° a le même point de départ et d'arrivée : SVG ne le trace pas.
        const full = sweep >= 359.99;
        const start = angle;
        const end = angle + (full ? sweep : Math.max(sweep, 0.5));
        angle += sweep;
        return {
          key: s.key || s.label || String(i),
          label: s.label,
          value,
          color: s.color || colors[i % colors.length],
          full,
          d: full ? null : describeArc(cx, cy, r, start, end),
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
          {arcs.map((a) =>
            a.full ? (
              <Circle
                key={a.key}
                cx={cx}
                cy={cy}
                r={r}
                stroke={a.color}
                strokeWidth={stroke}
                fill="none"
              />
            ) : (
              <Path
                key={a.key}
                d={a.d}
                stroke={a.color}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="butt"
              />
            )
          )}
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
  trackColor = "#F0F0F0",
  valueColor = "#2E7D32",
  negativeColor = "#D32F2F",
  valueSuffix = "",
  hideZeroFill = false,
  hideNonPositive = false,
  formatValue,
  barWidth,
  barGap,
  paddingTop = 0,
  emptyLabel = "لا بيانات للمقارنة",
}) {
  const numeric = items
    .map((i) => i.value)
    .filter((v) => v != null && v !== "" && Number.isFinite(Number(v)) && Number(v) > 0);
  const max = Math.max(1, ...numeric.map((v) => Number(v)));

  if (!items.length) {
    return <Text style={styles.chartEmpty}>{emptyLabel}</Text>;
  }

  return (
    <View
      style={[
        styles.barChart,
        barWidth ? { height: undefined, justifyContent: "flex-start", alignItems: "flex-start", paddingTop, gap: 0 } : { height: height + 48 },
        !barWidth && barGap != null ? { gap: barGap } : null,
      ]}
    >
      {items.map((item, index) => {
        const missing = item.value == null || item.value === "";
        const value = missing ? null : Number(item.value);
        const finite = Number.isFinite(value);
        const noFill =
          !finite ||
          (hideZeroFill && value === 0) ||
          (hideNonPositive && value <= 0);
        const h = noFill
          ? 0
          : barWidth
            ? Math.round((value / max) * height)
            : Math.max(4, Math.round((value / max) * height));
        const shown = formatValue
          ? formatValue(finite ? value : null)
          : !finite
            ? "—"
            : `${value}${valueSuffix}`;
        const slot = barWidth ? barWidth + (barGap || 0) : undefined;
        return (
          <View
            key={item.key || item.label || index}
            style={[
              styles.barCol,
              slot
                ? { width: slot, flex: 0, minWidth: slot, alignItems: "center" }
                : null,
            ]}
          >
            <View style={slot ? styles.barValueSlot : null}>
              <Text
                numberOfLines={slot ? 1 : undefined}
                style={[
                  styles.barValue,
                  { color: finite && value < 0 ? negativeColor : valueColor },
                  slot ? { textAlign: "center", marginBottom: 0, width: slot } : null,
                ]}
              >
                {shown}
              </Text>
            </View>
            <View
              style={[
                styles.barTrack,
                { height, backgroundColor: trackColor },
                barWidth ? { width: barWidth, maxWidth: barWidth } : null,
              ]}
            >
              {h > 0 ? (
                <View
                  style={[
                    styles.barFill,
                    {
                      height: h,
                      backgroundColor: item.color || barColor,
                    },
                  ]}
                />
              ) : null}
            </View>
            {slot ? (
              <View style={[styles.barLabelSlot, { width: slot }]}>
                <Text
                  style={[styles.barLabel, styles.barLabelInSlot]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.label}
                </Text>
                <Text style={styles.barCaption} numberOfLines={1}>
                  {item.caption || ""}
                </Text>
              </View>
            ) : (
              <Text style={styles.barLabel} numberOfLines={2}>
                {item.label}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Répartition en barres : même style pour présence, progression et notes. */
export function DistributionBarChart(props) {
  return (
    <BarChart
      barColor="#2E7D32"
      trackColor="#F0F0F0"
      valueColor="#333333"
      valueSuffix=" عضو"
      hideZeroFill
      {...props}
    />
  );
}

/** Courbe d'évolution. */
export function LineChart({
  points = [],
  width = 300,
  height = 160,
  color = "#2E7D32",
  pointSuffix = null,
  emptyLabel = "لا بيانات زمنية بعد",
}) {
  if (!points.length) {
    return <Text style={styles.chartEmpty}>{emptyLabel}</Text>;
  }

  const padL = 28;
  const padR = 8;
  const padT = pointSuffix == null ? 16 : 28;
  const padB = 28;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const values = points
    .map((p) => (p.value == null || p.value === "" ? null : Number(p.value)))
    .filter((v) => v != null && Number.isFinite(v));
  if (!values.length) {
    return <Text style={styles.chartEmpty}>{emptyLabel}</Text>;
  }
  const max = Math.max(100, ...values, 1);
  const min = 0;

  const coords = points.map((p, i) => {
    const missing = p.value == null || p.value === "" || !Number.isFinite(Number(p.value));
    const value = missing ? null : Number(p.value);
    const x =
      points.length === 1
        ? padL + chartW / 2
        : padL + (i / (points.length - 1)) * chartW;
    const y = missing
      ? null
      : padT + chartH - ((value - min) / (max - min)) * chartH;
    return { x, y, value, ...p };
  });

  // Un trou (valeur null) coupe la courbe : on ne relie pas à travers.
  const segments = [];
  let current = [];
  for (const c of coords) {
    if (c.y == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(c);
    }
  }
  if (current.length) segments.push(current);

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
        {segments.map((seg, si) =>
          seg.length < 2 ? null : (
            <Polyline
              key={si}
              points={seg.map((c) => `${c.x},${c.y}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        )}
        {coords.map((c, i) =>
          c.y == null ? null : (
            <Circle key={i} cx={c.x} cy={c.y} r={4} fill={color} />
          )
        )}
        {pointSuffix == null
          ? null
          : coords.map((c, i) =>
              c.y == null ? null : (
                <SvgText
                  key={`v-${i}`}
                  x={c.x}
                  y={c.y - 10}
                  fontSize={11}
                  fill="#333333"
                  textAnchor="middle"
                >
                  {`${c.value}${pointSuffix}`}
                </SvgText>
              )
            )}
      </Svg>
      <View style={[styles.lineLabels, { paddingLeft: padL, paddingRight: padR }]}>
        {points.map((p, i) => (
          <Text key={p.key || i} style={styles.lineLabel} numberOfLines={2}>
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
  hint = null,
  color = "#2E7D32",
  trackColor = "#E8F5E9",
}) {
  if (value == null || value === "") {
    return (
      <View style={styles.meterWrap}>
        <View style={styles.meterHeader}>
          <Text style={styles.meterLabel}>{label}</Text>
          <Text style={[styles.meterValue, { color }]}>—</Text>
        </View>
        <View style={[styles.meterTrack, { backgroundColor: trackColor }]} />
      </View>
    );
  }
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <View style={styles.meterValueGroup}>
          <Text style={[styles.meterValue, { color }]}>{clamped}%</Text>
          {hint ? <Text style={styles.meterHint}>{hint}</Text> : null}
        </View>
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
  underlinedTitle: {
    alignSelf: "stretch",
    alignItems: I18nManager.isRTL ? "flex-start" : "flex-end",
  },
  titleUnderline: {
    height: 3,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: "#FFD666",
  },
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
    ...rtlText,
    textAlign: "center",
  },
  barValueSlot: {
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  barLabelSlot: {
    height: 40,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  barLabelInSlot: {
    marginTop: 0,
    width: "100%",
    textAlign: "center",
  },
  barCaption: {
    fontSize: 10,
    color: "#666",
    textAlign: "center",
    marginTop: 2,
    width: "100%",
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
  meterValueGroup: { flexDirection: row, alignItems: "baseline", gap: 6 },
  meterHint: { fontSize: 12, color: "#666666" },
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
