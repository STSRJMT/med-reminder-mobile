import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, Platform } from "react-native";

export default function TabLayout() {
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
        name="today"
        options={{
          title: "ตารางวันนี้",
          tabBarIcon: ({ color, focused }) => (
            <View style={[s.iconWrap, focused && s.iconWrapActive]}>
              <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "รายการยา",
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
      <Tabs.Screen
        name="(stack)"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  iconWrap:       { width: 44, height: 30, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  iconWrapActive: { backgroundColor: "#EFF6FF" },
});
