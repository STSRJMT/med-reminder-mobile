import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Modal, Alert, PixelRatio, AppState, Platform,
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

type TodaySchedule = {
  scheduleId: number;
  timeHHMM: string;
  medicationName: string;
  dosage: string | null;
  notes: string | null;
  mealRelation: string | null;
  daysOfWeek: string | null;
  todayStatus: "taken" | "late" | "missed" | null;
  _status?: "taken" | "late" | "missed" | null;
};

type TabType = "today" | "history";

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

const DAY_SHORT: Record<string, string> = {
  "0": "อา", "1": "จ", "2": "อ", "3": "พ", "4": "พฤ", "5": "ศ", "6": "ส",
};

const formatDays = (days: string | null) => {
  if (!days) return "ทุกวัน";
  const arr = days.split(",").map(d => DAY_SHORT[d.trim()] ?? d.trim());
  return arr.length === 7 ? "ทุกวัน" : arr.join(" ");
};

const getMealIcon = (meal: string | null): any => {
  if (!meal) return null;
  if (meal.includes("ก่อน")) return "restaurant-outline";
  if (meal.includes("หลัง")) return "cafe-outline";
  if (meal.includes("พร้อม")) return "fast-food-outline";
  return "information-circle-outline";
};

export default function ElderlyToday() {
  const logout                          = useLogout();
  const notifListener                   = useRef<Notifications.EventSubscription | null>(null);
  const responseListener                = useRef<Notifications.EventSubscription | null>(null);
  const appState                        = useRef(AppState.currentState);

  const [tab, setTab]                   = useState<TabType>("today");
  const [list, setList]                 = useState<TodaySchedule[]>([]);
  const [historyList, setHistoryList]   = useState<TodaySchedule[]>([]);
  const [loading, setLoading]           = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeItem, setActiveItem]     = useState<TodaySchedule | null>(null);
  const [logging, setLogging]           = useState(false);

  // Date picker
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  });
  const [showCalendar, setShowCalendar] = useState(false);

  const fetchToday = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const token = await AsyncStorage.getItem("token");

      // ✅ auto-mark missed ก่อน fetch เสมอ (เลย 60 นาทีแล้วไม่กด = ข้ามมื้อ)
      // ใช้ .catch(() => {}) เพื่อไม่ให้ block การโหลดหน้าถ้า request fail
      await axios.post(
        `${API_BASE_URL}/elderly/auto-missed`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      ).catch(() => {});

      const dateStr = toDateStr(new Date());
      const res     = await axios.get(
        `${API_BASE_URL}/elderly/today?date=${dateStr}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items: TodaySchedule[] = (res.data.items || []).map((item: any) => ({
        ...item,
        _status: item.todayStatus ?? null,
      }));
      setList(items);
      setLoading(false);

      scheduleAllNotifications(
  items
    .filter(i => !i._status) 
    .map(i => ({
      scheduleId:     i.scheduleId,
      timeHHMM:       i.timeHHMM,
      medicationName: i.medicationName,
      dosage:         i.dosage,
      daysOfWeek:     i.daysOfWeek,
    }))
);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
      setLoading(false);
    }
  };

  const fetchHistory = async (date: Date) => {
    try {
      setHistoryLoading(true);
      const token   = await AsyncStorage.getItem("token");
      const dateStr = toDateStr(date);
      const res     = await axios.get(
        `${API_BASE_URL}/elderly/today?date=${dateStr}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const items: TodaySchedule[] = (res.data.items || []).map((item: any) => ({
        ...item,
        _status: item.todayStatus ?? null,
      }));
      setHistoryList(items);
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setHistoryLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchToday();
    }, [])
  );

  useEffect(() => {
    if (tab === "history") {
      fetchHistory(selectedDate);
    }
  }, [tab]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        fetchToday();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener(() => {});

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as any;
        if (data?.scheduleId) {
          setList((prev) => {
            const found = prev.find(i => i.scheduleId === data.scheduleId);
            if (found) {
              setActiveItem(found);
              setModalVisible(true);
            }
            return prev;
          });
        }
      }
    );

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

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
        { scheduleId: activeItem.scheduleId, status, takenAtISO: new Date().toISOString() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchToday(false);
    } catch (e) {
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

  const historyTaken = historyList.filter(t => t._status === "taken" || t._status === "late").length;
  const historyTotal = historyList.length;
  const historyPct   = historyTotal > 0 ? Math.round((historyTaken / historyTotal) * 100) : 0;

  const today = new Date();

  const sortedList = [...list].sort((a, b) => {
    const nowMs = new Date().getHours() * 60 + new Date().getMinutes();
    const getMs = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const priority = (item: TodaySchedule) => {
      const diff = nowMs - getMs(item.timeHHMM);
      if (!item._status && diff >= 30)  return 0;
      if (!item._status)                return 1;
      if (item._status === "late")      return 2;
      if (item._status === "taken")     return 3;
      if (item._status === "missed")    return 4;
      return 5;
    };
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return a.timeHHMM.localeCompare(b.timeHHMM);
  });

  const renderCard = (item: TodaySchedule, isHistory = false) => {
    const cfg = item._status ? statusConfig[item._status as keyof typeof statusConfig] : null;
    const now = new Date();
    const [hh, mm]    = item.timeHHMM.split(":").map(Number);
    const scheduledMs = hh * 60 + mm;
    const nowMs       = now.getHours() * 60 + now.getMinutes();
    const isOverdue   = !isHistory && !item._status && (nowMs - scheduledMs) >= 30;

    return (
      <Pressable
        key={item.scheduleId}
        style={[
          s.card,
          cfg       ? { borderLeftColor: cfg.color } : null,
          isOverdue ? { borderLeftColor: "#EF4444" } : null,
        ]}
        onPress={() => {
          if (!isHistory) {
            setActiveItem(item);
            setModalVisible(true);
          }
        }}
      >
        <View style={[s.iconCircle,
          cfg       ? { backgroundColor: cfg.bg }    : null,
          isOverdue ? { backgroundColor: "#FFF5F5" } : null,
        ]}>
          <Ionicons
            name={cfg ? (cfg.icon as any) : isOverdue ? "alert-circle" : "medical"}
            size={20}
            color={cfg ? cfg.color : isOverdue ? "#EF4444" : "#2563EB"}
          />
        </View>
        <View style={s.cardContent}>
          <Text style={s.medName}>{item.medicationName}</Text>
          <View style={s.badgeRow}>
            {item.dosage && (
              <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                <Text style={[s.pillText, { color: "#7C3AED" }]}>{item.dosage}</Text>
              </View>
            )}
            {item.mealRelation && item.mealRelation !== "ไม่ระบุ" && (
              <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                <Ionicons name={getMealIcon(item.mealRelation) ?? "restaurant-outline"} size={11} color="#059669" />
                <Text style={[s.pillText, { color: "#059669" }]}>{item.mealRelation}</Text>
              </View>
            )}
          </View>
          <View style={s.infoRow}>
            <Ionicons name="calendar-outline" size={12} color="#64748B" />
            <Text style={s.infoText}>{formatDays(item.daysOfWeek)}</Text>
          </View>
          {item.notes ? (
            <View style={s.notesRow}>
              <Ionicons name="alert-circle-outline" size={12} color="#F97316" />
              <Text style={s.notesText} numberOfLines={2}>{item.notes}</Text>
            </View>
          ) : null}
          <View style={s.timeRow}>
            <View style={[s.timeChip, isOverdue && { backgroundColor: "#EF4444" }]}>
              <Ionicons name="time" size={16} color="white" />
              <Text style={s.timeChipText}>{item.timeHHMM}</Text>
            </View>
            {isOverdue && (
              <View style={s.overdueChip}>
                <Ionicons name="warning" size={12} color="#EF4444" />
                <Text style={s.overdueText}>เลยเวลาแล้ว</Text>
              </View>
            )}
          </View>
        </View>
        {cfg ? (
          <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        ) : (
          !isHistory && <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
        )}
      </Pressable>
    );
  };

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
                sortedList.map(item => renderCard(item, false))
              )}
            </View>
          </>
        )}

        {/* ===== TAB: HISTORY ===== */}
        {tab === "history" && (
          <>
            {/* Date Selector Button */}
            <View style={s.dateSelector}>
              <Pressable style={s.dateSelectorBtn} onPress={() => setShowCalendar(true)}>
                <Ionicons name="calendar-outline" size={18} color="#2563EB" />
                <Text style={s.dateSelectorText}>{formatDateTH(selectedDate)}</Text>
                <Ionicons name="chevron-down" size={16} color="#64748B" />
              </Pressable>
            </View>

            {/* Summary */}
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
                <View style={s.center}>
                  <ActivityIndicator size="large" color="#7C3AED" />
                </View>
              ) : historyList.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Ionicons name="calendar-outline" size={56} color="#BFDBFE" />
                  <Text style={s.emptyText}>ไม่มีข้อมูลวันนี้</Text>
                </View>
              ) : (
                historyList
                  .slice()
                  .sort((a, b) => a.timeHHMM.localeCompare(b.timeHHMM))
                  .map(item => renderCard(item, true))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ===== Calendar Modal ===== */}
      <Modal transparent animationType="fade" visible={showCalendar}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={() => setShowCalendar(false)}
        >
          <Pressable
            style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 }}
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
                fetchHistory(picked);
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

      {/* Modal บันทึกการกินยา */}
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
            {(() => {
              const now = new Date();
              const [hh, mm]      = (activeItem?.timeHHMM ?? "0:0").split(":").map(Number);
              const isItemOverdue = (now.getHours() * 60 + now.getMinutes()) - (hh * 60 + mm) >= 30;
              return (
                <>
                  {isItemOverdue ? (
                    <>
                      <Pressable style={[s.logBtn, { backgroundColor: "#F59E0B" }]} onPress={() => handleLog("late")} disabled={logging}>
                        <Ionicons name="time" size={20} color="white" />
                        <Text style={s.logBtnText}>กินล่าช้า</Text>
                      </Pressable>
                      <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]} onPress={() => handleLog("missed")} disabled={logging}>
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                        <Text style={[s.logBtnText, { color: "#EF4444" }]}>ข้ามมื้อนี้</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable style={[s.logBtn, { backgroundColor: "#10B981" }]} onPress={() => handleLog("taken")} disabled={logging}>
                        <Ionicons name="checkmark-circle" size={20} color="white" />
                        <Text style={s.logBtnText}>กินแล้ว</Text>
                      </Pressable>
                      <Pressable style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]} onPress={() => handleLog("missed")} disabled={logging}>
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                        <Text style={[s.logBtnText, { color: "#EF4444" }]}>ข้ามมื้อนี้</Text>
                      </Pressable>
                    </>
                  )}
                </>
              );
            })()}
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
  card:             { flexDirection: "row", alignItems: "flex-start", backgroundColor: "white", borderRadius: 16, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: "#E2E8F0", shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  iconCircle:       { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", marginRight: 12 },
  cardContent:      { flex: 1 },
  medName:          { fontSize: fs(15), fontWeight: "700", color: "#1E293B", marginBottom: 5 },
  badgeRow:         { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pill:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText:         { fontSize: fs(12), fontWeight: "600" },
  notesRow:         { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start" },
  notesText:        { fontSize: fs(12), color: "#F97316", fontWeight: "600", flex: 1, lineHeight: fs(18) },
  infoRow:          { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  infoText:         { fontSize: fs(12), color: "#64748B", fontWeight: "500" },
  timeChip:         { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#2563EB", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, alignSelf: "flex-start" },
  timeChipText:     { fontSize: fs(18), fontWeight: "800", color: "white", letterSpacing: 0.5 },
  timeRow:          { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  overdueChip:      { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFF5F5", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: "#FEE2E2", marginTop: 8 },
  overdueText:      { fontSize: fs(12), fontWeight: "700", color: "#EF4444" },
  statusBadge:      { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 2 },
  statusText:       { fontSize: fs(12), fontWeight: "700" },
  emptyWrap:        { alignItems: "center", paddingVertical: 70, gap: 10 },
  emptyText:        { fontSize: fs(16), color: "#64748B", fontWeight: "700" },
  emptySubText:     { fontSize: fs(14), color: "#94A3B8" },
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  bottomSheet:      { backgroundColor: "white", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 44 },
  handleBar:        { width: 40, height: 4, backgroundColor: "#E2E8F0", borderRadius: 99, alignSelf: "center", marginBottom: 20 },
  modalIconWrap:    { width: 66, height: 66, borderRadius: 20, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 14 },
  modalDrugName:    { fontSize: fs(20), fontWeight: "800", color: "#1E3A5F", textAlign: "center" },
  modalDosage:      { fontSize: fs(14), color: "#64748B", textAlign: "center", marginTop: 4 },
  modalInfoRow:     { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 10, marginBottom: 12 },
  modalBadge:       { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F8FAFC", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  modalBadgeText:   { fontSize: fs(12), fontWeight: "600" },
  modalNotesBox:    { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#FFF7ED", borderRadius: 10, padding: 10, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: "#F97316" },
  modalNotesText:   { fontSize: fs(13), color: "#F97316", fontWeight: "600", flex: 1, lineHeight: fs(20) },
  modalTitle:       { fontSize: fs(15), fontWeight: "700", color: "#64748B", textAlign: "center", marginBottom: 14, marginTop: 4 },
  logBtn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 15, borderRadius: 13, marginBottom: 10 },
  logBtnText:       { color: "white", fontWeight: "700", fontSize: fs(15) },
  cancelBtn:        { alignItems: "center", paddingVertical: 10 },
  cancelText:       { color: "#94A3B8", fontSize: fs(14), fontWeight: "600" },
});
