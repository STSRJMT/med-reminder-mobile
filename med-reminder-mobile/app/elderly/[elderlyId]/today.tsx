import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Modal, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLogout } from "./useLogout";

type TodaySchedule = {
  scheduleId: number;
  timeHHMM: string;
  medicationName: string;
  dosage: string | null;
  notes: string | null;
  daysOfWeek: string | null;
  takenToday: number;
  _status?: "taken" | "late" | "missed" | null;
};

const statusConfig = {
  taken:  { label: "กินแล้ว",    color: "#10B981", bg: "#ECFDF5", icon: "checkmark-circle" },
  late:   { label: "กินล่าช้า",  color: "#F59E0B", bg: "#FFFBEB", icon: "time"             },
  missed: { label: "ข้ามมื้อนี้", color: "#EF4444", bg: "#FFF5F5", icon: "close-circle"     },
} as const;

const DAY_TH   = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const MONTH_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const formatDateTH = (date: Date) =>
  `${DAY_TH[date.getDay()]}ที่ ${date.getDate()} ${MONTH_TH[date.getMonth()]} ${date.getFullYear() + 543}`;

export default function ElderlyToday() {
  const logout = useLogout();

  const [list, setList]               = useState<TodaySchedule[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeItem, setActiveItem]   = useState<TodaySchedule | null>(null);
  const [logging, setLogging]         = useState(false);

  const fetchToday = async () => {
    try {
      setLoading(true);
      const token   = await AsyncStorage.getItem("token");
      const dateStr = toDateStr(new Date()); // ใช้ new Date() ทุกครั้งที่ fetch
      const res = await axios.get(
        `${API_BASE_URL}/elderly/today?date=${dateStr}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items: TodaySchedule[] = (res.data.items || []).map((item: any) => ({
        ...item,
        _status: item.takenToday ? "taken" : null,
      }));
      setList(items);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  // ── re-fetch ทุกครั้งที่หน้านี้ได้รับ focus (รวมถึงตอนกลับมาจากหน้าอื่น) ──
  useFocusEffect(
    useCallback(() => {
      fetchToday();
    }, []) // [] ถูกต้อง — useFocusEffect จะ run ใหม่ทุกครั้งที่ focus โดยธรรมชาติอยู่แล้ว
  );

  const handleLog = async (status: "taken" | "late" | "missed") => {
    if (!activeItem) return;
    setLogging(true);
    const updatedId      = activeItem.scheduleId;
    const previousStatus = activeItem._status;

    setList(prev => prev.map(i => i.scheduleId === updatedId ? { ...i, _status: status } : i));
    setModalVisible(false);

    try {
      const token = await AsyncStorage.getItem("token");
      await axios.post(
        `${API_BASE_URL}/elderly/intake`,
        { scheduleId: activeItem.scheduleId, takenAtISO: new Date().toISOString() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchToday();
    } catch {
      setList(prev => prev.map(i => i.scheduleId === updatedId ? { ...i, _status: previousStatus } : i));
      setModalVisible(true);
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLogging(false);
    }
  };

  const takenCount = list.filter(t => t._status === "taken" || t._status === "late").length;
  const totalCount = list.length;
  const pct        = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
  const today      = new Date(); // คำนวณใหม่ทุก render

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>ตารางยาวันนี้</Text>
            <Text style={s.headerDate}>{formatDateTH(today)}</Text>
          </View>
          {/* ปุ่มขวาบน: refresh + logout */}
          <View style={s.headerRight}>
            <Pressable style={s.iconBtn} onPress={fetchToday}>
              <Ionicons name="refresh-outline" size={19} color="#2563EB" />
            </Pressable>
            <Pressable style={[s.iconBtn, s.logoutBtn]} onPress={logout}>
              <Ionicons name="log-out-outline" size={19} color="#EF4444" />
            </Pressable>
          </View>
        </View>

        {/* ── Summary Card ── */}
        <View style={s.summaryCard}>
          <View style={s.summaryLeft}>
            <Text style={s.summaryLabel}>กินยาแล้ววันนี้</Text>
            <View style={s.summaryNumRow}>
              <Text style={s.summaryNum}>{takenCount}</Text>
              <Text style={s.summaryTotal}>/{totalCount}</Text>
            </View>
          </View>
          <View style={s.summaryRight}>
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${pct}%` as any }]} />
            </View>
            <Text style={s.summaryPct}>{pct}%</Text>
          </View>
        </View>

        {/* ── Med List ── */}
        <View style={{ paddingHorizontal: 16 }}>
          {totalCount === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="checkmark-circle-outline" size={56} color="#BFDBFE" />
              <Text style={s.emptyText}>ไม่มียาที่ต้องกินวันนี้</Text>
              <Text style={s.emptySubText}>คุณพักผ่อนได้เลย 😊</Text>
            </View>
          ) : (
            list.map((item) => {
              const cfg = item._status ? statusConfig[item._status as keyof typeof statusConfig] : null;
              return (
                <Pressable
                  key={item.scheduleId}
                  style={[s.card, cfg && { borderLeftColor: cfg.color }]}
                  onPress={() => { setActiveItem(item); setModalVisible(true); }}
                >
                  <View style={[s.iconCircle, cfg && { backgroundColor: cfg.bg }]}>
                    <Ionicons name={cfg ? (cfg.icon as any) : "medical"} size={20} color={cfg ? cfg.color : "#2563EB"} />
                  </View>
                  <View style={s.cardContent}>
                    <Text style={s.medName}>{item.medicationName}</Text>
                    <View style={s.badgeRow}>
                      {item.dosage && (
                        <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                          <Text style={[s.pillText, { color: "#7C3AED" }]}>{item.dosage}</Text>
                        </View>
                      )}
                      <View style={[s.pill, { backgroundColor: "#EEF4FF" }]}>
                        <Ionicons name="time-outline" size={11} color="#2563EB" />
                        <Text style={[s.pillText, { color: "#2563EB" }]}>{item.timeHHMM}</Text>
                      </View>
                    </View>
                    {item.notes ? (
                      <View style={s.notesRow}>
                        <Ionicons name="alert-circle-outline" size={12} color="#F97316" />
                        <Text style={s.notesText} numberOfLines={2}>{item.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                  {cfg ? (
                    <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                  )}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Log Modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.bottomSheet} onPress={e => e.stopPropagation()}>
            <View style={s.handleBar} />
            <View style={s.modalIconWrap}>
              <Ionicons name="medical" size={32} color="#2563EB" />
            </View>
            <Text style={s.modalDrugName}>{activeItem?.medicationName}</Text>
            {activeItem?.dosage && <Text style={s.modalDosage}>{activeItem.dosage}</Text>}
            <View style={s.modalInfoRow}>
              <View style={s.modalBadge}>
                <Ionicons name="time-outline" size={13} color="#2563EB" />
                <Text style={[s.modalBadgeText, { color: "#2563EB" }]}>{activeItem?.timeHHMM}</Text>
              </View>
            </View>
            {activeItem?.notes ? (
              <View style={s.modalNotesBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#F97316" />
                <Text style={s.modalNotesText}>{activeItem.notes}</Text>
              </View>
            ) : null}
            <Text style={s.modalTitle}>บันทึกการกินยา</Text>
            <Pressable style={[s.logBtn, { backgroundColor: "#10B981" }]} onPress={() => handleLog("taken")} disabled={logging}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={s.logBtnText}>กินแล้ว</Text>
            </Pressable>
            <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#F59E0B" }]} onPress={() => handleLog("late")} disabled={logging}>
              <Ionicons name="time" size={20} color="#F59E0B" />
              <Text style={[s.logBtnText, { color: "#F59E0B" }]}>กินล่าช้า</Text>
            </Pressable>
            <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]} onPress={() => handleLog("missed")} disabled={logging}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
              <Text style={[s.logBtnText, { color: "#EF4444" }]}>ข้ามมื้อนี้</Text>
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={s.cancelText}>ยกเลิก</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea:       { flex: 1, backgroundColor: "#F0F9FF" },
  center:         { flex: 1, justifyContent: "center", alignItems: "center" },
  header:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle:    { fontSize: 26, fontWeight: "800", color: "#1E3A5F" },
  headerDate:     { fontSize: 13, color: "#64748B", marginTop: 2 },
  headerRight:    { flexDirection: "row", gap: 8 },
  iconBtn:        { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  logoutBtn:      { backgroundColor: "#FFF5F5" },
  summaryCard:    { marginHorizontal: 16, marginBottom: 16, backgroundColor: "#2563EB", borderRadius: 18, padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  summaryLeft:    { gap: 4 },
  summaryLabel:   { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  summaryNumRow:  { flexDirection: "row", alignItems: "flex-end" },
  summaryNum:     { color: "white", fontSize: 36, fontWeight: "800", lineHeight: 40 },
  summaryTotal:   { color: "rgba(255,255,255,0.6)", fontSize: 22, fontWeight: "600", marginBottom: 2 },
  summaryRight:   { alignItems: "flex-end", gap: 6 },
  progressBg:     { width: 110, height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 99, overflow: "hidden" },
  progressFill:   { height: "100%", backgroundColor: "white", borderRadius: 99 },
  summaryPct:     { color: "white", fontSize: 18, fontWeight: "700" },
  card:           { flexDirection: "row", alignItems: "flex-start", backgroundColor: "white", borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#E2E8F0", shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  iconCircle:     { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", marginRight: 12 },
  cardContent:    { flex: 1 },
  medName:        { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 5 },
  badgeRow:       { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText:       { fontSize: 12, fontWeight: "600" },
  notesRow:       { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  notesText:      { fontSize: 12, color: "#F97316", fontWeight: "600", flex: 1, lineHeight: 16 },
  statusBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 2 },
  statusText:     { fontSize: 12, fontWeight: "700" },
  emptyWrap:      { alignItems: "center", paddingVertical: 70, gap: 10 },
  emptyText:      { fontSize: 16, color: "#64748B", fontWeight: "700" },
  emptySubText:   { fontSize: 14, color: "#94A3B8" },
  overlay:        { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  bottomSheet:    { backgroundColor: "white", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 44 },
  handleBar:      { width: 40, height: 4, backgroundColor: "#E2E8F0", borderRadius: 99, alignSelf: "center", marginBottom: 20 },
  modalIconWrap:  { width: 66, height: 66, borderRadius: 20, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 14 },
  modalDrugName:  { fontSize: 20, fontWeight: "800", color: "#1E3A5F", textAlign: "center" },
  modalDosage:    { fontSize: 14, color: "#64748B", textAlign: "center", marginTop: 4 },
  modalInfoRow:   { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10, marginBottom: 12 },
  modalBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F8FAFC", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  modalBadgeText: { fontSize: 12, fontWeight: "600" },
  modalNotesBox:  { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#FFF7ED", borderRadius: 10, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: "#F97316" },
  modalNotesText: { fontSize: 13, color: "#F97316", fontWeight: "600", flex: 1, lineHeight: 18 },
  modalTitle:     { fontSize: 15, fontWeight: "700", color: "#64748B", textAlign: "center", marginBottom: 14, marginTop: 4 },
  logBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 15, borderRadius: 13, marginBottom: 10 },
  logBtnText:     { color: "white", fontWeight: "700", fontSize: 15 },
  cancelBtn:      { alignItems: "center", paddingVertical: 10 },
  cancelText:     { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
});
