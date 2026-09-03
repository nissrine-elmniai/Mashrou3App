import React, { useEffect, useRef } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Linking,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
import BlockingAlertGate from "./app/components/BlockingAlertGate";
import { colors } from "./app/constants/theme";
import {
  applyGlobalRtlTypography,
  setCairoLoaded,
  fonts,
} from "./app/constants/rtl";
import { handleAuthDeepLink } from "./app/lib/authLinking";
import { supabase } from "./app/lib/supabase";

import LoginScreen from "./app/screens/LoginScreen";
import SupervisorLoginScreen from "./app/screens/supervisor/SupervisorLoginScreen";
import RegisterScreen from "./app/screens/RegisterScreen";
import ActivateAccountScreen from "./app/screens/ActivateAccountScreen";
import ForgotPasswordScreen from "./app/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./app/screens/ResetPasswordScreen";

import SupervisorDashboard from "./app/screens/supervisor/SupervisorDashboard";
import ChatConversationScreen from "./app/screens/supervisor/ChatConversationScreen";
import SupervisorMemberProfileScreen from "./app/screens/supervisor/MemberProfileScreen";
import SupervisorProfileScreen from "./app/screens/supervisor/SupervisorProfileScreen";
import SupervisorAlertsScreen from "./app/screens/supervisor/SupervisorAlertsScreen";
import SupervisorAttendanceDetailScreen from "./app/screens/supervisor/SupervisorAttendanceDetailScreen";

const Stack = createStackNavigator();

const linking = {
  prefixes: ["mashrou3app://"],
  config: {
    screens: {
      ResetPassword: "reset-password",
      Login: "login",
    },
  },
};

function RootNavigator() {
  const navigationRef = useRef(null);

  useEffect(() => {
    const goResetPassword = () => {
      if (navigationRef.current) {
        navigationRef.current.navigate("ResetPassword");
      }
    };

    const processUrl = async (url) => {
      if (!url) return;
      const result = await handleAuthDeepLink(url);
      if (result.error) {
        Alert.alert("خطأ", result.error);
        return;
      }
      if (result.isRecovery) {
        goResetPassword();
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) processUrl(url);
    });

    const linkSub = Linking.addEventListener("url", ({ url }) =>
      processUrl(url)
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        goResetPassword();
      }
    });

    return () => {
      linkSub.remove();
      subscription.unsubscribe();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef} linking={linking} direction="rtl">
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
          name="ResetPassword"
          component={ResetPasswordScreen}
          options={{ headerShown: false }}
        />

        {/* require() statique — Metro refuse require(path) dynamique */}
        <Stack.Screen
          name="AdminDashboard"
          getComponent={() => require("./app/screens/admin/AdminDashboard").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminSeasons"
          getComponent={() => require("./app/screens/admin/AdminSeasonsScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminSeanceDetail"
          getComponent={() =>
            require("./app/screens/admin/AdminSeanceDetailScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminSummerSchool"
          getComponent={() =>
            require("./app/screens/admin/AdminSummerSchoolScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminNewSeason"
          getComponent={() =>
            require("./app/screens/admin/AdminNewSeasonScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminRegistrations"
          getComponent={() =>
            require("./app/screens/admin/AdminRegistrationsScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminGroups"
          getComponent={() => require("./app/screens/admin/AdminGroupsScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminSupervisors"
          getComponent={() =>
            require("./app/screens/admin/AdminSupervisorsScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminStats"
          getComponent={() => require("./app/screens/admin/AdminStatsScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminTests"
          getComponent={() => require("./app/screens/admin/AdminTestsScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminProfile"
          getComponent={() => require("./app/screens/admin/AdminProfileScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminSettings"
          getComponent={() => require("./app/screens/admin/AdminSettingsScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminMembers"
          getComponent={() => require("./app/screens/admin/AdminMembersScreen").default}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminNotifications"
          getComponent={() =>
            require("./app/screens/admin/AdminNotificationsScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminChat"
          getComponent={() => require("./app/screens/admin/AdminChatScreen").default}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="MemberDashboardScreen"
          getComponent={() =>
            require("./app/screens/member/MemberDashboardScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MemberProfileScreen"
          getComponent={() =>
            require("./app/screens/member/MemberProfileScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ProgrammeDetails"
          getComponent={() =>
            require("./app/screens/member/ProgrammeDetailsScreen").default
          }
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MemberChatInbox"
          getComponent={() =>
            require("./app/screens/member/MemberChatInboxScreen").default
          }
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
        <Stack.Screen
          name="MemberProfile"
          component={SupervisorMemberProfileScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SupervisorProfile"
          component={SupervisorProfileScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SupervisorAlerts"
          component={SupervisorAlertsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SupervisorAttendanceDetail"
          component={SupervisorAttendanceDetailScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <RootNavigator />
          <BlockingAlertGate />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
