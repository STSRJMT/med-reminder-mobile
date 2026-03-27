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

/* ─── Types ─── */

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

// ✅ Group ตามเวลา
type MedInGroup = {
  scheduleId: number;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
};

type GroupedByTime = {
  time_hhmm: string;
  days_of_week: string | null;
  medicines: MedInGroup[];
};

/* ─── Helpers ─── */

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

// ✅ Group ตามเวลา + วัน (ไม่สนใจ meal_relation)
function groupByTime(schedules: Schedule[]): GroupedByTime[] {
  const map = new Map<string, GroupedByTime>();
  for (const s of schedules) {
    const key = `${s.time_hhmm}__${s.days_of_week ?? ""}`;
    if (!map.has(key)) {
      map.set(key, { time_hhmm: s.time_hhmm, days_of_week: s.days_of_week, medicines: [] });
    }
    map.get(key)!.medicines.push({
      scheduleId: s.id,
      medication_name: s.medication_name,
      dosage: s.dosage,
      notes: s.notes,
      meal_relation: s.meal_relation,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.time_hhmm.localeCompare(b.time_hhmm));
}

/* ─── Main Component ─── */

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

  useEffect(() => { if (elderlyId) fetchSchedules(); }, [elderlyId]);

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

  // ✅ ลบทั้งกลุ่ม
  const handleDeleteGroup = (group: GroupedByTime) => {
    const medNames = group.medicines.map(m => `• ${m.medication_name}`).join("\n");
    Alert.alert(
      "ลบทั้งกลุ่ม",
      `ลบยาทั้งหมด ${group.medicines.length} รายการในเวลา ${group.time_hhmm}?\n\n${medNames}`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบทั้งหมด", style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem("token");
              for (const med of group.medicines) {
                await axios.delete(`${API_BASE_URL}/elderly/schedules/${med.scheduleId}`, {
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

  // ✅ ลบทีละยา
  const handleDeleteSingleMed = (med: MedInGroup, group: GroupedByTime) => {
    Alert.alert(
      "ลบยา",
      `ลบ "${med.medication_name}" ออกจากเวลา ${group.time_hhmm}?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ", style: "destructive",
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem("token");
              await axios.delete(`${API_BASE_URL}/elderly/schedules/${med.scheduleId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              fetchSchedules();
            } catch { Alert.alert("ลบไม่สำเร็จ"); }
          },
        },
      ]
    );
  };

  const grouped = groupByTime(schedules);

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
        keyExtractor={item => `${item.time_hhmm}-${item.days_of_week}`}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
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
                  <Ionicons name="time-outline" size={14} color="#2563EB" />
                  <Text style={s.summaryText}>
                    <Text style={s.summaryBold}>{grouped.length} เวลา</Text>
                    {" · "}
                    <Text style={s.summaryBold}>{schedules.length} รายการยา</Text>
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
          <View style={s.groupCard}>
            {/* ✅ Header: เวลา + วัน + ปุ่ม Edit/Delete กลุ่ม */}
            <View style={s.groupHeader}>
              <View style={s.groupHeaderLeft}>
                <View style={s.timeRow}>
                  <Ionicons name="alarm-outline" size={14} color="white" />
                  <Text style={s.groupTime}>{group.time_hhmm}</Text>
                </View>
                <View style={s.metaRow}>
                  <View style={s.metaChip}>
                    <Ionicons name="calendar-outline" size={10} color="white" />
                    <Text style={s.metaChipText}>{formatDays(group.days_of_week)}</Text>
                  </View>
                </View>
              </View>
              <View style={s.groupActions}>
                <Pressable
                  style={s.actionBtn}
                  onPress={() => router.push({
                    pathname: `/elderly/${elderlyId}/(stack)/add-schedule` as any,
                    params: {
                      editMode: "true",
                      scheduleId: String(group.medicines[0].scheduleId),
                      scheduleIds: group.medicines.map(m => m.scheduleId).join(","),
                    },
                  })}
                >
                  <Ionicons name="create-outline" size={15} color="white" />
                </Pressable>
                <Pressable
                  style={[s.actionBtn, { backgroundColor: "rgba(239,68,68,0.3)" }]}
                  onPress={() => handleDeleteGroup(group)}
                >
                  <Ionicons name="trash-outline" size={15} color="white" />
                </Pressable>
              </View>
            </View>

            {/* Medicine count */}
            <View style={s.medCountRow}>
              <Text style={s.medCountText}>{group.medicines.length} รายการยา</Text>
            </View>

            {/* ✅ รายการยาแต่ละตัว + ปุ่มลบทีละยา */}
            {group.medicines.map((med, index) => (
              <View
                key={med.scheduleId}
                style={[s.medRow, index < group.medicines.length - 1 && s.medRowBorder]}
              >
                <View style={s.medIndex}>
                  <Text style={s.medIndexText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.medName}>{med.medication_name}</Text>
                  <View style={s.badgeRow}>
                    {med.dosage ? (
                      <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                        <Text style={[s.pillText, { color: "#7C3AED" }]}>{med.dosage}</Text>
                      </View>
                    ) : null}
                    {med.meal_relation && med.meal_relation !== "ไม่ระบุ" ? (
                      <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                        <Ionicons name={getMealIcon(med.meal_relation)} size={10} color="#059669" />
                        <Text style={[s.pillText, { color: "#059669" }]}>{med.meal_relation}</Text>
                      </View>
                    ) : null}
                  </View>
                  {med.notes ? (
                    <View style={s.notesRow}>
                      <Ionicons name="alert-circle-outline" size={11} color="#F97316" />
                      <Text style={s.notesText} numberOfLines={2}>{med.notes}</Text>
                    </View>
                  ) : null}
                </View>
                {/* ✅ ลบทีละยา (ซ่อนถ้ามียาตัวเดียว) */}
                {group.medicines.length > 1 && (
                  <Pressable style={s.removeMedBtn} onPress={() => handleDeleteSingleMed(med, group)}>
                    <Ionicons name="close-circle-outline" size={18} color="#94A3B8" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

/* ─── Styles ─── */

const s = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: "#F0F9FF" },
  center:        { flex: 1, justifyContent: "center", alignItems: "center" },
  header:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16 },
  headerTitle:   { fontSize: fs(26), fontWeight: "800", color: "#1E3A5F" },
  headerSub:     { fontSize: fs(13), color: "#64748B", marginTop: 2 },
  headerRight:   { flexDirection: "row", gap: 8 },
  addBtn:        { width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  logoutBtn:     { width: 44, height: 44, borderRadius: 12, backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FEE2E2" },
  summaryRow:    { marginBottom: 12 },
  summaryPill:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  summaryText:   { fontSize: fs(13), color: "#2563EB" },
  summaryBold:   { fontWeight: "800" },

  // ✅ Group card
  groupCard:     { backgroundColor: "white", borderRadius: 16, marginBottom: 14, borderWidth: 1.5, borderColor: "#BFDBFE", overflow: "hidden", shadowColor: "#1D4ED8", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  groupHeader:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 14, backgroundColor: "#2563EB" },
  groupHeaderLeft:{ flex: 1, gap: 5 },
  timeRow:       { flexDirection: "row", alignItems: "center", gap: 5 },
  groupTime:     { fontSize: fs(22), fontWeight: "800", color: "white" },
  metaRow:       { flexDirection: "row", gap: 5 },
  metaChip:      { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  metaChipText:  { fontSize: fs(11), fontWeight: "600", color: "white" },
  groupActions:  { flexDirection: "row", gap: 6 },
  actionBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center" },

  medCountRow:   { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  medCountText:  { fontSize: fs(11), fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 },

  medRow:        { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingVertical: 10 },
  medRowBorder:  { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  medIndex:      { width: 22, height: 22, borderRadius: 11, backgroundColor: "#DBEAFE", justifyContent: "center", alignItems: "center", marginRight: 10, marginTop: 1 },
  medIndexText:  { fontSize: fs(11), fontWeight: "700", color: "#1D4ED8" },
  medName:       { fontSize: fs(14), fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  badgeRow:      { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  pill:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText:      { fontSize: fs(12), fontWeight: "600" },
  notesRow:      { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, backgroundColor: "#FFF7ED", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, alignSelf: "flex-start" },
  notesText:     { fontSize: fs(11), color: "#F97316", fontWeight: "600", flex: 1 },
  removeMedBtn:  { padding: 4, marginTop: -2 },

  emptyWrap:     { alignItems: "center", paddingVertical: 80, gap: 12 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  emptyText:     { fontSize: fs(16), color: "#64748B", fontWeight: "700" },
  emptySubText:  { fontSize: fs(13), color: "#94A3B8", textAlign: "center" },
});