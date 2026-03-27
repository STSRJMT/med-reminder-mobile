import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Modal, Alert, PixelRatio, AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLogout } from "@/hooks/useLogout";
import * as Notifications from "expo-notifications";
import { scheduleAllNotifications } from "../../../src/notifications/notificationService";
import { Calendar } from "react-native-calendars";
import DateTimePicker from "@react-native-community/datetimepicker";

/* ─── Types ─── */

type TodaySchedule = {
  scheduleId: number;
  timeHHMM: string;
  medicationName: string;
  dosage: string | null;
  notes: string | null;
  mealRelation: string | null;
  daysOfWeek: string | null;
  todayStatus: "taken" | "late" | "missed" | null;
  takenAt: string | null; // ✅ เวลากินจริง
  _status?: "taken" | "late" | "missed" | null;
};

// ✅ Group ยาตามเวลา
type TodayMedItem = {
  scheduleId: number;
  medicationName: string;
  dosage: string | null;
  notes: string | null;
  mealRelation: string | null;
  status: "taken" | "late" | "missed" | null;
  takenAt: string | null;
};

type TodayGroupedByTime = {
  timeHHMM: string;
  medicines: TodayMedItem[];
};

type TabType = "today" | "history";

/* ─── Constants ─── */

const LATE_THRESHOLD_MINUTES = 30;

const fontScale = Math.min(PixelRatio.getFontScale(), 1.4);
const fs = (size: number) => Math.round(size * fontScale);

const statusConfig = {
  taken:  { label: "กินแล้ว",    color: "#10B981", bg: "#ECFDF5", icon: "checkmark-circle" },
  late:   { label: "กินล่าช้า",  color: "#F59E0B", bg: "#FFFBEB", icon: "time"             },
  missed: { label: "ข้ามมื้อนี้", color: "#EF4444", bg: "#FFF5F5", icon: "close-circle"     },
} as const;

const DAY_TH   = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
const MONTH_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const MONTH_TH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
                        "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

/* ─── Helpers ─── */

