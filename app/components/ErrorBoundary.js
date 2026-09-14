import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../constants/theme";
import { fonts, rtlText, rtlTextCenter } from "../constants/rtl";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>حدث خطأ غير متوقع</Text>
          <Text style={styles.body}>أعد المحاولة أو أعد تشغيل التطبيق.</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={this.handleRetry}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: 24,
  },
  title: {
    ...rtlTextCenter,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginBottom: 8,
  },
  body: {
    ...rtlText,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 20,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: {
    fontFamily: fonts.bold,
    color: "#fff",
    fontSize: 15,
  },
});
