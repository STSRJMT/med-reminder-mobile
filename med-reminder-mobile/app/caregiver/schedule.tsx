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
import { Calendar } from "react-native-calendars";

type Elderly = { id: number; name: string; age: number | null };
type Schedule = {
  id: number; time_hhmm: string; medication_name: string;
  dosage: string | null; notes: string | null; meal_relation: string | null;
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

type TodaySchedule = Schedule & { status: "taken" | "late" | "missed" | null };
type TabType = "schedule" | "today";
type TodaySubTab = "today" | "pick";

const avatarColors = ["#2563EB", "#7C3AED", "#059669", "#DC2626", "#D97706"];
const getAvatarColor = (id: number) => avatarColors[id % avatarColors.length];

const toDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const fromDateStr = (str: string) => {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

const formatDateTH = (date: Date) => {
  const months = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const monthsShort = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
                       "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return {
    long:  `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`,
    short: `${date.getDate()} ${monthsShort[date.getMonth()]} ${date.getFullYear() + 543}`,
  };
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

const formatDays = (days_of_week: string | null) => {
  if (!days_of_week) return "ทุกวัน";
  const dayMap: any = { "0": "อา", "1": "จ", "2": "อ", "3": "พ", "4": "พฤ", "5": "ศ", "6": "ส" };
  const arr = days_of_week.split(",").map(d => dayMap[d.trim()] ?? d.trim());
  if (arr.length === 7) return "ทุกวัน";
  return arr.join(", ");
};

export default function CaregiverSchedule() {
  const router = useRouter();
  const { elderlyId: paramElderlyId } = useLocalSearchParams<{ elderlyId: string }>();

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

  const [elderlyList, setElderlyList]         = useState<Elderly[]>([]);
  const [selectedElderly, setSelectedElderly] = useState<Elderly | null>(null);
  const [tab, setTab]                         = useState<TabType>("schedule");
  const [todaySubTab, setTodaySubTab]         = useState<TodaySubTab>("today");
  const [schedules, setSchedules]             = useState<Schedule[]>([]);
  const [todayList, setTodayList]             = useState<TodaySchedule[]>([]);
  const [historyList, setHistoryList]         = useState<TodaySchedule[]>([]);
  const [historyLoading, setHistoryLoading]   = useState(false);
  const [selectedDate, setSelectedDate]       = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  });
  const [showCalendar, setShowCalendar]       = useState(false);
  const [loading, setLoading]                 = useState(true);
  // ── เปลี่ยนจาก showDropdown → showDropdownModal ──
  const [showDropdownModal, setShowDropdownModal] = useState(false);
  const [modalVisible, setModalVisible]       = useState(false);
  const [activeItem, setActiveItem]           = useState<TodaySchedule | null>(null);
  const [logging, setLogging]                 = useState(false);

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

  const fetchHistory = async (id: number, date: Date) => {
    setHistoryLoading(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const dateStr = toDateStr(date);
      const res = await axios.get(
        `${API_BASE_URL}/caregiver/history/${id}?date=${dateStr}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setHistoryList(res.data.items || []);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${API_BASE_URL}/caregiver/elderly`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list: Elderly[] = res.data.items || [];
      setElderlyList(list);

      let targetId: number | undefined;
      if (paramElderlyId) {
        const found = list.find((e) => e.id === Number(paramElderlyId));
        const target = found ?? list[0];
        setSelectedElderly(target ?? null);
        targetId = target?.id;
      } else {
        const current = selectedElderly ?? list[0];
        setSelectedElderly(current ?? null);
        targetId = current?.id;
      }

      if (targetId) {
        await Promise.all([fetchSchedules(targetId), fetchToday(targetId)]);
      }
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [paramElderlyId]));

  // ── เมื่อเปลี่ยนผู้สูงอายุในขณะที่อยู่ sub-tab "เลือกวันที่" ให้ fetch history ใหม่ทันที ──
  useEffect(() => {
    if (todaySubTab === "pick" && selectedElderly) {
      fetchHistory(selectedElderly.id, selectedDate);
    }
  }, [selectedElderly?.id]);

  const handleSelectElderly = (item: Elderly) => {
    setSelectedElderly(item);
    setShowDropdownModal(false);
    fetchSchedules(item.id);
    fetchToday(item.id);
    if (todaySubTab === "pick") fetchHistory(item.id, selectedDate);
  };

  const handleLog = async (status: "taken" | "late" | "missed") => {
    if (!activeItem || !selectedElderly) return;
    setLogging(true);

    const updatedId = activeItem.id;
    const previousStatus = activeItem.status;
    setTodayList(prev =>
      prev.map(item => item.id === updatedId ? { ...item, status } : item)
    );
    setModalVisible(false);

    try {
      const token = await AsyncStorage.getItem("token");
      await axios.post(`${API_BASE_URL}/caregiver/intake-logs`, {
        scheduleId: activeItem.id,
        elderlyId: selectedElderly.id,
        status,
      }, { headers: { Authorization: `Bearer ${token}` } });
      await fetchToday(selectedElderly.id);
    } catch {
      setTodayList(prev =>
        prev.map(item => item.id === updatedId ? { ...item, status: previousStatus } : item)
      );
      setModalVisible(true);
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLogging(false);
    }
  };

  const handleDeleteGroup = async (group: GroupedSchedule) => {
    const msg = group.schedules.length > 1
      ? `ต้องการลบยา "${group.medication_name}" ทั้งหมด ${group.schedules.length} เวลาหรือไม่?`
      : `ต้องการลบ "${group.medication_name}" หรือไม่?`;

    Alert.alert("ยืนยันการลบ", msg, [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ", style: "destructive",
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem("token");
            for (const s of group.schedules) {
              await axios.delete(`${API_BASE_URL}/caregiver/schedules/${s.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
            }
            if (selectedElderly?.id) {
              fetchSchedules(selectedElderly.id);
              fetchToday(selectedElderly.id);
            }
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
  const groupedSchedules = groupSchedules(schedules);

  const isDateToday = (date: Date) => {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  };

  // ── Today card renderer ──
  const renderMedCard = (item: TodaySchedule, onPress?: () => void) => {
    const cfg = item.status ? statusConfig[item.status as keyof typeof statusConfig] : null;
    return (
      <Pressable
        key={`${item.id}-${item.status ?? "null"}`}
        style={[s.todayCard, cfg && { borderLeftColor: cfg.color }]}
        onPress={onPress}
      >
        <View style={s.cardLeft}>
          <View style={[s.iconCircle, cfg && { backgroundColor: cfg.bg }]}>
            <Ionicons
              name={cfg ? (cfg.icon as any) : "medical"}
              size={18}
              color={cfg ? cfg.color : "#2563EB"}
            />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={s.medName}>{item.medication_name}</Text>
            <View style={s.badgeRow}>
              {item.dosage && (
                <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                  <Text style={[s.pillText, { color: "#7C3AED" }]}>{item.dosage}</Text>
                </View>
              )}
              {item.meal_relation && item.meal_relation !== "ไม่ระบุ" && (
                <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                  <Text style={[s.pillText, { color: "#059669" }]}>{item.meal_relation}</Text>
                </View>
              )}
              <View style={[s.pill, { backgroundColor: "#EEF4FF" }]}>
                <Ionicons name="time-outline" size={12} color="#2563EB" />
                <Text style={[s.pillText, { color: "#2563EB" }]}>{item.time_hhmm}</Text>
              </View>
            </View>
            {item.notes ? (
              <View style={s.notesRow}>
                <Ionicons name="alert-circle-outline" size={12} color="#F97316" />
                <Text style={s.notesText} numberOfLines={2}>{item.notes}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {cfg ? (
          <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        ) : onPress ? (
          <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        ) : (
          <View style={[s.statusBadge, { backgroundColor: "#F1F5F9" }]}>
            <Text style={[s.statusText, { color: "#94A3B8" }]}>ไม่มีข้อมูล</Text>
          </View>
        )}
      </Pressable>
    );
  };

  // ── Header + Selector + Tabs ──
  const listHeader = () => (
    <>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>ตารางยา</Text>
          <Text style={s.headerSub}>จัดการรายการยา</Text>
        </View>
        <Pressable style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </Pressable>
      </View>

      {/* Elderly selector — กดแล้วเปิด Modal แทน dropdown absolute */}
      <View style={s.selectorRow}>
        <Pressable
          style={s.dropdown}
          onPress={() => setShowDropdownModal(true)}
        >
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

        <Pressable
          style={s.addBtn}
          onPress={() => router.push({
            pathname: "/caregiver/(stack)/add-schedule",
            params: { elderlyId: selectedElderly?.id, elderlyName: selectedElderly?.name },
          })}
        >
          <Ionicons name="add" size={22} color="white" />
        </Pressable>
      </View>

      {/* Main Tabs */}
      <View style={s.tabRow}>
        <Pressable style={[s.tabBtn, tab === "schedule" && s.tabActive]} onPress={() => setTab("schedule")}>
          <Ionicons name="list" size={15} color={tab === "schedule" ? "white" : "#94A3B8"} />
          <Text style={[s.tabText, tab === "schedule" && s.tabTextActive]}>รายการยา</Text>
        </Pressable>
        <Pressable style={[s.tabBtn, tab === "today" && s.tabActive]} onPress={() => setTab("today")}>
          <Ionicons name="today" size={15} color={tab === "today" ? "white" : "#94A3B8"} />
          <Text style={[s.tabText, tab === "today" && s.tabTextActive]}>ตารางยา</Text>
          {takenCount < totalCount && totalCount > 0 && (
            <View style={s.notifBadge}>
              <Text style={s.notifBadgeText}>{totalCount - takenCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
    </>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F9FF" }}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F9FF" }}>

      {/* ── Dropdown Modal (แสดงเหนือทุก layer) ── */}
      <Modal
        visible={showDropdownModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDropdownModal(false)}
      >
        <Pressable
          style={s.dropdownOverlay}
          onPress={() => setShowDropdownModal(false)}
        >
          <View style={s.dropdownModalBox}>
            <Text style={s.dropdownModalTitle}>เลือกผู้สูงอายุ</Text>
            {elderlyList.map((item) => (
              <Pressable
                key={item.id}
                style={[
                  s.dropdownModalItem,
                  selectedElderly?.id === item.id && s.dropdownModalItemActive,
                ]}
                onPress={() => handleSelectElderly(item)}
              >
                <View style={[s.dropdownAvatar, { backgroundColor: getAvatarColor(item.id) }]}>
                  <Text style={s.dropdownAvatarText}>{item.name?.charAt(0)}</Text>
                </View>
                <Text style={[
                  s.dropdownItemText,
                  selectedElderly?.id === item.id && { color: "#2563EB", fontWeight: "700" },
                ]}>
                  {item.name} {item.age ? `(${item.age} ปี)` : ""}
                </Text>
                {selectedElderly?.id === item.id && (
                  <Ionicons name="checkmark-circle" size={18} color="#2563EB" />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ── Tab: รายการยา ── */}
      {tab === "schedule" && (
        <FlatList
          data={groupedSchedules}
          keyExtractor={(_, index) => index.toString()}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader()}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="medical-outline" size={52} color="#BFDBFE" />
              <Text style={s.emptyText}>ยังไม่มีรายการยา</Text>
              <Text style={s.emptySubText}>กดปุ่ม + เพื่อเพิ่มยา</Text>
            </View>
          }
          renderItem={({ item: group }) => (
            <View style={[s.card, { marginHorizontal: 16, marginBottom: 10 }]}>
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
                          <Ionicons name={getMealIcon(group.meal_relation)} size={12} color="#059669" />
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
                      pathname: "/caregiver/(stack)/add-schedule",
                      params: {
                        editMode: "true",
                        scheduleId: group.schedules[0].id,
                        scheduleIds: group.schedules.map(sc => sc.id).join(","),
                        elderlyId: selectedElderly?.id,
                        elderlyName: selectedElderly?.name,
                      },
                    })}
                  >
                    <Ionicons name="create-outline" size={16} color="#2563EB" />
                  </Pressable>
                  <Pressable
                    style={[s.actionBtn, { backgroundColor: "#FFF5F5" }]}
                    onPress={() => handleDeleteGroup(group)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </Pressable>
                </View>
              </View>

              <View style={s.timeChipRow}>
                {group.schedules
                  .slice()
                  .sort((a, b) => a.time_hhmm.localeCompare(b.time_hhmm))
                  .map((sc) => (
                    <View key={sc.id} style={s.timeChip}>
                      <Ionicons name="time-outline" size={12} color="#2563EB" />
                      <Text style={s.timeChipText}>{sc.time_hhmm}</Text>
                    </View>
                  ))}
              </View>
            </View>
          )}
        />
      )}

      {/* ── Tab: ตารางยา ── */}
      {tab === "today" && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {listHeader()}

          <View style={{ paddingHorizontal: 16 }}>

            {/* Sub-tabs */}
            <View style={s.subTabRow}>
              <Pressable
                style={[s.subTabBtn, todaySubTab === "today" && s.subTabActive]}
                onPress={() => setTodaySubTab("today")}
              >
                <Ionicons
                  name="today-outline"
                  size={14}
                  color={todaySubTab === "today" ? "#2563EB" : "#94A3B8"}
                  style={{ marginRight: 4 }}
                />
                <Text style={[s.subTabText, todaySubTab === "today" && s.subTabTextActive]}>
                  ตารางวันนี้
                </Text>
              </Pressable>
              <Pressable
                style={[s.subTabBtn, todaySubTab === "pick" && s.subTabActive]}
                onPress={() => {
                  setTodaySubTab("pick");
                  if (selectedElderly) fetchHistory(selectedElderly.id, selectedDate);
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={todaySubTab === "pick" ? "#2563EB" : "#94A3B8"}
                  style={{ marginRight: 4 }}
                />
                <Text style={[s.subTabText, todaySubTab === "pick" && s.subTabTextActive]}>
                  เลือกวันที่
                </Text>
              </Pressable>
            </View>

            {/* ─── ตารางวันนี้ ─── */}
            {todaySubTab === "today" && (
              <>
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
                  todayList.map((item) =>
                    renderMedCard(item, () => { setActiveItem(item); setModalVisible(true); })
                  )
                )}
              </>
            )}

            {/* ─── เลือกวันที่ ─── */}
            {todaySubTab === "pick" && (
              <>
                <Pressable style={s.datePickerBtn} onPress={() => setShowCalendar(true)}>
                  <Ionicons name="calendar" size={16} color="#2563EB" />
                  <Text style={s.datePickerText}>
                    {formatDateTH(selectedDate).long}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#64748B" />
                </Pressable>

                {/* ── Calendar Modal ── */}
                <Modal transparent animationType="fade" visible={showCalendar}>
                  <Pressable
                    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
                    onPress={() => setShowCalendar(false)}
                  >
                    <Pressable
                      style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 }}
                      onPress={e => e.stopPropagation()}
                    >
                      <View style={{ width: 40, height: 4, backgroundColor: "#E2E8F0", borderRadius: 99, alignSelf: "center", marginTop: 12, marginBottom: 4 }} />
                      <Calendar
                        current={toDateStr(selectedDate)}
                        markedDates={{
                          [toDateStr(selectedDate)]: {
                            selected: true,
                            selectedColor: "#2563EB",
                          },
                        }}
                        onDayPress={(day) => {
                          const picked = fromDateStr(day.dateString);
                          setSelectedDate(picked);
                          if (selectedElderly) fetchHistory(selectedElderly.id, picked);
                          setShowCalendar(false);
                        }}
                        theme={{
                          todayTextColor: "#2563EB",
                          todayBackgroundColor: "#EFF6FF",
                          selectedDayBackgroundColor: "#2563EB",
                          selectedDayTextColor: "white",
                          arrowColor: "#2563EB",
                          monthTextColor: "#1E3A5F",
                          dayTextColor: "#1E293B",
                          textDisabledColor: "#CBD5E1",
                          textDayFontWeight: "600",
                          textMonthFontWeight: "800",
                          textDayHeaderFontWeight: "700",
                          calendarBackground: "white",
                        }}
                      />
                    </Pressable>
                  </Pressable>
                </Modal>

                {/* Summary ย้อนหลัง */}
                {!historyLoading && historyList.length > 0 && (() => {
                  const hTaken = historyList.filter(i => i.status === "taken" || i.status === "late").length;
                  const hTotal = historyList.length;
                  const hPct = hTotal > 0 ? Math.round(hTaken / hTotal * 100) : 0;
                  return (
                    <View style={[s.summaryCard, { backgroundColor: "#475569" }]}>
                      <View>
                        <Text style={s.summaryTitle}>
                          ตารางยา {formatDateTH(selectedDate).short}
                        </Text>
                        <Text style={s.summaryNum}>
                          {hTaken}<Text style={s.summaryTotal}>/{hTotal}</Text>
                        </Text>
                      </View>
                      <View style={s.summaryProgress}>
                        <View style={s.progressBg}>
                          <View style={[s.progressFill, { width: `${hPct}%` as any }]} />
                        </View>
                        <Text style={s.summaryPct}>{hPct}%</Text>
                      </View>
                    </View>
                  );
                })()}

                {historyLoading ? (
                  <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
                ) : historyList.length === 0 ? (
                  <View style={s.emptyWrap}>
                    <Ionicons name="calendar-outline" size={52} color="#BFDBFE" />
                    <Text style={s.emptyText}>ไม่มียาในวันที่เลือก</Text>
                  </View>
                ) : (
                  historyList.map((item) => {
                    const canLog = isDateToday(selectedDate);
                    return renderMedCard(
                      item,
                      canLog ? () => { setActiveItem(item); setModalVisible(true); } : undefined
                    );
                  })
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Modal บันทึกการกินยา ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.bottomSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalIconWrap}>
              <Ionicons name="medical" size={32} color="#2563EB" />
            </View>
            <Text style={s.modalDrugName}>{activeItem?.medication_name}</Text>
            {activeItem?.dosage && <Text style={s.modalDosage}>{activeItem.dosage}</Text>}
            <View style={s.modalInfoRow}>
              {activeItem?.meal_relation && activeItem.meal_relation !== "ไม่ระบุ" && (
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
            {activeItem?.notes ? (
              <View style={s.modalNotesBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#F97316" />
                <Text style={s.modalNotesText}>{activeItem.notes}</Text>
              </View>
            ) : null}
            <Text style={s.modalTitle}>บันทึกการกินยา</Text>
            <Pressable
              style={[s.logBtn, { backgroundColor: "#10B981" }]}
              onPress={() => handleLog("taken")}
              disabled={logging}
            >
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={s.logBtnText}>✓ กินแล้ว</Text>
            </Pressable>
            <Pressable
              style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#F59E0B" }]}
              onPress={() => handleLog("late")}
              disabled={logging}
            >
              <Ionicons name="time" size={20} color="#F59E0B" />
              <Text style={[s.logBtnText, { color: "#F59E0B" }]}>กินล่าช้า</Text>
            </Pressable>
            <Pressable
              style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]}
              onPress={() => handleLog("missed")}
              disabled={logging}
            >
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
  logoutBtn: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FEE2E2" },
  selectorRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12, gap: 10 },
  dropdown: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "white", padding: 10, borderRadius: 12, gap: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  dropdownAvatar: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  dropdownAvatarText: { color: "white", fontWeight: "800", fontSize: 12 },
  dropdownText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" },
  // ── Dropdown Modal styles ──
  dropdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" },
  dropdownModalBox: { backgroundColor: "white", borderRadius: 18, padding: 16, width: "82%", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10 },
  dropdownModalTitle: { fontSize: 14, fontWeight: "700", color: "#64748B", marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  dropdownModalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, gap: 10, borderRadius: 10 },
  dropdownModalItemActive: { backgroundColor: "#EFF6FF" },
  dropdownItemText: { fontSize: 14, fontWeight: "600", color: "#1E293B", flex: 1 },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  tabRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 8, backgroundColor: "white", borderRadius: 12, padding: 4, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  tabBtn: { flex: 1, flexDirection: "row", paddingVertical: 8, alignItems: "center", justifyContent: "center", borderRadius: 10, gap: 5 },
  tabActive: { backgroundColor: "#2563EB" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  tabTextActive: { color: "white" },
  notifBadge: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  notifBadgeText: { color: "white", fontSize: 10, fontWeight: "700" },
  subTabRow: { flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 10, padding: 3, marginBottom: 14 },
  subTabBtn: { flex: 1, flexDirection: "row", paddingVertical: 9, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  subTabActive: { backgroundColor: "white", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  subTabText: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  subTabTextActive: { color: "#2563EB" },
  datePickerBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "white", padding: 12, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  datePickerText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" },
  card: { backgroundColor: "white", padding: 14, borderRadius: 16, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardLeft: { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  cardActions: { flexDirection: "row", gap: 6, marginTop: 2 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  medName: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText: { fontSize: 12, fontWeight: "600" },
  actionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  daysRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  daysText: { fontSize: 12, color: "#64748B", fontWeight: "500" },
  notesRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  notesText: { fontSize: 12, color: "#F97316", fontWeight: "600", flex: 1, lineHeight: 16 },
  timeChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  timeChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EEF4FF", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#BFDBFE" },
  timeChipText: { fontSize: 13, fontWeight: "700", color: "#2563EB" },
  todayCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", backgroundColor: "white", padding: 14, borderRadius: 16, marginBottom: 10, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2, borderLeftWidth: 4, borderLeftColor: "#E2E8F0" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 2 },
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
  modalInfoRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10, marginBottom: 12 },
  modalBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F8FAFC", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  modalBadgeText: { fontSize: 12, fontWeight: "600" },
  modalNotesBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#FFF7ED", borderRadius: 10, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: "#F97316" },
  modalNotesText: { fontSize: 13, color: "#F97316", fontWeight: "600", flex: 1, lineHeight: 18 },
  modalTitle: { fontSize: 15, fontWeight: "700", color: "#64748B", textAlign: "center", marginBottom: 14 },
  logBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, marginBottom: 10 },
  logBtnText: { color: "white", fontWeight: "700", fontSize: 15 },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelText: { color: "#94A3B8", fontSize: 14, fontWeight: "600" },
});