const toDateStr = (d: Date) => {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const fromDateStr = (str: string) => {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

const formatDateTH = (date: Date) =>
  `${DAY_TH[date.getDay()]}ที่ ${date.getDate()} ${MONTH_TH[date.getMonth()]} ${date.getFullYear() + 543}`;

const formatDateTHShort = (date: Date) =>
  `${date.getDate()} ${MONTH_TH_SHORT[date.getMonth()]} ${date.getFullYear() + 543}`;

const getTimeMs = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const formatTakenTime = (takenAt: string | null): string | null => {
  if (!takenAt) return null;
  try {
    const d = new Date(takenAt);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return null; }
};

const getMealIcon = (meal: string | null): any => {
  if (!meal) return null;
  if (meal.includes("ก่อน")) return "restaurant-outline";
  if (meal.includes("หลัง")) return "cafe-outline";
  if (meal.includes("พร้อม")) return "fast-food-outline";
  return "information-circle-outline";
};

// ✅ Group ตามเวลา
function groupTodayByTime(items: TodaySchedule[]): TodayGroupedByTime[] {
  const map = new Map<string, TodayGroupedByTime>();
  for (const s of items) {
    if (!map.has(s.timeHHMM)) {
      map.set(s.timeHHMM, { timeHHMM: s.timeHHMM, medicines: [] });
    }
    map.get(s.timeHHMM)!.medicines.push({
      scheduleId:    s.scheduleId,
      medicationName: s.medicationName,
      dosage:        s.dosage,
      notes:         s.notes,
      mealRelation:  s.mealRelation,
      status:        s._status ?? null,
      takenAt:       s.takenAt ?? null,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.timeHHMM.localeCompare(b.timeHHMM));
}

// ✅ auto-detect ล่าช้า
const resolveStatus = (
  requested: "taken" | "missed",
  scheduledTime: string,
  takenTime: Date
): "taken" | "late" | "missed" => {
  if (requested === "missed") return "missed";
  const diff = getTimeMs(`${String(takenTime.getHours()).padStart(2,"0")}:${String(takenTime.getMinutes()).padStart(2,"0")}`) - getTimeMs(scheduledTime);
  return diff > LATE_THRESHOLD_MINUTES ? "late" : "taken";
};

/* ─── Main Component ─── */

export default function ElderlyToday() {
  const logout           = useLogout();
  const notifListener    = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appState         = useRef(AppState.currentState);

  const [tab, setTab]                       = useState<TabType>("today");
  const [list, setList]                     = useState<TodaySchedule[]>([]);
  const [historyList, setHistoryList]       = useState<TodaySchedule[]>([]);
  const [loading, setLoading]               = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  // modal state
  const [modalVisible, setModalVisible]   = useState(false);
  const [activeGroup, setActiveGroup]     = useState<TodayGroupedByTime | null>(null);
  const [logging, setLogging]             = useState(false);

  // ✅ เวลากินจริง
  const [actualTakenTime, setActualTakenTime] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker]   = useState(false);
  const [tempPickerTime, setTempPickerTime]   = useState<Date>(new Date());

  // calendar
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  });
  const [showCalendar, setShowCalendar] = useState(false);

  /* ─── Fetch ─── */

  const fetchToday = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const token = await AsyncStorage.getItem("token");

      await axios.post(
        `${API_BASE_URL}/elderly/auto-missed`, {},
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => {});

      const dateStr = toDateStr(new Date());
      const res = await axios.get(
        `${API_BASE_URL}/elderly/today?date=${dateStr}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const items: TodaySchedule[] = (res.data.items || []).map((item: any) => ({
        ...item,
        takenAt: item.takenAt ?? null,
        _status: item.todayStatus ?? null,
      }));
      setList(items);

      scheduleAllNotifications(
        items.filter(i => !i._status).map(i => ({
          scheduleId:     i.scheduleId,
          timeHHMM:       i.timeHHMM,
          medicationName: i.medicationName,
          dosage:         i.dosage,
          daysOfWeek:     i.daysOfWeek,
        }))
      );
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (date: Date) => {
    try {
      setHistoryLoading(true);
      const token   = await AsyncStorage.getItem("token");
      const dateStr = toDateStr(date);
      const res = await axios.get(
        `${API_BASE_URL}/elderly/today?date=${dateStr}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items: TodaySchedule[] = (res.data.items || []).map((item: any) => ({
        ...item,
        takenAt: item.takenAt ?? null,
        _status: item.todayStatus ?? null,
      }));
      setHistoryList(items);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setHistoryLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchToday(); }, []));

  useEffect(() => {
    if (tab === "history") fetchHistory(selectedDate);
  }, [tab]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") fetchToday();
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener(() => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.scheduleId) {
        setList((prev) => {
          const found = prev.find(i => i.scheduleId === data.scheduleId);
          if (found) openGroupModalForItem(found, prev);
          return prev;
        });
      }
    });
    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  /* ─── Modal ─── */

  const openGroupModal = (group: TodayGroupedByTime) => {
    setActiveGroup(group);
    const [hh, mm] = group.timeHHMM.split(":").map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    setActualTakenTime(d);
    setTempPickerTime(d);
    setShowTimePicker(false);
    setModalVisible(true);
  };

  const openGroupModalForItem = (item: TodaySchedule, allItems: TodaySchedule[]) => {
    const group = groupTodayByTime(allItems).find(g => g.timeHHMM === item.timeHHMM);
    if (group) openGroupModal(group);
  };

  /* ─── Log ─── */

  const handleLogSingle = async (scheduleId: number, scheduledTime: string, requested: "taken" | "missed") => {
    const status = resolveStatus(requested, scheduledTime, actualTakenTime);
    const takenAt = requested === "missed" ? new Date() : new Date(actualTakenTime);
    const token = await AsyncStorage.getItem("token");
    await axios.post(
      `${API_BASE_URL}/elderly/intake`,
      { scheduleId, status, takenAtISO: takenAt.toISOString() },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  };

  const handleLogGroup = async (requested: "taken" | "missed") => {
    if (!activeGroup) return;
    setLogging(true);
    setModalVisible(false);
    try {
      await Promise.all(
        activeGroup.medicines.map(m =>
          handleLogSingle(m.scheduleId, activeGroup.timeHHMM, requested)
        )
      );
      await fetchToday(false);
    } catch {
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLogging(false);
    }
  };

  /* ─── Sort ─── */

  const sortedList = [...list].sort((a, b) => {
    const nowMs = new Date().getHours() * 60 + new Date().getMinutes();
    const priority = (item: TodaySchedule) => {
      const diff = nowMs - getTimeMs(item.timeHHMM);
      if (!item._status && diff >= 30) return 0;
      if (!item._status)               return 1;
      if (item._status === "late")     return 2;
      if (item._status === "taken")    return 3;
      if (item._status === "missed")   return 4;
      return 5;
    };
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.timeHHMM.localeCompare(b.timeHHMM);
  });

  /* ─── Stats ─── */

  const takenCount   = list.filter(t => t._status === "taken" || t._status === "late").length;
  const totalCount   = list.length;
  const pct          = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 0;
  const historyTaken = historyList.filter(t => t._status === "taken" || t._status === "late").length;
  const historyTotal = historyList.length;
  const historyPct   = historyTotal > 0 ? Math.round((historyTaken / historyTotal) * 100) : 0;

  /* ─── Render group card ─── */

  const renderTodayGroup = (group: TodayGroupedByTime, canLog: boolean) => {
    const now = new Date();
    const nowMs = now.getHours() * 60 + now.getMinutes();
    const groupMs = getTimeMs(group.timeHHMM);
    const isOverdue = canLog && nowMs - groupMs >= 30;

    const allTaken  = group.medicines.every(m => m.status === "taken" || m.status === "late");
    const anyMissed = group.medicines.some(m => m.status === "missed");
    const someDone  = group.medicines.some(m => m.status !== null);

    const headerBg = allTaken  ? "#10B981"
      : anyMissed              ? "#EF4444"
      : isOverdue              ? "#EF4444"
      : "#2563EB";

    return (
      <View key={group.timeHHMM} style={[s.groupCard, { borderColor: headerBg + "40" }]}>
        {/* Header — กดเพื่อเปิด modal */}
        <Pressable
          style={[s.groupHeader, { backgroundColor: headerBg }]}
          onPress={canLog ? () => openGroupModal(group) : undefined}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="alarm-outline" size={15} color="white" />
            <Text style={s.groupTime}>{group.timeHHMM}</Text>
            <Text style={s.groupCount}>· {group.medicines.length} รายการ</Text>
          </View>
          <View style={s.groupStatusBadge}>
            <Text style={s.groupStatusText}>
              {allTaken  ? "กินครบแล้ว ✓"
                : anyMissed ? "ข้ามมื้อนี้"
                : isOverdue ? "เลยเวลาแล้ว"
                : someDone  ? "กินบางส่วน"
                : canLog    ? "กด เพื่อบันทึก ›"
                : "รอบันทึก"}
            </Text>
          </View>
        </Pressable>

        {/* รายการยาแต่ละตัว */}
        {group.medicines.map((med, index) => {
          const cfg = med.status ? statusConfig[med.status as keyof typeof statusConfig] : null;
          const takenTimeStr = formatTakenTime(med.takenAt);
          return (
            <View
              key={med.scheduleId}
              style={[
                s.medRow,
                index < group.medicines.length - 1 && s.medRowBorder,
                cfg ? { backgroundColor: cfg.bg + "50" } : null,
              ]}
            >
              <View style={[s.medIcon, cfg ? { backgroundColor: cfg.bg } : { backgroundColor: "#EFF6FF" }]}>
                <Ionicons
                  name={cfg ? (cfg.icon as any) : "medical-outline"}
                  size={17}
                  color={cfg ? cfg.color : "#2563EB"}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.medName}>{med.medicationName}</Text>
                <View style={s.badgeRow}>
                  {med.dosage ? (
                    <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                      <Text style={[s.pillText, { color: "#7C3AED" }]}>{med.dosage}</Text>
                    </View>
                  ) : null}
                  {med.mealRelation && med.mealRelation !== "ไม่ระบุ" ? (
                    <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                      <Ionicons name={getMealIcon(med.mealRelation) ?? "restaurant-outline"} size={10} color="#059669" />
                      <Text style={[s.pillText, { color: "#059669" }]}>{med.mealRelation}</Text>
                    </View>
                  ) : null}
                </View>
                {/* ✅ แสดงเวลากินจริง */}
                {med.status && med.status !== "missed" && takenTimeStr ? (
                  <View style={s.takenAtRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={11}
                      color={med.status === "late" ? "#F59E0B" : "#10B981"}
                    />
                    <Text style={[s.takenAtText, { color: med.status === "late" ? "#F59E0B" : "#10B981" }]}>
                      กินเมื่อ {takenTimeStr}
                    </Text>
                  </View>
                ) : null}
                {med.notes ? (
                  <View style={s.notesRow}>
                    <Ionicons name="alert-circle-outline" size={11} color="#F97316" />
                    <Text style={[s.notesText, { fontSize: fs(11) }]} numberOfLines={1}>{med.notes}</Text>
                  </View>
                ) : null}
              </View>
              {cfg ? (
                <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  const today = new Date();

  return (
    <SafeAreaView style={s.safeArea}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>ตารางยาวันนี้</Text>
            <Text style={s.headerDate}>{formatDateTH(today)}</Text>
          </View>
          <View style={s.headerRight}>
            <Pressable style={s.iconBtn} onPress={() => fetchToday()}>
              <Ionicons name="refresh-outline" size={19} color="#2563EB" />
            </Pressable>
            <Pressable style={[s.iconBtn, s.logoutBtn]} onPress={logout}>
              <Ionicons name="log-out-outline" size={19} color="#EF4444" />
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          <Pressable style={[s.tabBtn, tab === "today" && s.tabActive]} onPress={() => setTab("today")}>
            <Ionicons name="today" size={15} color={tab === "today" ? "white" : "#94A3B8"} />
            <Text style={[s.tabText, tab === "today" && s.tabTextActive]}>ตารางวันนี้</Text>
          </Pressable>
          <Pressable style={[s.tabBtn, tab === "history" && s.tabActive]} onPress={() => setTab("history")}>
            <Ionicons name="calendar" size={15} color={tab === "history" ? "white" : "#94A3B8"} />
            <Text style={[s.tabText, tab === "history" && s.tabTextActive]}>เลือกวันที่</Text>
          </Pressable>
        </View>

        {/* ===== TAB: TODAY ===== */}
        {tab === "today" && (
          <>
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

            <View style={{ paddingHorizontal: 16 }}>
              {totalCount === 0 ? (
                <View style={s.emptyWrap}>
                  <Ionicons name="checkmark-circle-outline" size={56} color="#BFDBFE" />
                  <Text style={s.emptyText}>ไม่มียาที่ต้องกินวันนี้</Text>
                  <Text style={s.emptySubText}>คุณพักผ่อนได้เลย 😊</Text>
                </View>
              ) : (
                groupTodayByTime(sortedList).map(group => renderTodayGroup(group, true))
              )}
            </View>
          </>
        )}

        {/* ===== TAB: HISTORY ===== */}
        {tab === "history" && (
          <>
            <View style={s.dateSelector}>
              <Pressable style={s.dateSelectorBtn} onPress={() => setShowCalendar(true)}>
                <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                <Text style={s.dateSelectorText}>{formatDateTH(selectedDate)}</Text>
                <Ionicons name="chevron-down" size={16} color="#64748B" />
              </Pressable>
            </View>

            <View style={[s.summaryCard, { backgroundColor: "#7C3AED" }]}>
              <View style={s.summaryLeft}>
                <Text style={s.summaryLabel}>ตารางยา {formatDateTHShort(selectedDate)}</Text>
                <View style={s.summaryNumRow}>
                  <Text style={s.summaryNum}>{historyTaken}</Text>
                  <Text style={s.summaryTotal}>/{historyTotal}</Text>
                </View>
              </View>
              <View style={s.summaryRight}>
                <View style={s.progressBg}>
                  <View style={[s.progressFill, { width: `${historyPct}%` as any }]} />
                </View>
                <Text style={s.summaryPct}>{historyPct}%</Text>
              </View>
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              {historyLoading ? (
                <View style={s.center}><ActivityIndicator size="large" color="#7C3AED" /></View>
              ) : historyList.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Ionicons name="calendar-outline" size={56} color="#BFDBFE" />
                  <Text style={s.emptyText}>ไม่มีข้อมูลวันนี้</Text>
                </View>
              ) : (
                groupTodayByTime(
                  [...historyList].sort((a, b) => a.timeHHMM.localeCompare(b.timeHHMM))
                ).map(group => renderTodayGroup(group, false))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ===== Calendar Modal ===== */}
      <Modal transparent animationType="fade" visible={showCalendar}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setShowCalendar(false)}>
          <Pressable style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 }} onPress={e => e.stopPropagation()}>
            <View style={{ width: 40, height: 4, backgroundColor: "#E2E8F0", borderRadius: 99, alignSelf: "center", marginTop: 12, marginBottom: 4 }} />
            <Calendar
              current={toDateStr(selectedDate)}
              markedDates={{ [toDateStr(selectedDate)]: { selected: true, selectedColor: "#2563EB" } }}
              onDayPress={(day) => {
                const picked = fromDateStr(day.dateString);
                setSelectedDate(picked);
                fetchHistory(picked);
                setShowCalendar(false);
              }}
              theme={{
                todayTextColor: "#2563EB", todayBackgroundColor: "#EFF6FF",
                selectedDayBackgroundColor: "#2563EB", selectedDayTextColor: "white",
                arrowColor: "#2563EB", monthTextColor: "#1E3A5F", dayTextColor: "#1E293B",
                textDisabledColor: "#CBD5E1", textDayFontWeight: "600",
                textMonthFontWeight: "800", textDayHeaderFontWeight: "700", calendarBackground: "white",
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ===== iOS Time Picker Modal ===== */}
      {showTimePicker && (
        <Modal transparent animationType="slide">
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setShowTimePicker(false)}>
            <Pressable style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }} onPress={e => e.stopPropagation()}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                <Pressable onPress={() => setShowTimePicker(false)}>
                  <Text style={{ fontSize: 16, color: "#94A3B8", fontWeight: "600" }}>ยกเลิก</Text>
                </Pressable>
                <Pressable onPress={() => { setActualTakenTime(tempPickerTime); setShowTimePicker(false); }}>
                  <Text style={{ fontSize: 16, color: "#2563EB", fontWeight: "700" }}>ยืนยัน</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempPickerTime}
                mode="time"
                is24Hour
                display="spinner"
                onChange={(_, d) => d && setTempPickerTime(d)}
                style={{ height: 180 }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ===== Modal บันทึกการกินยา (ทั้งกลุ่ม) ===== */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.bottomSheet} onPress={e => e.stopPropagation()}>
            <View style={s.handleBar} />

            {/* Header เวลากำหนด */}
            <View style={s.modalHeader}>
              <Ionicons name="alarm-outline" size={16} color="#1D4ED8" />
              <Text style={s.modalHeaderTime}>กำหนดกิน {activeGroup?.timeHHMM}</Text>
              <Text style={s.modalHeaderCount}>· {activeGroup?.medicines.length} รายการ</Text>
            </View>

            {/* รายการยาทั้งกลุ่ม */}
            <ScrollView style={s.modalMedList} showsVerticalScrollIndicator={false}>
              {activeGroup?.medicines.map((med, index) => {
                const cfg = med.status ? statusConfig[med.status as keyof typeof statusConfig] : null;
                return (
                  <View
                    key={med.scheduleId}
                    style={[
                      s.modalMedRow,
                      index < (activeGroup?.medicines.length ?? 0) - 1 && { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
                      cfg ? { backgroundColor: cfg.bg + "40" } : null,
                    ]}
                  >
                    <View style={[s.medIcon, cfg ? { backgroundColor: cfg.bg } : { backgroundColor: "#EFF6FF" }]}>
                      <Ionicons name={cfg ? (cfg.icon as any) : "medical-outline"} size={15} color={cfg ? cfg.color : "#2563EB"} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.modalMedName}>{med.medicationName}</Text>
                      <View style={s.badgeRow}>
                        {med.dosage ? (
                          <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                            <Text style={[s.pillText, { color: "#7C3AED" }]}>{med.dosage}</Text>
                          </View>
                        ) : null}
                        {med.mealRelation && med.mealRelation !== "ไม่ระบุ" ? (
                          <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                            <Text style={[s.pillText, { color: "#059669" }]}>{med.mealRelation}</Text>
                          </View>
                        ) : null}
                      </View>
                      {/* แสดงเวลาเดิมที่กินไปแล้ว */}
                      {cfg && formatTakenTime(med.takenAt) ? (
                        <View style={s.takenAtRow}>
                          <Ionicons name="checkmark-circle" size={11} color={cfg.color} />
                          <Text style={[s.takenAtText, { color: cfg.color }]}>กินเมื่อ {formatTakenTime(med.takenAt)}</Text>
                        </View>
                      ) : null}
                    </View>
                    {cfg ? (
                      <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            {/* ✅ เวลากินจริง — เลื่อนได้ */}
            <Pressable style={s.takenTimeBox} onPress={() => setShowTimePicker(true)}>
              <Ionicons name="time-outline" size={16} color="#2563EB" />
              <Text style={s.takenTimeLabel}>เวลาที่กินจริง</Text>
              <View style={s.takenTimeBtn}>
                <Text style={s.takenTimeBtnText}>
                  {String(actualTakenTime.getHours()).padStart(2,"0")}:{String(actualTakenTime.getMinutes()).padStart(2,"0")}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#2563EB" />
              </View>
            </Pressable>

            {/* ✅ ปุ่มกินครบ / ข้ามมื้อ */}
            <Text style={s.modalTitle}>บันทึกการกินยา</Text>
            <Pressable style={[s.logBtn, { backgroundColor: "#10B981" }]} onPress={() => handleLogGroup("taken")} disabled={logging}>
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={s.logBtnText}>✓ กินยาครบแล้ว</Text>
            </Pressable>
            <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]} onPress={() => handleLogGroup("missed")} disabled={logging}>
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

/* ─── Styles ─── */

const s = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: "#F0F9FF" },
  center:           { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 40 },
  header:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle:      { fontSize: fs(26), fontWeight: "800", color: "#1E3A5F" },
  headerDate:       { fontSize: fs(13), color: "#64748B", marginTop: 2 },
  headerRight:      { flexDirection: "row", gap: 8 },
  iconBtn:          { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  logoutBtn:        { backgroundColor: "#FFF5F5" },
  tabRow:           { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: "white", borderRadius: 12, padding: 4, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  tabBtn:           { flex: 1, flexDirection: "row", paddingVertical: 8, alignItems: "center", justifyContent: "center", borderRadius: 10, gap: 5 },
  tabActive:        { backgroundColor: "#2563EB" },
  tabText:          { fontSize: fs(13), fontWeight: "600", color: "#94A3B8" },
  tabTextActive:    { color: "white" },
  dateSelector:     { marginHorizontal: 16, marginBottom: 12 },
  dateSelectorBtn:  { flexDirection: "row", alignItems: "center", backgroundColor: "white", padding: 12, borderRadius: 12, gap: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  dateSelectorText: { flex: 1, fontSize: fs(14), fontWeight: "600", color: "#1E293B" },
  summaryCard:      { marginHorizontal: 16, marginBottom: 16, backgroundColor: "#2563EB", borderRadius: 18, padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  summaryLeft:      { gap: 4 },
  summaryLabel:     { color: "rgba(255,255,255,0.75)", fontSize: fs(13) },
  summaryNumRow:    { flexDirection: "row", alignItems: "flex-end" },
  summaryNum:       { color: "white", fontSize: fs(36), fontWeight: "800", lineHeight: fs(42) },
  summaryTotal:     { color: "rgba(255,255,255,0.6)", fontSize: fs(22), fontWeight: "600", marginBottom: 2 },
  summaryRight:     { alignItems: "flex-end", gap: 6 },
  progressBg:       { width: 110, height: 8, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 99, overflow: "hidden" },
  progressFill:     { height: "100%", backgroundColor: "white", borderRadius: 99 },
  summaryPct:       { color: "white", fontSize: fs(18), fontWeight: "700" },

  // ✅ Group card
  groupCard:        { backgroundColor: "white", borderRadius: 16, marginBottom: 14, borderWidth: 1.5, overflow: "hidden", shadowColor: "#1D4ED8", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  groupHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  groupTime:        { fontSize: fs(20), fontWeight: "800", color: "white" },
  groupCount:       { fontSize: fs(12), color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  groupStatusBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  groupStatusText:  { fontSize: fs(12), fontWeight: "700", color: "white" },

  medRow:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12 },
  medRowBorder:     { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  medIcon:          { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  medName:          { fontSize: fs(14), fontWeight: "700", color: "#1E293B", marginBottom: 3 },
  badgeRow:         { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  pill:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText:         { fontSize: fs(12), fontWeight: "600" },
  takenAtRow:       { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  takenAtText:      { fontSize: fs(11), fontWeight: "700" },
  notesRow:         { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, backgroundColor: "#FFF7ED", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, alignSelf: "flex-start" },
  notesText:        { color: "#F97316", fontWeight: "600", flex: 1 },
  statusBadge:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText:       { fontSize: fs(12), fontWeight: "700" },

  emptyWrap:        { alignItems: "center", paddingVertical: 70, gap: 10 },
  emptyText:        { fontSize: fs(16), color: "#64748B", fontWeight: "700" },
  emptySubText:     { fontSize: fs(14), color: "#94A3B8" },

  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  bottomSheet:      { backgroundColor: "white", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 40 },
  handleBar:        { width: 40, height: 4, backgroundColor: "#E2E8F0", borderRadius: 99, alignSelf: "center", marginBottom: 16 },

  // modal header
  modalHeader:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  modalHeaderTime:  { fontSize: fs(16), fontWeight: "800", color: "#1D4ED8" },
  modalHeaderCount: { fontSize: fs(13), color: "#64748B", fontWeight: "600" },

  // modal med list
  modalMedList:     { maxHeight: 200, marginBottom: 12 },
  modalMedRow:      { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  modalMedName:     { fontSize: fs(14), fontWeight: "700", color: "#1E293B", marginBottom: 3 },

  // taken time box
  takenTimeBox:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F8FAFF", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#DBEAFE" },
  takenTimeLabel:   { flex: 1, fontSize: fs(14), fontWeight: "600", color: "#1E3A5F" },
  takenTimeBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: "#BFDBFE" },
  takenTimeBtnText: { fontSize: fs(18), fontWeight: "800", color: "#1D4ED8" },

  modalTitle:       { fontSize: fs(14), fontWeight: "700", color: "#64748B", textAlign: "center", marginBottom: 12 },
  logBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 13, marginBottom: 10 },
  logBtnText:       { color: "white", fontWeight: "700", fontSize: fs(15) },
  cancelBtn:        { alignItems: "center", paddingVertical: 8 },
  cancelText:       { color: "#94A3B8", fontSize: fs(14), fontWeight: "600" },
});