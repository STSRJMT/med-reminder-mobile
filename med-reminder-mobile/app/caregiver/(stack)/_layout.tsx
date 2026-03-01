import { Stack } from "expo-router";

export default function CaregiverStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // ✅ ปิด header ทั้ง stack
      }}
    />
  );
}