import { View, Text } from "react-native";

export default function Report() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 18 }}>📊 รายงานการกินยา</Text>
      <Text style={{ color: "#666" }}>ยังไม่มีรายงาน</Text>
    </View>
  );
}
