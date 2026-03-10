import React from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const menuItems = [
  {
    id: 1, icon: "people", title: "ผู้สูงอายุที่ดูแล",
    subtitle: "จัดการรายชื่อและยา", color: "#4A90D9", bg: "#EAF3FB",
    route: "/caregiver/elderly-list"
  },
  {
    id: 2, icon: "medical", title: "จัดการตารางยา",
    subtitle: "ดูรายการยาทั้งหมด", color: "#5BAD8F", bg: "#E8F7F1",
    route: "/caregiver/schedule"
  },
  {
    id: 3, icon: "bar-chart", title: "รายงาน / สรุป",
    subtitle: "ดูสถิติการกินยา", color: "#E08A3C", bg: "#FDF1E4",
    route: "/caregiver/report"
  },
];

export default function DashboardScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>สวัสดี</Text>
            <Text style={styles.subGreeting}>วันนี้คุณจะทำอะไร?</Text>
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => router.replace("/")}
          >
            <Ionicons name="log-out-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {/* Menu */}
        <Text style={styles.menuLabel}>เมนูหลัก</Text>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.card}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.iconBox, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon as any} size={26} color={item.color} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSub}>{item.subtitle}</Text>
            </View>
            <View style={[styles.arrowBox, { backgroundColor: item.bg }]}>
              <Ionicons name="chevron-forward" size={18} color={item.color} />
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.footer}>เข้าสู่ระบบในฐานะ ผู้ดูแล</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#EFF6FF" },
  scroll:      { padding: 24, paddingBottom: 40 },
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 },
  greeting:    { fontSize: 26, fontWeight: "800", color: "#1E3A5F" },
  subGreeting: { fontSize: 14, color: "#6B8CAE", marginTop: 4 },
  logoutBtn:   { backgroundColor: "#FEE2E2", borderRadius: 14, width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  menuLabel:   { fontSize: 15, fontWeight: "700", color: "#1E3A5F", marginBottom: 14 },
  card:        { backgroundColor: "white", borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  iconBox:     { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  cardText:    { flex: 1 },
  cardTitle:   { fontSize: 16, fontWeight: "700", color: "#1E3A5F" },
  cardSub:     { fontSize: 13, color: "#8FA9C5", marginTop: 2 },
  arrowBox:    { width: 32, height: 32, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  footer:      { textAlign: "center", fontSize: 12, color: "#B0C4D8", marginTop: 24 },
});