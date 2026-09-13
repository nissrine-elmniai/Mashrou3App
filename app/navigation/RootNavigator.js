import React, { useEffect, useRef } from "react";
import { Alert, Linking } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { useApp } from "../context/AppContext";
import { ROLES } from "../constants/roles";
import { colors } from "../constants/theme";
import { fonts } from "../constants/rtl";
import { handleAuthDeepLink } from "../lib/authLinking";
import { supabase } from "../lib/supabase";
import PushNotificationBridge from "../components/PushNotificationBridge";

import LoginScreen from "../screens/LoginScreen";
import SupervisorLoginScreen from "../screens/supervisor/SupervisorLoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import ActivateAccountScreen from "../screens/ActivateAccountScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";

import SupervisorDashboard from "../screens/supervisor/SupervisorDashboard";
import ChatConversationScreen from "../screens/supervisor/ChatConversationScreen";
import SupervisorMemberProfileScreen from "../screens/supervisor/MemberProfileScreen";
import SupervisorProfileScreen from "../screens/supervisor/SupervisorProfileScreen";
import SupervisorAlertsScreen from "../screens/supervisor/SupervisorAlertsScreen";
import SupervisorAttendanceDetailScreen from "../screens/supervisor/SupervisorAttendanceDetailScreen";
import SupervisorMessagesScreen from "../screens/supervisor/SupervisorMessagesScreen";
import GroupChatScreen from "../screens/chat/GroupChatScreen";
import GroupInfoScreen from "../screens/chat/GroupInfoScreen";

const AuthStackNav = createStackNavigator();
const AdminStackNav = createStackNavigator();
const SupervisorStackNav = createStackNavigator();
const MemberStackNav = createStackNavigator();

const linking = {
  prefixes: ["mashrou3app://"],
  config: {
    screens: {
      ResetPassword: "reset-password",
      Login: "login",
    },
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: "#fff",
  headerTitleStyle: {
    fontWeight: "bold",
    fontFamily: fonts.bold,
  },
  headerTitleAlign: "center",
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.bg },
};

const hidden = { headerShown: false };

function authScreens(Stack) {
  return (
    <>
      <Stack.Screen name="Login" component={LoginScreen} options={hidden} />
      <Stack.Screen
        name="SupervisorLogin"
        component={SupervisorLoginScreen}
        options={hidden}
      />
      <Stack.Screen name="Register" component={RegisterScreen} options={hidden} />
      <Stack.Screen
        name="ActivateAccount"
        component={ActivateAccountScreen}
        options={hidden}
      />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={hidden}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={hidden}
      />
    </>
  );
}

function sharedChatScreens(Stack) {
  return (
    <>
      <Stack.Screen
        name="ChatConversation"
        component={ChatConversationScreen}
        options={hidden}
      />
      <Stack.Screen name="GroupChat" component={GroupChatScreen} options={hidden} />
      <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={hidden} />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={hidden}
      />
    </>
  );
}

function notificationScreens(Stack) {
  return (
    <>
      <Stack.Screen
        name="NotificationInbox"
        getComponent={() =>
          require("../screens/notifications/NotificationInboxScreen").default
        }
        options={hidden}
      />
      <Stack.Screen
        name="NotificationSettings"
        getComponent={() =>
          require("../screens/notifications/NotificationSettingsScreen").default
        }
        options={hidden}
      />
      <Stack.Screen
        name="NotificationDetail"
        getComponent={() =>
          require("../screens/notifications/NotificationDetailScreen").default
        }
        options={hidden}
      />
    </>
  );
}

function AuthStack() {
  return (
    <AuthStackNav.Navigator initialRouteName="Login" screenOptions={screenOptions}>
      {authScreens(AuthStackNav)}
    </AuthStackNav.Navigator>
  );
}

