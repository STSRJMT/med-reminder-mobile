import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, Alert, Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLogout } from "./useLogout";

type Schedule = {
  id: number;
  time_hhmm: string;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
  days_of_week: string | null;
};

type GroupedSchedule = {
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
  days_of_week: string | null;
  schedules: { id: number; time_hhmm: string }[];
};

const DAY_MAP: Record<string, string> = {
  "0": "อา", "1": "จ", "2": "อ", "3": "พ", "4": "พฤ", "5": "ศ", "6": "ส",
};

const formatDays = (days: string | null) => {
  if (!days) return "ทุกวัน";
  const arr = days.split(",").map(d => DAY_MAP[d.trim()] ?? d.trim());
  return arr.length === 7 ? "ทุกวัน" : arr.join(", ");
};

const getMealIcon = (meal: string | null): any => {
  if (!meal) return "information-circle-outline";
  if (meal.includes("ก่อน")) return "restaurant-outline";
  if (meal.includes("หลัง")) return "cafe-outline";
  if (meal.includes("พร้อม")) return "fast-food-outline";
  return "information-circle-outline";
};

function groupSchedules(schedules: Schedule[]): GroupedSchedule[] {
  const map = new Map<string, GroupedSchedule>();
  for (const s of schedules) {
    const key = `${s.medication_name}__${s.dosage}__${s.meal_relation}`;
    if (map.has(key)) {
      map.get(key)!.schedules.push({ id: s.id, time_hhmm: s.time_hhmm });
    } else {
      map.set(key, {
        medication_name: s.medication_name,
        dosage: s.dosage,
        notes: s.notes,
        meal_relation: s.meal_relation,
        days_of_week: s.days_of_week,
        schedules: [{ id: s.id, time_hhmm: s.time_hhmm }],
      });
    }
  }
  return Array.from(map.values());
}

export default function ElderlyMedList() {
  const { elderlyId } = useLocalSearchParams<{ elderlyId: string }>();
  const logout = useLogout();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading]     = useState(true);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(
        `${API_BASE_URL}/elderly/schedules/${elderlyId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSchedules(res.data.items || []);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    if (elderlyId) fetchSchedules();
  }, [elderlyId]));

  const grouped = groupSchedules(schedules);

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <FlatList
        data={grouped}
        keyExtractor={(_, i) => i.toString()}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>รายการยา</Text>
              <Text style={s.headerSub}>ยาที่ต้องรับประทาน</Text>
            </View>
            <Pressable style={[s.iconBtn, s.logoutBtn]} onPress={logout}>
              <Ionicons name="log-out-outline" size={19} color="#EF4444" />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="medical-outline" size={56} color="#BFDBFE" />
            <Text style={s.emptyText}>ยังไม่มีรายการยา</Text>
            <Text style={s.emptySubText}>ผู้ดูแลจะเพิ่มรายการยาให้คุณ</Text>
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <View style={s.iconCircle}>
                <Ionicons name="medical" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.medName}>{group.medication_name}</Text>
                <View style={s.badgeRow}>
                  {group.dosage && (
                    <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                      <Text style={[s.pillText, { color: "#7C3AED" }]}>{group.dosage}</Text>
                    </View>
                  )}
                  {group.meal_relation && group.meal_relation !== "ไม่ระบุ" && (
                    <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                      <Ionicons name={getMealIcon(group.meal_relation)} size={11} color="#059669" />
                      <Text style={[s.pillText, { color: "#059669" }]}>{group.meal_relation}</Text>
                    </View>
                  )}
                </View>
                <View style={s.daysRow}>
                  <Ionicons name="calendar-outline" size={12} color="#64748B" />
                  <Text style={s.daysText}>{formatDays(group.days_of_week)}</Text>
                </View>
                {group.notes ? (
                  <View style={s.notesRow}>
                    <Ionicons name="alert-circle-outline" size={12} color="#F97316" />
                    <Text style={s.notesText} numberOfLines={2}>{group.notes}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={s.timeChipRow}>
              {group.schedules
                .slice()
                .sort((a, b) => a.time_hhmm.localeCompare(b.time_hhmm))
                .map(sc => (
                  <View key={sc.id} style={s.timeChip}>
                    <Ionicons name="time-outline" size={12} color="#2563EB" />
                    <Text style={s.timeChipText}>{sc.time_hhmm}</Text>
                  </View>
                ))}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: "#F0F9FF" },
  center:       { flex: 1, justifyContent: "center", alignItems: "center" },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  headerTitle:  { fontSize: 26, fontWeight: "800", color: "#1E3A5F" },
  headerSub:    { fontSize: 13, color: "#64748B", marginTop: 2 },
  iconBtn:      { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  logoutBtn:    { backgroundColor: "#FFF5F5" },
  emptyWrap:    { alignItems: "center", paddingVertical: 80, gap: 10 },
  emptyText:    { fontSize: 16, color: "#64748B", fontWeight: "700" },
  emptySubText: { fontSize: 13, color: "#94A3B8", textAlign: "center", paddingHorizontal: 40 },
  card:         { backgroundColor: "white", marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 14, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  cardTop:      { flexDirection: "row", alignItems: "flex-start" },
  iconCircle:   { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  medName:      { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 5 },
  badgeRow:     { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText:     { fontSize: 12, fontWeight: "600" },
  daysRow:      { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  daysText:     { fontSize: 12, color: "#64748B", fontWeight: "500" },
  notesRow:     { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  notesText:    { fontSize: 12, color: "#F97316", fontWeight: "600", flex: 1, lineHeight: 16 },
  timeChipRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  timeChip:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF4FF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#BFDBFE" },
  timeChipText: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
});
