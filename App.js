import React, { useEffect, useState } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from "@expo-google-fonts/cairo";

import { AppProvider } from "./app/context/AppContext";
import { colors } from "./app/constants/theme";
import {
  applyGlobalRtlTypography,
  setCairoLoaded,
  fonts,
} from "./app/constants/rtl";

import LoginScreen from "./app/screens/LoginScreen";
import SupervisorLoginScreen from "./app/screens/supervisor/SupervisorLoginScreen";
import RegisterScreen from "./app/screens/RegisterScreen";
import ActivateAccountScreen from "./app/screens/ActivateAccountScreen";
import ForgotPasswordScreen from "./app/screens/ForgotPasswordScreen";

import MemberDashboardScreen from "./app/screens/member/MemberDashboardScreen";
import MemberProfileScreen from "./app/screens/member/MemberProfileScreen";
import ProgrammeDetailsScreen from "./app/screens/member/ProgrammeDetailsScreen";

import SupervisorDashboard from "./app/screens/supervisor/SupervisorDashboard";
import ChatConversationScreen from "./app/screens/supervisor/ChatConversationScreen";

import AdminDashboard from "./app/screens/admin/AdminDashboard";
import AdminSeasonsScreen from "./app/screens/admin/AdminSeasonsScreen";
import AdminSummerSchoolScreen from "./app/screens/admin/AdminSummerSchoolScreen";
import AdminRegistrationsScreen from "./app/screens/admin/AdminRegistrationsScreen";
import AdminGroupsScreen from "./app/screens/admin/AdminGroupsScreen";
import AdminSupervisorsScreen from "./app/screens/admin/AdminSupervisorsScreen";
import AdminStatsScreen from "./app/screens/admin/AdminStatsScreen";

const Stack = createStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
  });
  useEffect(() => {
    if (fontsLoaded) {
      setCairoLoaded(true);
      applyGlobalRtlTypography();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AppProvider>
      <NavigationContainer direction="rtl">
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: "#fff",
            headerTitleStyle: {
              fontWeight: "bold",
              fontFamily: fonts.bold,
            },
            headerTitleAlign: "center",
            headerBackTitleVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SupervisorLogin"
            component={SupervisorLoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ActivateAccount"
            component={ActivateAccountScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />

            <Stack.Screen
              name="AdminDashboard"
              component={AdminDashboard}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminSeasons"
              component={AdminSeasonsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminSummerSchool"
              component={AdminSummerSchoolScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminRegistrations"
              component={AdminRegistrationsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminGroups"
              component={AdminGroupsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminSupervisors"
              component={AdminSupervisorsScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="AdminStats"
              component={AdminStatsScreen}
              options={{ headerShown: false }}
            />

            <Stack.Screen
              name="MemberDashboardScreen"
              component={MemberDashboardScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="MemberProfileScreen"
              component={MemberProfileScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ProgrammeDetails"
              component={ProgrammeDetailsScreen}
              options={{ headerShown: false }}
            />

            <Stack.Screen
              name="SupervisorDashboard"
              component={SupervisorDashboard}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="ChatConversation"
              component={ChatConversationScreen}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
});
