import React, { useState, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { API_BASE_URL } from "../../src/config";

/* ---------- Types ---------- */
type Elderly = { id: number; name: string; age: number };
type DrugStat = {
  name: string;
  taken: number;
  totalFull: number;
  totalSoFar: number;
  percentage: number;
  percentageSoFar: number;
};
type ReportData = {
  taken: number;
  late: number;
  missed: number;
  skipped: number;
  adherence: number;
  adherenceSoFar: number;
  totalFull: number;
  totalSoFar: number;
  drugs: DrugStat[];
};
type TabType = "day" | "week" | "month";

/* ---------- Helpers ---------- */
const tabLabels: { key: TabType; label: string }[] = [
  { key: "day",   label: "รายวัน" },
  { key: "week",  label: "รายสัปดาห์" },
  { key: "month", label: "รายเดือน" },
];

const adherenceColor = (pct: number) =>
  pct >= 80 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444";

const adherenceBg = (pct: number) =>
  pct >= 80 ? "#ECFDF5" : pct >= 50 ? "#FFFBEB" : "#FFF5F5";

const adherenceLabel = (pct: number) =>
  pct >= 80 ? "ดีมาก! กินยาสม่ำเสมอ"
  : pct >= 50 ? "พอใช้ ควรกินให้สม่ำเสมอกว่านี้"
  : "ต้องปรับปรุง กินยาไม่สม่ำเสมอ";

const avatarColors = ["#2563EB", "#7C3AED", "#059669", "#DC2626", "#D97706"];
const getAvatarColor = (id: number) => avatarColors[id % avatarColors.length];

/* ========== Component ========== */
export default function CaregiverReport() {
  const [elderly, setElderly]             = useState<Elderly[]>([]);
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [tab, setTab]                     = useState<TabType>("day");
  const [report, setReport]               = useState<ReportData | null>(null);
  const [loadingList, setLoadingList]     = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);

  const handleLogout = () => {
    Alert.alert("ออกจากระบบ", "คุณต้องการออกจากระบบใช่หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ออกจากระบบ", style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem("token");
          await AsyncStorage.removeItem("user");
          router.replace("/");
        },
      },
    ]);
  };

  const fetchElderly = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${API_BASE_URL}/caregiver/elderly`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const items: Elderly[] = res.data.items ?? [];
      setElderly(items);
      if (items.length > 0 && selectedId === null) setSelectedId(items[0].id);
    } catch {
      Alert.alert("ผิดพลาด", "ไม่สามารถดึงข้อมูลผู้สูงอายุได้");
    } finally {
      setLoadingList(false);
    }
  };

  const fetchReport = async (id: number, t: TabType) => {
    setLoadingReport(true);
    setReport(null);
    try {
      const token = await AsyncStorage.getItem("token");
      // ❌ ลบ auto-missed ออก: ผู้ดูแลไม่ควรเปลี่ยน status แทนผู้สูงอายุ
      // status จะถูก set โดยผู้สูงอายุเองผ่านหน้าตารางยา
      const res = await axios.get(
        `${API_BASE_URL}/caregiver/report/${id}?period=${t}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReport(res.data);
    } catch (e: any) {
      Alert.alert("ผิดพลาด", e?.response?.data?.message || "ไม่สามารถดึงรายงานได้");
    } finally {
      setLoadingReport(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoadingList(true); fetchElderly(); }, []));
  useFocusEffect(useCallback(() => { if (selectedId !== null) fetchReport(selectedId, tab); }, [selectedId, tab]));

  if (loadingList) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>รายงาน</Text>
            <Text style={s.headerSub}>สถิติและสรุปการกินยา</Text>
          </View>
          <Pressable style={s.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          </Pressable>
        </View>

        {elderly.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="people-outline" size={52} color="#BFDBFE" />
            <Text style={s.emptyText}>ยังไม่มีผู้สูงอายุที่ดูแล</Text>
          </View>
        ) : (
          <>
            {/* Elderly selector */}
            <Text style={s.sectionLabel}>เลือกผู้สูงอายุ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {elderly.map((e) => {
                const active = e.id === selectedId;
                const color  = getAvatarColor(e.id);
                return (
                  <Pressable key={e.id}
                    style={[s.chip, active && { borderColor: color, backgroundColor: color + "15" }]}
                    onPress={() => setSelectedId(e.id)}>
                    <View style={[s.chipAvatar, { backgroundColor: color }]}>
                      <Text style={s.chipAvatarText}>{e.name?.charAt(0)}</Text>
                    </View>
                    <View>
                      <Text style={[s.chipName, active && { color }]}>{e.name}</Text>
                      <Text style={s.chipAge}>อายุ {e.age} ปี</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Period tabs */}
            <View style={s.tabRow}>
              {tabLabels.map((t) => (
                <Pressable key={t.key} style={[s.tabBtn, tab === t.key && s.tabActive]}
                  onPress={() => setTab(t.key)}>
                  <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {loadingReport ? (
              <View style={s.center}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={s.loadingText}>กำลังโหลดข้อมูล...</Text>
              </View>
            ) : !report ? null : (
              <>
                {/* Stat cards */}
                <View style={s.statsGrid}>
                  {[
                    { icon: "checkmark-circle", color: "#10B981", val: report.taken,                label: "กินแล้ว" },
                    { icon: "time",             color: "#F59E0B", val: report.late,                 label: "กินล่าช้า" },
                    { icon: "close-circle",     color: "#EF4444", val: report.missed,               label: "ข้าม/ลืม" },
                    { icon: "trending-up",      color: "#2563EB", val: `${report.adherenceSoFar}%`, label: "สม่ำเสมอ" },
                  ].map((item, i) => (
                    <View key={i} style={[s.statCard, { borderLeftColor: item.color }]}>
                      <Ionicons name={item.icon as any} size={22} color={item.color} />
                      <Text style={s.statNum}>{item.val}</Text>
                      <Text style={s.statLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Adherence card */}
                <View style={s.card}>
                  <View style={s.cardTitleRow}>
                    <Ionicons name="analytics-outline" size={16} color="#1D4ED8" />
                    <Text style={s.cardTitle}>
                      อัตราการกิน{tab === "day" ? "วันนี้" : tab === "week" ? "สัปดาห์นี้" : "เดือนนี้"}
                    </Text>
                    <Text style={[s.adherencePct, { color: adherenceColor(report.adherenceSoFar) }]}>
                      {report.adherenceSoFar}%
                    </Text>
                  </View>

                  <Text style={s.adherenceDesc}>
                    กินยาแล้ว {report.taken} จาก {report.totalSoFar} ครั้ง (เฉพาะที่ผ่านมา)
                    {tab !== "day" && report.totalFull > report.totalSoFar
                      ? `  ·  ยังเหลืออีก ${report.totalFull - report.totalSoFar} ครั้งในช่วงนี้` : ""}
                    {report.late > 0 ? `  ·  ล่าช้า ${report.late} ครั้ง` : ""}
                    {report.missed > 0 ? `  ·  ลืมกิน ${report.missed} ครั้ง` : ""}
                  </Text>

                  <View style={s.progressBg}>
                    <View style={[s.progressFill, {
                      width: `${report.adherenceSoFar}%` as any,
                      backgroundColor: adherenceColor(report.adherenceSoFar),
                    }]} />
                  </View>

                  {tab !== "day" && report.totalFull !== report.totalSoFar && (
                    <View style={s.legendRow}>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: adherenceColor(report.adherenceSoFar) }]} />
                        <Text style={s.legendText}>
                          ที่ผ่านมา: {report.adherenceSoFar}% ({report.taken}/{report.totalSoFar} ครั้ง)
                        </Text>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: "#CBD5E1" }]} />
                        <Text style={s.legendText}>
                          ทั้ง{tab === "week" ? "สัปดาห์" : "เดือน"}: {report.adherence}% ({report.taken}/{report.totalFull} ครั้ง)
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={[s.badge, { backgroundColor: adherenceBg(report.adherenceSoFar) }]}>
                    <Ionicons
                      name={report.adherenceSoFar >= 80 ? "checkmark-circle" : report.adherenceSoFar >= 50 ? "warning" : "alert-circle"}
                      size={14} color={adherenceColor(report.adherenceSoFar)}
                    />
                    <Text style={[s.badgeText, { color: adherenceColor(report.adherenceSoFar) }]}>
                      {adherenceLabel(report.adherenceSoFar)}
                    </Text>
                  </View>
                </View>

                {/* Drug detail */}
                <View style={s.card}>
                  <View style={s.cardTitleRow}>
                    <Ionicons name="medical" size={16} color="#1D4ED8" />
                    <Text style={s.cardTitle}>รายละเอียดแต่ละยา</Text>
                  </View>

                  {report.drugs.length === 0 ? (
                    <Text style={s.noDrug}>ยังไม่มีรายการยา</Text>
                  ) : (
                    report.drugs.map((drug, i) => (
                      <View key={i} style={[s.drugRow, i < report.drugs.length - 1 && s.drugBorder]}>
                        <View style={s.drugLeft}>
                          <View style={[s.drugDot, { backgroundColor: adherenceColor(drug.percentageSoFar) }]} />
                          <View>
                            <Text style={s.drugName}>{drug.name}</Text>
                            <Text style={s.drugSub}>
                              กิน {drug.taken}/{drug.totalSoFar} ครั้ง (ที่ผ่านมา)
                              {drug.totalFull > drug.totalSoFar
                                ? ` · เหลือ ${drug.totalFull - drug.totalSoFar} ครั้ง` : ""}
                            </Text>
                          </View>
                        </View>
                        <View style={s.drugRight}>
                          <Text style={[s.drugPct, { color: adherenceColor(drug.percentageSoFar) }]}>
                            {drug.percentageSoFar}%
                          </Text>
                          <View style={s.drugBarBg}>
                            <View style={[s.drugBarFill, {
                              width: `${drug.percentageSoFar}%` as any,
                              backgroundColor: adherenceColor(drug.percentageSoFar),
                            }]} />
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Styles ---------- */
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: "#F0F9FF" },
  center:       { paddingVertical: 60, alignItems: "center" },
  loadingText:  { marginTop: 10, color: "#64748B", fontSize: 13 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 20 },
  headerTitle:  { fontSize: 26, fontWeight: "800", color: "#1E3A5F" },
  headerSub:    { fontSize: 13, color: "#64748B", marginTop: 2 },
  logoutBtn:    { width: 44, height: 44, borderRadius: 13, backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FEE2E2" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#1D4ED8", marginHorizontal: 16, marginBottom: 10 },
  chip:         { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "white", borderRadius: 14, padding: 10, borderWidth: 1.5, borderColor: "#E2E8F0", shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  chipAvatar:   { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  chipAvatarText: { color: "white", fontWeight: "800", fontSize: 15 },
  chipName:     { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  chipAge:      { fontSize: 11, color: "#94A3B8", marginTop: 1 },
  tabRow:       { flexDirection: "row", marginHorizontal: 16, marginTop: 16, marginBottom: 4, backgroundColor: "white", borderRadius: 12, padding: 4, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  tabBtn:       { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10 },
  tabActive:    { backgroundColor: "#2563EB" },
  tabText:      { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  tabTextActive:{ color: "white" },
  statsGrid:    { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 16, marginTop: 16, gap: 10 },
  statCard:     { flex: 1, minWidth: "45%", backgroundColor: "white", borderRadius: 14, padding: 14, borderLeftWidth: 4, alignItems: "center", gap: 4, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  statNum:      { fontSize: 22, fontWeight: "800", color: "#1E293B" },
  statLabel:    { fontSize: 12, color: "#64748B", fontWeight: "500" },
  card:         { backgroundColor: "white", borderRadius: 16, padding: 16, marginHorizontal: 16, marginTop: 12, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EFF6FF" },
  cardTitle:    { flex: 1, fontSize: 14, fontWeight: "700", color: "#1E3A5F" },
  adherencePct: { fontSize: 16, fontWeight: "800" },
  adherenceDesc:{ fontSize: 12, color: "#64748B", marginBottom: 10, lineHeight: 18 },
  progressBg:   { height: 10, backgroundColor: "#F1F5F9", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99 },
  legendRow:    { marginTop: 10, gap: 6 },
  legendItem:   { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:    { width: 8, height: 8, borderRadius: 4 },
  legendText:   { fontSize: 12, color: "#64748B" },
  badge:        { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, padding: 10, borderRadius: 10 },
  badgeText:    { fontSize: 13, fontWeight: "600" },
  drugRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 10 },
  drugBorder:   { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  drugLeft:     { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  drugDot:      { width: 10, height: 10, borderRadius: 5 },
  drugName:     { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  drugSub:      { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  drugRight:    { alignItems: "flex-end", gap: 4, minWidth: 80 },
  drugPct:      { fontSize: 14, fontWeight: "700" },
  drugBarBg:    { width: 80, height: 6, backgroundColor: "#F1F5F9", borderRadius: 99, overflow: "hidden" },
  drugBarFill:  { height: "100%", borderRadius: 99 },
  emptyCard:    { margin: 16, padding: 40, backgroundColor: "white", borderRadius: 16, alignItems: "center", gap: 12 },
  emptyText:    { fontSize: 15, color: "#94A3B8", fontWeight: "600" },
  noDrug:       { textAlign: "center", color: "#94A3B8", paddingVertical: 16, fontSize: 13 },
});
