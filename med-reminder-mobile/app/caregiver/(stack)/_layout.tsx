import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, Platform } from "react-native";

export default function CaregiverTabLayout() {
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
      {/* ── Tab screens ── */}
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

      {/* ── ซ่อน stack screens ทั้งหมดออกจาก tab bar ── */}
      <Tabs.Screen
        name="(stack)"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="(stack)/add-elderly"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="(stack)/add-schedule"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  iconWrap:       { width: 44, height: 30, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  iconWrapActive: { backgroundColor: "#EFF6FF" },
});