function AdminStack() {
  return (
    <AdminStackNav.Navigator
      initialRouteName="AdminDashboard"
      screenOptions={screenOptions}
    >
      <AdminStackNav.Screen
        name="AdminDashboard"
        getComponent={() => require("../screens/admin/AdminDashboard").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminSeasons"
        getComponent={() => require("../screens/admin/AdminSeasonsScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminSeanceDetail"
        getComponent={() =>
          require("../screens/admin/AdminSeanceDetailScreen").default
        }
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminNewSeason"
        getComponent={() => require("../screens/admin/AdminNewSeasonScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminRegistrations"
        getComponent={() =>
          require("../screens/admin/AdminRegistrationsScreen").default
        }
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminSupervisors"
        getComponent={() =>
          require("../screens/admin/AdminSupervisorsScreen").default
        }
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminSupervisorDetail"
        getComponent={() =>
          require("../screens/admin/AdminSupervisorDetailScreen").default
        }
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminStats"
        getComponent={() => require("../screens/admin/AdminStatsScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminTests"
        getComponent={() => require("../screens/admin/AdminTestsScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminProfile"
        getComponent={() => require("../screens/admin/AdminProfileScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminMembers"
        getComponent={() => require("../screens/admin/AdminMembersScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminNotifications"
        getComponent={() =>
          require("../screens/admin/AdminNotificationsScreen").default
        }
        options={hidden}
      />
      <AdminStackNav.Screen
        name="AdminChat"
        getComponent={() => require("../screens/admin/AdminChatScreen").default}
        options={hidden}
      />
      <AdminStackNav.Screen
        name="MemberProfile"
        component={SupervisorMemberProfileScreen}
        options={hidden}
      />
      {notificationScreens(AdminStackNav)}
      {sharedChatScreens(AdminStackNav)}
    </AdminStackNav.Navigator>
  );
}

function SupervisorStack() {
  return (
    <SupervisorStackNav.Navigator
      initialRouteName="SupervisorDashboard"
      screenOptions={screenOptions}
    >
      <SupervisorStackNav.Screen
        name="SupervisorDashboard"
        component={SupervisorDashboard}
        options={hidden}
      />
      <SupervisorStackNav.Screen
        name="MemberProfile"
        component={SupervisorMemberProfileScreen}
        options={hidden}
      />
      <SupervisorStackNav.Screen
        name="SupervisorProfile"
        component={SupervisorProfileScreen}
        options={hidden}
      />
      <SupervisorStackNav.Screen
        name="SupervisorAlerts"
        component={SupervisorAlertsScreen}
        options={hidden}
      />
      <SupervisorStackNav.Screen
        name="SupervisorMessages"
        component={SupervisorMessagesScreen}
        options={hidden}
      />
      <SupervisorStackNav.Screen
        name="SupervisorAttendanceDetail"
        component={SupervisorAttendanceDetailScreen}
        options={hidden}
      />
      {notificationScreens(SupervisorStackNav)}
      {sharedChatScreens(SupervisorStackNav)}
    </SupervisorStackNav.Navigator>
  );
}

function MemberStack() {
  return (
    <MemberStackNav.Navigator
      initialRouteName="MemberDashboardScreen"
      screenOptions={screenOptions}
    >
      <MemberStackNav.Screen
        name="MemberDashboardScreen"
        getComponent={() =>
          require("../screens/member/MemberDashboardScreen").default
        }
        options={hidden}
      />
      <MemberStackNav.Screen
        name="MemberProfileScreen"
        getComponent={() =>
          require("../screens/member/MemberProfileScreen").default
        }
        options={hidden}
      />
      <MemberStackNav.Screen
        name="ProgrammeDetails"
        getComponent={() =>
          require("../screens/member/ProgrammeDetailsScreen").default
        }
        options={hidden}
      />
      <MemberStackNav.Screen
        name="MemberProgress"
        getComponent={() =>
          require("../screens/member/MemberProgressScreen").default
        }
        options={hidden}
      />
      <MemberStackNav.Screen
        name="MemberChatInbox"
        getComponent={() =>
          require("../screens/member/MemberChatInboxScreen").default
        }
        options={hidden}
      />
      <MemberStackNav.Screen
        name="MemberAlerts"
        getComponent={() => require("../screens/member/MemberAlertsScreen").default}
        options={hidden}
      />
      {notificationScreens(MemberStackNav)}
      {sharedChatScreens(MemberStackNav)}
    </MemberStackNav.Navigator>
  );
}

function stackForRole(role) {
  if (role === ROLES.ADMIN) return <AdminStack />;
  if (role === ROLES.SUPERVISOR) return <SupervisorStack />;
  return <MemberStack />;
}

export default function RootNavigator() {
  const navigationRef = useRef(null);
  const [navTick, setNavTick] = React.useState(0);
  const { currentUser } = useApp();
  const signedIn = Boolean(currentUser?.role);

  useEffect(() => {
    if (!signedIn) return undefined;
    const id = requestAnimationFrame(() => setNavTick((n) => n + 1));
    return () => cancelAnimationFrame(id);
  }, [signedIn]);

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

    const linkSub = Linking.addEventListener("url", ({ url }) => processUrl(url));

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
    <>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        direction="rtl"
        onReady={() => setNavTick((n) => n + 1)}
      >
        {signedIn ? stackForRole(currentUser.role) : <AuthStack />}
      </NavigationContainer>
      <PushNotificationBridge navigationRef={navigationRef} navTick={navTick} />
    </>
  );
}
