import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";


import LoginScreen from "./app/screens/LoginScreen";
import RegisterScreen from "./app/screens/RegisterScreen";
import ForgotPasswordScreen from "./app/screens/ForgotPasswordScreen";
import DashboardScreen from "./app/screens/member/DashboardScreen";
import ProfileScreen from "./app/screens/member/ProfileScreen";
import ProgrammeDetailsScreen from "./app/screens/member/ProgrammeDetailsScreen";
import SupervisorDashboard from "./app/screens/supervisor/SupervisorDashboard";
import PresenceScreen from "./app/screens/supervisor/PresenceScreen";
import StatisticsScreen from "./app/screens/supervisor/StatisticsScreen";
import AddMember from "./app/screens/supervisor/AddMember";

import { I18nManager } from "react-native";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);


const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="SupervisorDashboard">
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{
            title: "إنشاء حساب جديد",
            headerTitleStyle: { writingDirection: "rtl" },
          }}
        />
        <Stack.Screen
          name="ForgotPassword"
          component={ForgotPasswordScreen}
          options={{
            title: "استعادة كلمة المرور",
            headerTitleStyle: { writingDirection: "rtl" },
          }}
        />
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ProgrammeDetails"
          component={ProgrammeDetailsScreen}
          options={{
            headerShown: false,
          }}
        />

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

