import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, Alert, Modal, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

type Elderly = { id: number; name: string; age: number | null };
type Schedule = {
  id: number; time_hhmm: string; medication_name: string;
  dosage: string | null; notes: string | null; meal_relation: string | null;
};
type TodaySchedule = Schedule & { status: "taken" | "late" | "missed" | null };
type TabType = "schedule" | "today";

const avatarColors = ["#2563EB", "#7C3AED", "#059669", "#DC2626", "#D97706"];
const getAvatarColor = (id: number) => avatarColors[id % avatarColors.length];

export default function CaregiverSchedule() {
  const router = useRouter();

  // ✅ รับ elderlyId จาก params
  const { elderlyId: paramElderlyId } = useLocalSearchParams<{ elderlyId: string }>();

  const [elderlyList, setElderlyList]         = useState<Elderly[]>([]);
  const [selectedElderly, setSelectedElderly] = useState<Elderly | null>(null);
  const [tab, setTab]                         = useState<TabType>("schedule");
  const [schedules, setSchedules]             = useState<Schedule[]>([]);
  const [todayList, setTodayList]             = useState<TodaySchedule[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [showDropdown, setShowDropdown]       = useState(false);
  const [modalVisible, setModalVisible]       = useState(false);
  const [activeItem, setActiveItem]           = useState<TodaySchedule | null>(null);
  const [logging, setLogging]                 = useState(false);

  const fetchElderly = async () => {
    const token = await AsyncStorage.getItem("token");
    const res = await axios.get(`${API_BASE_URL}/caregiver/elderly`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list: Elderly[] = res.data.items || [];
    setElderlyList(list);

    if (paramElderlyId) {
      // ✅ ถ้ามาจาก elderly-list ให้เลือกคนที่กดมา
      const found = list.find((e) => e.id === Number(paramElderlyId));
      if (found) setSelectedElderly(found);
      else if (list.length > 0) setSelectedElderly(list[0]);
    } else if (list.length > 0 && !selectedElderly) {
      setSelectedElderly(list[0]);
    }

    return list;
  };

  const fetchSchedules = async (id: number) => {
    const token = await AsyncStorage.getItem("token");
    const res = await axios.get(`${API_BASE_URL}/caregiver/schedules?elderlyId=${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setSchedules(res.data.items || []);
  };

  const fetchToday = async (id: number) => {
    const token = await AsyncStorage.getItem("token");
    const res = await axios.get(`${API_BASE_URL}/caregiver/today/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setTodayList(res.data.items || []);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const list = await fetchElderly();
      const id = paramElderlyId
        ? Number(paramElderlyId)
        : selectedElderly?.id ?? list[0]?.id;
      if (id) await Promise.all([fetchSchedules(id), fetchToday(id)]);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [paramElderlyId]));

  useEffect(() => {
    if (selectedElderly?.id) {
      fetchSchedules(selectedElderly.id);
      fetchToday(selectedElderly.id);
    }
  }, [selectedElderly?.id]);

  const handleLog = async (status: "taken" | "late" | "missed") => {
    if (!activeItem || !selectedElderly) return;
    setLogging(true);
    try {
      const token = await AsyncStorage.getItem("token");
      await axios.post(`${API_BASE_URL}/caregiver/intake-logs`, {
        scheduleId: activeItem.id,
        elderlyId: selectedElderly.id,
        status,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setModalVisible(false);
      await fetchToday(selectedElderly.id);
    } catch {
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLogging(false);
    }
  };

  const handleDelete = async (scheduleId: number) => {
    Alert.alert("ยืนยันการลบ", "ต้องการลบรายการนี้หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ", style: "destructive",
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/caregiver/schedules/${scheduleId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (selectedElderly?.id) fetchSchedules(selectedElderly.id);
          } catch { Alert.alert("ลบไม่สำเร็จ"); }
        },
      },
    ]);
  };

  const getMealIcon = (meal: string | null) => {
    if (!meal) return "information-circle-outline";
    if (meal.includes("ก่อน")) return "restaurant-outline";
    if (meal.includes("หลัง")) return "cafe-outline";
    if (meal.includes("พร้อม")) return "fast-food-outline";
    return "information-circle-outline";
  };

  const statusConfig = {
    taken:  { label: "กินแล้ว",    color: "#10B981", bg: "#ECFDF5", icon: "checkmark-circle" },
    late:   { label: "กินล่าช้า",  color: "#F59E0B", bg: "#FFFBEB", icon: "time" },
    missed: { label: "ข้ามมื้อนี้", color: "#EF4444", bg: "#FFF5F5", icon: "close-circle" },
  } as const;

  const takenCount = todayList.filter(t => t.status === "taken" || t.status === "late").length;
  const totalCount = todayList.length;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F9FF" }}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F9FF" }}>
      <Pressable style={{ flex: 1 }} onPress={() => setShowDropdown(false)}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>ตารางยา</Text>
            <Text style={s.headerSub}>จัดการรายการยา</Text>
          </View>
          <View style={s.headerIcon}>
            <Ionicons name="medical" size={22} color="#2563EB" />
          </View>
        </View>

        {/* Elderly selector */}
        <View style={s.selectorRow}>
          <View style={{ position: "relative", flex: 1 }}>
            <Pressable style={s.dropdown}
              onPress={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}>
              <View style={[s.dropdownAvatar, { backgroundColor: selectedElderly ? getAvatarColor(selectedElderly.id) : "#94A3B8" }]}>
                <Text style={s.dropdownAvatarText}>{selectedElderly?.name?.charAt(0) ?? "?"}</Text>
              </View>
              <Text style={s.dropdownText} numberOfLines={1}>
                {selectedElderly
                  ? `${selectedElderly.name}${selectedElderly.age ? ` (${selectedElderly.age} ปี)` : ""}`
                  : "ไม่มีผู้สูงอายุ"}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#64748B" />
            </Pressable>

            {showDropdown && (
              <View style={s.dropdownList}>
                {elderlyList.map((item) => (
                  <Pressable key={item.id} style={s.dropdownItem}
                    onPress={() => { setSelectedElderly(item); setShowDropdown(false); }}>
                    <View style={[s.dropdownAvatar, { backgroundColor: getAvatarColor(item.id) }]}>
                      <Text style={s.dropdownAvatarText}>{item.name?.charAt(0)}</Text>
                    </View>
                    <Text style={s.dropdownItemText}>
                      {item.name} {item.age ? `(${item.age} ปี)` : ""}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Pressable style={s.addBtn}
            onPress={() => router.push({
              pathname: "/caregiver/(stack)/add-schedule",
              params: { elderlyId: selectedElderly?.id, elderlyName: selectedElderly?.name },
            })}>
            <Ionicons name="add" size={22} color="white" />
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          <Pressable style={[s.tabBtn, tab === "schedule" && s.tabActive]} onPress={() => setTab("schedule")}>
            <Ionicons name="list" size={15} color={tab === "schedule" ? "white" : "#94A3B8"} />
            <Text style={[s.tabText, tab === "schedule" && s.tabTextActive]}>รายการยา</Text>
          </Pressable>
          <Pressable style={[s.tabBtn, tab === "today" && s.tabActive]} onPress={() => setTab("today")}>
            <Ionicons name="today" size={15} color={tab === "today" ? "white" : "#94A3B8"} />
            <Text style={[s.tabText, tab === "today" && s.tabTextActive]}>ตารางวันนี้</Text>
            {takenCount < totalCount && totalCount > 0 && (
              <View style={s.notifBadge}><Text style={s.notifBadgeText}>{totalCount - takenCount}</Text></View>
            )}
          </Pressable>
        </View>

        {/* Tab: รายการยา */}
        {tab === "schedule" && (
          <FlatList
            data={schedules}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="medical-outline" size={52} color="#BFDBFE" />
                <Text style={s.emptyText}>ยังไม่มีรายการยา</Text>
                <Text style={s.emptySubText}>กดปุ่ม + เพื่อเพิ่มยา</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={s.card}>
                <View style={s.cardLeft}>
                  <View style={s.iconCircle}>
                    <Ionicons name="medical" size={18} color="#2563EB" />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={s.medName}>{item.medication_name}</Text>
                    <View style={s.badgeRow}>
                      {item.dosage && (
                        <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                          <Text style={[s.pillText, { color: "#7C3AED" }]}>{item.dosage}</Text>
                        </View>
                      )}
                      {item.meal_relation && (
                        <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                          <Ionicons name={getMealIcon(item.meal_relation)} size={12} color="#059669" />
                          <Text style={[s.pillText, { color: "#059669" }]}>{item.meal_relation}</Text>
                        </View>
                      )}
                      <View style={[s.pill, { backgroundColor: "#EEF4FF" }]}>
                        <Ionicons name="time-outline" size={12} color="#2563EB" />
                        <Text style={[s.pillText, { color: "#2563EB" }]}>{item.time_hhmm}</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={s.cardActions}>
                  <Pressable style={s.actionBtn}
                    onPress={() => router.push({
                      pathname: "/caregiver/(stack)/add-schedule",
                      params: { editMode: "true", scheduleId: item.id, elderlyId: selectedElderly?.id },
                    })}>
                    <Ionicons name="create-outline" size={16} color="#2563EB" />
                  </Pressable>
                  <Pressable style={[s.actionBtn, { backgroundColor: "#FFF5F5" }]}
                    onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}

        {/* Tab: ตารางวันนี้ */}
        {tab === "today" && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            <View style={s.summaryCard}>
              <View>
                <Text style={s.summaryTitle}>กินยาแล้ววันนี้</Text>
                <Text style={s.summaryNum}>
                  {takenCount}<Text style={s.summaryTotal}>/{totalCount}</Text>
                </Text>
              </View>
              <View style={s.summaryProgress}>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, {
                    width: totalCount > 0 ? `${Math.round(takenCount / totalCount * 100)}%` as any : "0%"
                  }]} />
                </View>
                <Text style={s.summaryPct}>
                  {totalCount > 0 ? Math.round(takenCount / totalCount * 100) : 0}%
                </Text>
              </View>
            </View>

            {todayList.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="calendar-outline" size={52} color="#BFDBFE" />
                <Text style={s.emptyText}>ไม่มียาที่ต้องกินวันนี้</Text>
              </View>
            ) : (
              todayList.map((item) => {
                const cfg = item.status ? statusConfig[item.status as keyof typeof statusConfig] : null;
                return (
                  <Pressable key={item.id}
                    style={[s.todayCard, cfg && { borderLeftColor: cfg.color }]}
                    onPress={() => { setActiveItem(item); setModalVisible(true); }}>
                    <View style={s.cardLeft}>
                      <View style={[s.iconCircle, cfg && { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg ? cfg.icon as any : "medical"} size={18}
                          color={cfg ? cfg.color : "#2563EB"} />
                      </View>
                      <View style={{ marginLeft: 12, flex: 1 }}>
                        <Text style={s.medName}>{item.medication_name}</Text>
                        <View style={s.badgeRow}>
                          {item.dosage && (
                            <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                              <Text style={[s.pillText, { color: "#7C3AED" }]}>{item.dosage}</Text>
                            </View>
                          )}
                          {item.meal_relation && (
                            <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                              <Text style={[s.pillText, { color: "#059669" }]}>{item.meal_relation}</Text>
                            </View>
                          )}
                          <View style={[s.pill, { backgroundColor: "#EEF4FF" }]}>
                            <Ionicons name="time-outline" size={12} color="#2563EB" />
                            <Text style={[s.pillText, { color: "#2563EB" }]}>{item.time_hhmm}</Text>
                          </View>
                        </View>
                      </View>
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
          </ScrollView>
        )}
      </Pressable>

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.bottomSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalIconWrap}>
              <Ionicons name="medical" size={32} color="#2563EB" />
            </View>
            <Text style={s.modalDrugName}>{activeItem?.medication_name}</Text>
            {activeItem?.dosage && <Text style={s.modalDosage}>{activeItem.dosage}</Text>}

            <View style={s.modalInfoRow}>
              {activeItem?.meal_relation && (
                <View style={s.modalBadge}>
                  <Ionicons name="restaurant-outline" size={13} color="#059669" />
                  <Text style={[s.modalBadgeText, { color: "#059669" }]}>{activeItem.meal_relation}</Text>
                </View>
              )}
              <View style={s.modalBadge}>
                <Ionicons name="time-outline" size={13} color="#2563EB" />
                <Text style={[s.modalBadgeText, { color: "#2563EB" }]}>{activeItem?.time_hhmm}</Text>
              </View>
            </View>

            <Text style={s.modalTitle}>บันทึกการกินยา</Text>

            <Pressable style={[s.logBtn, { backgroundColor: "#10B981" }]}
              onPress={() => handleLog("taken")} disabled={logging}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={s.logBtnText}>✓ กินแล้ว</Text>
            </Pressable>

            <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#F59E0B" }]}
              onPress={() => handleLog("late")} disabled={logging}>
              <Ionicons name="time" size={20} color="#F59E0B" />
              <Text style={[s.logBtnText, { color: "#F59E0B" }]}>กินล่าช้า</Text>
            </Pressable>

            <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]}
              onPress={() => handleLog("missed")} disabled={logging}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
              <Text style={[s.logBtnText, { color: "#EF4444" }]}>✕ ข้ามมื้อนี้</Text>
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 16 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#1E3A5F" },
  headerSub: { fontSize: 13, color: "#64748B", marginTop: 2 },
  headerIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  selectorRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12, gap: 10 },
  dropdown: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "white", padding: 10, borderRadius: 12, gap: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  dropdownAvatar: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  dropdownAvatarText: { color: "white", fontWeight: "800", fontSize: 12 },
  dropdownText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" },
  dropdownList: { position: "absolute", top: 48, left: 0, right: 0, backgroundColor: "white", borderRadius: 14, elevation: 8, zIndex: 999, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
  dropdownItem: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderBottomWidth: 1, borderColor: "#F1F5F9" },
  dropdownItemText: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 8, backgroundColor: "white", borderRadius: 12, padding: 4, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  tabBtn: { flex: 1, flexDirection: "row", paddingVertical: 8, alignItems: "center", justifyContent: "center", borderRadius: 10, gap: 5 },
  tabActive: { backgroundColor: "#2563EB" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  tabTextActive: { color: "white" },
  notifBadge: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  notifBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
  card: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "white", padding: 14, borderRadius: 16, marginBottom: 10, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  todayCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "white", padding: 14, borderRadius: 16, marginBottom: 10, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2, borderLeftWidth: 4, borderLeftColor: "#E2E8F0" },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  cardActions: { flexDirection: "row", gap: 6 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  medName: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText: { fontSize: 12, fontWeight: "600" },
  actionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: "700" },
  summaryCard: { backgroundColor: "#2563EB", borderRadius: 16, padding: 18, marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTitle: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginBottom: 4 },
  summaryNum: { color: "white", fontSize: 32, fontWeight: "800" },
  summaryTotal: { fontSize: 20, color: "rgba(255,255,255,0.6)" },
  summaryProgress: { alignItems: "flex-end", gap: 6 },
  progressBg: { width: 100, height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "white", borderRadius: 99 },
  summaryPct: { color: "white", fontSize: 16, fontWeight: "700" },
  emptyWrap: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 15, color: "#94A3B8", fontWeight: "600" },
  emptySubText: { fontSize: 13, color: "#CBD5E1" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  bottomSheet: { backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 12 },
  modalDrugName: { fontSize: 20, fontWeight: "800", color: "#1E3A5F", textAlign: "center" },
  modalDosage: { fontSize: 14, color: "#64748B", textAlign: "center", marginTop: 4 },
  modalInfoRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10, marginBottom: 16 },
  modalBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F8FAFC", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  modalBadgeText: { fontSize: 12, fontWeight: "600" },
  modalTitle: { fontSize: 15, fontWeight: "700", color: "#64748B", textAlign: "center", marginBottom: 14 },
  logBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginBottom: 10 },
  logBtnText: { color: "white", fontWeight: "700", fontSize: 15 },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
});