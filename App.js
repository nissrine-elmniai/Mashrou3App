import React, { useEffect, useState } from "react";
import { I18nManager, View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
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
import RegisterScreen from "./app/screens/RegisterScreen";
import ForgotPasswordScreen from "./app/screens/ForgotPasswordScreen";

import MemberDashboardScreen from "./app/screens/member/MemberDashboardScreen";
import MemberProfileScreen from "./app/screens/member/MemberProfileScreen";
import ProgrammeDetailsScreen from "./app/screens/member/ProgrammeDetailsScreen";

import SupervisorDashboard from "./app/screens/supervisor/SupervisorDashboard";
import PresenceScreen from "./app/screens/supervisor/PresenceScreen";
import StatisticsScreen from "./app/screens/supervisor/StatisticsScreen";
import AddMember from "./app/screens/supervisor/AddMember";
import SupervisorProfileScreen from "./app/screens/supervisor/SupervisorProfileScreen";
import SupervisorTrackingScreen from "./app/screens/supervisor/SupervisorTrackingScreen";
import SupervisorExamsScreen from "./app/screens/supervisor/SupervisorExamsScreen";

import AdminDashboard from "./app/screens/admin/AdminDashboard";
import AdminSeasonsScreen from "./app/screens/admin/AdminSeasonsScreen";
import AdminSummerSchoolScreen from "./app/screens/admin/AdminSummerSchoolScreen";
import AdminRegistrationsScreen from "./app/screens/admin/AdminRegistrationsScreen";
import AdminGroupsScreen from "./app/screens/admin/AdminGroupsScreen";
import AdminSupervisorsScreen from "./app/screens/admin/AdminSupervisorsScreen";
import AdminStatsScreen from "./app/screens/admin/AdminStatsScreen";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

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
              writingDirection: "rtl",
              fontFamily: fonts.bold,
              textAlign: "right",
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
            name="Register"
            component={RegisterScreen}
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
            name="SupervisorProfileScreen"
            component={SupervisorProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SupervisorTracking"
            component={SupervisorTrackingScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SupervisorExams"
            component={SupervisorExamsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Presence"
            component={PresenceScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Statistics"
            component={StatisticsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AddMember"
            component={AddMember}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
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
