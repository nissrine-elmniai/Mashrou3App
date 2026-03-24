import React from "react";
import { I18nManager } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import LoginScreen from "./app/screens/LoginScreen";
import RegisterScreen from "./app/screens/RegisterScreen";
import ForgotPasswordScreen from "./app/screens/ForgotPasswordScreen";

import MemberDashboardScreen from "./app/screens/member/MemberDashboardScreen";
import ProfileScreen from "./app/screens/member/ProfileScreen";
import ProgrammeDetailsScreen from "./app/screens/member/ProgrammeDetailsScreen";

import SupervisorDashboard from "./app/screens/supervisor/SupervisorDashboard";
import SupervisorProfileScreen from "./app/screens/supervisor/SupervisorProfileScreen";
import PresenceScreen from "./app/screens/supervisor/PresenceScreen";
import StatisticsScreen from "./app/screens/supervisor/StatisticsScreen";
import AddMember from "./app/screens/supervisor/AddMember";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">

        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false, }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{ title: "إنشاء حساب جديد" }}
        />

        <Stack.Screen
          name="ForgotPassword"
          component={ForgotPasswordScreen}
          options={{ title: "استعادة كلمة المرور" }}
        />

        {/* MEMBER */}
        <Stack.Screen
          name="MemberDashboardScreen"
          component={MemberDashboardScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="MemberProfile"
          component={ProfileScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="ProgrammeDetails"
          component={ProgrammeDetailsScreen}
          options={{ headerShown: false }}
        />

        {/* SUPERVISOR */}
        <Stack.Screen
          name="SupervisorDashboard"
          component={SupervisorDashboard}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Presence"
          component={PresenceScreen}
          options={{
            title: "إدارة الحضور",
            headerTitleStyle: { writingDirection: "rtl" },
          }}
        />
        <Stack.Screen
          name="Statistics"
          component={StatisticsScreen}
          options={{
            title: "الإحصائيات",
            headerTitleStyle: { writingDirection: "rtl" },
          }}
        />

        <Stack.Screen
          name="AddMember"
          component={AddMember}
          options={{
            title: "إضافة عضو جديد",
            headerTitleStyle: { writingDirection: "rtl" },
          }}
        />

      </Stack.Navigator>
    </NavigationContainer>
  );
}