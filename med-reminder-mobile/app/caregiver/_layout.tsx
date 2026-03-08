import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, Platform } from "react-native";
import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import axios from "axios";
import { API_BASE_URL } from "../../src/config";

async function registerFCMToken() {
  try {
    console.log("calling registerFCMToken...");

    // ✅ เช็คว่า login แล้วจริงๆ ก่อน
    const authToken = await AsyncStorage.getItem("token");
    if (!authToken) {
      console.log("Not logged in, skip registerFCMToken");
      return;
    }

    // ขอสิทธิ์
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.log("Permission not granted");
      return;
    }

    // ดึง Expo Push Token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    console.log("Push token:", token);

    // ส่งไปเก็บใน DB
    await axios.post(
      `${API_BASE_URL}/caregiver/fcm-token`,
      { token },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    console.log("registerFCMToken done");
  } catch (err) {
    console.error("registerFCMToken error:", err);
  }
}

export default function CaregiverTabLayout() {
  useEffect(() => {
    registerFCMToken();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: {
          height: Platform.OS === "ios" ? 82 : 66,
          paddingBottom: Platform.OS === "ios" ? 24 : 10,
          paddingTop: 8,
          backgroundColor: "white",
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: "#93C5FD",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="elderly-list"
        options={{
          title: "ผู้สูงอายุ",
          tabBarIcon: ({ color, focused }) => (
            <View style={[s.iconWrap, focused && s.iconWrapActive]}>
              <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "ตารางยา",
          tabBarIcon: ({ color, focused }) => (
            <View style={[s.iconWrap, focused && s.iconWrapActive]}>
              <Ionicons name={focused ? "medical" : "medical-outline"} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "รายงาน",
          tabBarIcon: ({ color, focused }) => (
            <View style={[s.iconWrap, focused && s.iconWrapActive]}>
              <Ionicons name={focused ? "bar-chart" : "bar-chart-outline"} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="(stack)" options={{ href: null, tabBarItemStyle: { display: "none" } }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  iconWrap:       { width: 44, height: 30, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  iconWrapActive: { backgroundColor: "#EFF6FF" },
});
