import { View, Text } from "react-native";

export default function TodaySchedule() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 18 }}>📅 ตารางการกินยาวันนี้</Text>
      <Text style={{ color: "#666" }}>ยังไม่มีข้อมูล</Text>
    </View>
  );
}
