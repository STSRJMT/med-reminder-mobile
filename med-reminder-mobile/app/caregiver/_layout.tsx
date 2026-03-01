import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function CaregiverLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="elderly-list"
        options={{
          title: "ผู้สูงอายุ",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
  name="schedule"
  options={{
    title: "ตารางยา",
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="time-outline" size={size} color={color} />
    ),
  }}
/>


      <Tabs.Screen
        name="report"
        options={{
          title: "รายงาน",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />

      {/* ❌ ซ่อน stack ทั้งก้อน */}
      <Tabs.Screen
        name="(stack)"
        options={{ href: null }}
      />
    </Tabs>
  );
}
