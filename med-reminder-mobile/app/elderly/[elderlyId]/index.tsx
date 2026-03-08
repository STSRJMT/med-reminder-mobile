import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  Alert, Pressable, PixelRatio,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../../src/config";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLogout } from "@/hooks/useLogout";
import { useRouter, useFocusEffect } from "expo-router";

type Schedule = {
  id: number;
  time_hhmm: string;
  medication_id: number;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
  days_of_week: string | null;
};

type GroupedSchedule = {
  medication_name: string;
  medication_id: number;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
  days_of_week: string | null;
  schedules: { id: number; time_hhmm: string }[];
};

const fontScale = Math.min(PixelRatio.getFontScale(), 1.4);
const fs = (size: number) => Math.round(size * fontScale);

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
        medication_id: s.medication_id,
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
  const logout = useLogout();
  const router = useRouter();
  const [elderlyId, setElderlyId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("elderlyId").then(id => {
      if (id) setElderlyId(id);
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (elderlyId) fetchSchedules();
  }, [elderlyId]);

  // refresh เมื่อกลับจากหน้า add-schedule
  useFocusEffect(useCallback(() => {
    if (elderlyId) fetchSchedules();
  }, [elderlyId]));

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      if (!token) { logout(); return; }
      const res = await axios.get(
        `${API_BASE_URL}/elderly/schedules/${elderlyId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSchedules(res.data.items || []);
    } catch (error: any) {
      if (error?.response?.status === 401) logout();
      else Alert.alert("โหลดข้อมูลไม่ได้", error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (group: GroupedSchedule) => {
    Alert.alert(
      "ยืนยันการลบ",
      `ต้องการลบยา "${group.medication_name}" หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ", style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem("token");
              for (const s of group.schedules) {
                await axios.delete(`${API_BASE_URL}/elderly/schedules/${s.id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
              fetchSchedules();
            } catch { Alert.alert("ลบไม่สำเร็จ"); }
          },
        },
      ]
    );
  };

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
          <View>
            <View style={s.header}>
              <View>
                <Text style={s.headerTitle}>รายการยา</Text>
                <Text style={s.headerSub}>ยาที่ต้องรับประทาน</Text>
              </View>
              <View style={s.headerRight}>
                <Pressable
                  style={s.addBtn}
                  onPress={() => router.push(`/elderly/${elderlyId}/(stack)/add-schedule`)}
                >
                  <Ionicons name="add" size={22} color="white" />
                </Pressable>
                <Pressable style={s.logoutBtn} onPress={logout}>
                  <Ionicons name="log-out-outline" size={19} color="#EF4444" />
                </Pressable>
              </View>
            </View>
            {grouped.length > 0 && (
              <View style={s.summaryRow}>
                <View style={s.summaryPill}>
                  <Ionicons name="medical" size={14} color="#2563EB" />
                  <Text style={s.summaryText}>
                    รายการยาทั้งหมด <Text style={s.summaryBold}>{grouped.length} รายการ</Text>
                  </Text>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="medical-outline" size={40} color="#93C5FD" />
            </View>
            <Text style={s.emptyText}>ยังไม่มีรายการยา</Text>
            <Text style={s.emptySubText}>กดปุ่ม + เพื่อเพิ่มยา</Text>
          </View>
        }
        renderItem={({ item: group }) => (
          <View style={s.card}>
            <View style={s.cardTop}>
              <View style={s.cardLeft}>
                <View style={s.iconCircle}>
                  <Ionicons name="medical" size={18} color="#2563EB" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
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
              <View style={s.cardActions}>
                <Pressable
                  style={s.actionBtn}
                  onPress={() => router.push({
  pathname: `/elderly/${elderlyId}/(stack)/add-schedule` as any,
  params: {
    editMode: "true",
    scheduleId: String(group.schedules[0].id),
    scheduleIds: group.schedules.map(sc => sc.id).join(","),
  },
})}
                >
                  <Ionicons name="create-outline" size={16} color="#2563EB" />
                </Pressable>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: "#FFF5F5" }]}
                  onPress={() => handleDelete(group)}
                >
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
            <View style={s.timeChipRow}>
              {group.schedules
                .slice().sort((a, b) => a.time_hhmm.localeCompare(b.time_hhmm))
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
  safeArea:      { flex: 1, backgroundColor: "#F0F9FF" },
  center:        { flex: 1, justifyContent: "center", alignItems: "center" },
  header:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16 },
  headerTitle:   { fontSize: fs(26), fontWeight: "800", color: "#1E3A5F" },
  headerSub:     { fontSize: fs(13), color: "#64748B", marginTop: 2 },
  headerRight:   { flexDirection: "row", gap: 8 },
  addBtn:        { width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  logoutBtn:     { width: 44, height: 44, borderRadius: 12, backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FEE2E2" },
  summaryRow:    { paddingHorizontal: 16, marginBottom: 12 },
  summaryPill:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  summaryText:   { fontSize: fs(13), color: "#2563EB" },
  summaryBold:   { fontWeight: "800" },
  card:          { backgroundColor: "white", marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  cardTop:       { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardLeft:      { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  cardActions:   { flexDirection: "row", gap: 6, marginTop: 2 },
  iconCircle:    { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  medName:       { fontSize: fs(15), fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  badgeRow:      { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  pill:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText:      { fontSize: fs(12), fontWeight: "600" },
  actionBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  daysRow:       { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  daysText:      { fontSize: fs(12), color: "#64748B", fontWeight: "500" },
  notesRow:      { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  notesText:     { fontSize: fs(12), color: "#F97316", fontWeight: "600", flex: 1, lineHeight: fs(18) },
  timeChipRow:   { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  timeChip:      { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF4FF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#BFDBFE" },
  timeChipText:  { fontSize: fs(13), fontWeight: "700", color: "#2563EB" },
  emptyWrap:     { alignItems: "center", paddingVertical: 80, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  emptyText:     { fontSize: fs(16), color: "#64748B", fontWeight: "700" },
  emptySubText:  { fontSize: fs(13), color: "#94A3B8", textAlign: "center" },
});