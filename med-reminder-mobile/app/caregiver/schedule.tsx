import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, Alert, Modal, ScrollView, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar } from "react-native-calendars";
import DateTimePicker from "@react-native-community/datetimepicker";

/* ─── TimeInput component — พิมพ์เวลาเองแบบ HH:MM ─── */

const TimeInput = ({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [text, setText] = useState(
    `${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
  const [hasError, setHasError] = useState(false);

  const handleChange = (raw: string) => {
    // auto-insert colon
    let v = raw.replace(/[^0-9]/g, "");
    if (v.length > 2) v = v.slice(0, 2) + ":" + v.slice(2, 4);
    setText(v);

    const match = v.match(/^(\d{2}):(\d{2})$/);
    if (match) {
      const hh = parseInt(match[1]);
      const mm = parseInt(match[2]);
      if (hh <= 23 && mm <= 59) {
        setHasError(false);
        const d = new Date(value);
        d.setHours(hh, mm, 0, 0);
        onChange(d);
      } else {
        setHasError(true);
      }
    } else {
      setHasError(v.length === 5); // แสดง error เฉพาะเมื่อพิมพ์ครบแล้วแต่ผิด
    }
  };

  return (
    <TextInput
      value={text}
      onChangeText={handleChange}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="08:00"
      placeholderTextColor="#CBD5E1"
      style={[
        {
          fontSize: 20,
          fontWeight: "700",
          color: hasError ? "#EF4444" : "#1D4ED8",
          backgroundColor: hasError ? "#FFF5F5" : "#EFF6FF",
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderWidth: 1.5,
          borderColor: hasError ? "#FCA5A5" : "#BFDBFE",
          minWidth: 90,
          textAlign: "center",
        },
      ]}
    />
  );
};

/* ─── Types ─── */

type Elderly = { id: number; name: string; age: number | null };

type Schedule = {
  id: number;
  time_hhmm: string;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
  days_of_week: string | null;
};

/**
 * ✅ GroupedByTime — 1 group = 1 เวลา, มีหลายยา
 */
type MedInGroup = {
  scheduleId: number;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null; // ✅ meal ของแต่ละยา
};

type GroupedByTime = {
  time_hhmm: string;
  days_of_week: string | null;
  medicines: MedInGroup[];
};

type TodaySchedule = Schedule & {
  status: "taken" | "late" | "missed" | null;
  taken_at: string | null; // ✅ เวลาจริงที่กิน จาก intake_logs
};

// ✅ Group ยาในตารางวันนี้ตามเวลา
type TodayMedItem = {
  scheduleId: number;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
  meal_relation: string | null;
  status: "taken" | "late" | "missed" | null;
  taken_at: string | null; // ✅ เวลาที่กินจริง
};

type TodayGroupedByTime = {
  time_hhmm: string;
  medicines: TodayMedItem[];
};

type TabType = "schedule" | "today";
type TodaySubTab = "today" | "pick";

/* ─── Helpers ─── */

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

const formatDays = (days_of_week: string | null) => {
  if (!days_of_week) return "ทุกวัน";
  const dayMap: Record<string, string> = {
    "0": "อา", "1": "จ", "2": "อ", "3": "พ", "4": "พฤ", "5": "ศ", "6": "ส",
  };
  const arr = days_of_week.split(",").map(d => dayMap[d.trim()] ?? d.trim());
  if (arr.length === 7) return "ทุกวัน";
  return arr.join(", ");
};

/**
 * ✅ Group TodaySchedule ตามเวลา สำหรับหน้าตารางวันนี้
 */
function groupTodayByTime(items: TodaySchedule[]): TodayGroupedByTime[] {
  const map = new Map<string, TodayGroupedByTime>();
  for (const s of items) {
    if (!map.has(s.time_hhmm)) {
      map.set(s.time_hhmm, { time_hhmm: s.time_hhmm, medicines: [] });
    }
    map.get(s.time_hhmm)!.medicines.push({
      scheduleId: s.id,
      medication_name: s.medication_name,
      dosage: s.dosage,
      notes: s.notes,
      meal_relation: s.meal_relation,
      status: s.status,
      taken_at: s.taken_at ?? null,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.time_hhmm.localeCompare(b.time_hhmm));
}
 
function groupByTime(schedules: Schedule[]): GroupedByTime[] {
  const map = new Map<string, GroupedByTime>();

  for (const s of schedules) {
    // key = เวลา + วัน (ไม่สนใจ meal_relation แล้ว)
    const key = `${s.time_hhmm}__${s.days_of_week ?? ""}`;
    if (!map.has(key)) {
      map.set(key, {
        time_hhmm: s.time_hhmm,
        days_of_week: s.days_of_week,
        medicines: [],
      });
    }
    map.get(key)!.medicines.push({
      scheduleId: s.id,
      medication_name: s.medication_name,
      dosage: s.dosage,
      notes: s.notes,
      meal_relation: s.meal_relation, // ✅ เก็บ meal ของแต่ละยา
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.time_hhmm.localeCompare(b.time_hhmm)
  );
}

const getMealIcon = (meal: string | null): any => {
  if (!meal) return "information-circle-outline";
  if (meal.includes("ก่อน")) return "restaurant-outline";
  if (meal.includes("หลัง")) return "cafe-outline";
  if (meal.includes("พร้อม")) return "fast-food-outline";
  return "information-circle-outline";
};

const getTimeMs = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// ✅ แปลง taken_at (ISO string หรือ MySQL datetime) → "HH:MM"
const formatTakenTime = (takenAt: string | null): string | null => {
  if (!takenAt) return null;
  try {
    const d = new Date(takenAt);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return null;
  }
};

/* ─── Main Component ─── */

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

  const [elderlyList, setElderlyList]             = useState<Elderly[]>([]);
  const [selectedElderly, setSelectedElderly]     = useState<Elderly | null>(null);
  const [tab, setTab]                             = useState<TabType>("schedule");
  const [todaySubTab, setTodaySubTab]             = useState<TodaySubTab>("today");
  const [schedules, setSchedules]                 = useState<Schedule[]>([]);
  const [todayList, setTodayList]                 = useState<TodaySchedule[]>([]);
  const [historyList, setHistoryList]             = useState<TodaySchedule[]>([]);
  const [historyLoading, setHistoryLoading]       = useState(false);
  const [selectedDate, setSelectedDate]           = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  });
  const [showCalendar, setShowCalendar]           = useState(false);
  const [loading, setLoading]                     = useState(true);
  const [showDropdownModal, setShowDropdownModal] = useState(false);
  const [modalVisible, setModalVisible]           = useState(false);
  const [activeItem, setActiveItem]               = useState<TodaySchedule | null>(null);
  // ✅ กลุ่มยาที่เปิด modal (แสดงยาทั้งหมดในกลุ่ม)
  const [activeGroup, setActiveGroup]             = useState<TodayGroupedByTime | null>(null);
  const [logging, setLogging]                     = useState(false);
  // ✅ เวลาจริงที่กิน — ใช้ DateTimePicker เลื่อน
  const [actualTakenTime, setActualTakenTime]     = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker]       = useState(false);
  const [tempPickerTime, setTempPickerTime]       = useState<Date>(new Date());

  /* ─── Fetch ─── */

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
        if (todaySubTab === "pick") fetchHistory(targetId, selectedDate);
      }
    } catch {
      Alert.alert("โหลดข้อมูลไม่ได้");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [paramElderlyId]));

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

  /* ─── Delete handlers ─── */

  /**
   * ✅ ลบทั้งกลุ่ม (ลบทุกยาในเวลานั้น)
   */
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
                await axios.delete(`${API_BASE_URL}/caregiver/schedules/${med.scheduleId}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
              }
              if (selectedElderly?.id) {
                fetchSchedules(selectedElderly.id);
                fetchToday(selectedElderly.id);
              }
            } catch {
              Alert.alert("ลบไม่สำเร็จ");
            }
          },
        },
      ]
    );
  };

  /**
   * ✅ ลบทีละยา (ยาตัวเดียวในกลุ่ม)
   */
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
              await axios.delete(`${API_BASE_URL}/caregiver/schedules/${med.scheduleId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (selectedElderly?.id) {
                fetchSchedules(selectedElderly.id);
                fetchToday(selectedElderly.id);
              }
            } catch {
              Alert.alert("ลบไม่สำเร็จ");
            }
          },
        },
      ]
    );
  };

  /* ─── Today log ─── */

  const openGroupModal = (group: TodayGroupedByTime) => {
    setActiveGroup(group);
    // default เวลา = เวลากำหนดของกลุ่ม
    const [hh, mm] = group.time_hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    setActualTakenTime(d);
    setTempPickerTime(d);
    setShowTimePicker(false);
    setModalVisible(true);
  };

  // เปิด modal สำหรับยาตัวเดียว (กดจาก row ยา)
  const openLogModal = (item: TodaySchedule, group: TodayGroupedByTime) => {
    setActiveItem(item);
    setActiveGroup(group);
    const [hh, mm] = group.time_hhmm.split(":").map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    setActualTakenTime(d);
    setTempPickerTime(d);
    setShowTimePicker(false);
    setModalVisible(true);
  };

  // ✅ auto detect late: ถ้าเวลาจริง > เวลากำหนด → late
  const LATE_THRESHOLD_MINUTES = 30; // ✅ กินเกิน 30 นาที = ล่าช้า

  const resolveStatus = (
    requestedStatus: "taken" | "missed",
    scheduledTime: string,
    takenTime: Date
  ): "taken" | "late" | "missed" => {
    if (requestedStatus === "missed") return "missed";
    const [hh, mm] = scheduledTime.split(":").map(Number);
    const scheduledMs = hh * 60 + mm;
    const takenMs = takenTime.getHours() * 60 + takenTime.getMinutes();
    return takenMs - scheduledMs > LATE_THRESHOLD_MINUTES ? "late" : "taken";
  };

  // log ยาทีละตัว
  const handleLogSingle = async (
    scheduleId: number,
    scheduledTime: string,
    requestedStatus: "taken" | "missed"
  ) => {
    if (!selectedElderly) return;
    const status = resolveStatus(requestedStatus, scheduledTime, actualTakenTime);
    const takenAt = requestedStatus === "missed" ? new Date() : new Date(actualTakenTime);

    try {
      const token = await AsyncStorage.getItem("token");
      await axios.post(`${API_BASE_URL}/caregiver/intake-logs`, {
        scheduleId,
        elderlyId: selectedElderly.id,
        status,
        takenAtISO: takenAt.toISOString(),
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("log failed");
    }
  };

  // log ยาทั้งกลุ่มพร้อมกัน
  const handleLogGroup = async (requestedStatus: "taken" | "missed") => {
    if (!activeGroup || !selectedElderly) return;
    setLogging(true);
    setModalVisible(false);

    try {
      await Promise.all(
        // ✅ log ทุกยาในกลุ่ม ไม่ว่าจะมี status เดิมหรือไม่ (รองรับการแก้ไขสถานะ)
        activeGroup.medicines.map(m =>
          handleLogSingle(m.scheduleId, activeGroup.time_hhmm, requestedStatus)
        )
      );
      await fetchToday(selectedElderly.id);
      if (todaySubTab === "pick") await fetchHistory(selectedElderly.id, selectedDate);
    } catch {
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLogging(false);
    }
  };

  // log ยาตัวเดียว (กดจาก row ยาใน modal)
  const handleLog = async (requestedStatus: "taken" | "missed") => {
    if (!activeItem || !activeGroup || !selectedElderly) return;
    setLogging(true);
    setModalVisible(false);

    try {
      await handleLogSingle(activeItem.id, activeGroup.time_hhmm, requestedStatus);
      await fetchToday(selectedElderly.id);
      if (todaySubTab === "pick") await fetchHistory(selectedElderly.id, selectedDate);
    } catch {
      Alert.alert("บันทึกไม่สำเร็จ");
    } finally {
      setLogging(false);
    }
  };

  // ลบยาจาก today list (กด × ใน modal)
  const handleDeleteFromModal = async (scheduleId: number) => {
    Alert.alert("ลบยา", "ต้องการลบยานี้ออกจากตารางทั้งหมด?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ", style: "destructive",
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/caregiver/schedules/${scheduleId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setModalVisible(false);
            if (selectedElderly?.id) {
              fetchSchedules(selectedElderly.id);
              fetchToday(selectedElderly.id);
            }
          } catch { Alert.alert("ลบไม่สำเร็จ"); }
        },
      },
    ]);
  };

  /* ─── Sort ─── */

  const sortTodayList = (items: TodaySchedule[]): TodaySchedule[] => {
    const nowMs = new Date().getHours() * 60 + new Date().getMinutes();
    return [...items].sort((a, b) => {
      const priority = (item: TodaySchedule) => {
        const ms = getTimeMs(item.time_hhmm);
        const diff = nowMs - ms;
        if (!item.status && diff >= 30) return 0;
        if (!item.status)              return 1;
        if (item.status === "late")    return 2;
        if (item.status === "taken")   return 3;
        if (item.status === "missed")  return 4;
        return 5;
      };
      const pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      return getTimeMs(a.time_hhmm) - getTimeMs(b.time_hhmm);
    });
  };

  const sortHistoryList = (items: TodaySchedule[], isToday: boolean): TodaySchedule[] => {
    if (isToday) return sortTodayList(items);
    return [...items].sort((a, b) => {
      const priority = (item: TodaySchedule) => {
        if (item.status === "missed") return 0;
        if (item.status === "late")   return 1;
        if (item.status === "taken")  return 2;
        return 3;
      };
      const pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      return getTimeMs(a.time_hhmm) - getTimeMs(b.time_hhmm);
    });
  };

  const isDateToday = (date: Date) => {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  };

  /* ─── Today card renderer ─── */

  const statusConfig = {
    taken:  { label: "กินแล้ว",    color: "#10B981", bg: "#ECFDF5", icon: "checkmark-circle" },
    late:   { label: "กินล่าช้า",  color: "#F59E0B", bg: "#FFFBEB", icon: "time" },
    missed: { label: "ข้ามมื้อนี้", color: "#EF4444", bg: "#FFF5F5", icon: "close-circle" },
  } as const;

  const renderMedCard = (item: TodaySchedule, onPress?: () => void) => {
    const cfg = item.status ? statusConfig[item.status as keyof typeof statusConfig] : null;
    const now = new Date();
    const [hh, mm] = item.time_hhmm.split(":").map(Number);
    const isViewingToday = todaySubTab === "today" || isDateToday(selectedDate);
    const isOverdue = !item.status && isViewingToday &&
      (now.getHours() * 60 + now.getMinutes()) - (hh * 60 + mm) >= 30;

    return (
      <Pressable
        key={`${item.id}-${item.status ?? "null"}`}
        style={[
          s.todayCard,
          cfg       ? { borderLeftColor: cfg.color }  : null,
          isOverdue ? { borderLeftColor: "#EF4444" }  : null,
        ]}
        onPress={onPress}
      >
        <View style={s.cardLeft}>
          <View style={[
            s.iconCircle,
            cfg       ? { backgroundColor: cfg.bg }    : null,
            isOverdue ? { backgroundColor: "#FFF5F5" } : null,
          ]}>
            <Ionicons
              name={cfg ? (cfg.icon as any) : isOverdue ? "alert-circle" : "medical"}
              size={18}
              color={cfg ? cfg.color : isOverdue ? "#EF4444" : "#2563EB"}
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
        ) : isOverdue ? (
          <View style={[s.statusBadge, { backgroundColor: "#FFF5F5" }]}>
            <Text style={[s.statusText, { color: "#EF4444" }]}>เลยเวลาแล้ว</Text>
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

  /* ─── ✅ Today group card (grouped by time) ─── */

  const renderTodayGroup = (group: TodayGroupedByTime, canLog: boolean) => {
    const now = new Date();
    const nowMs = now.getHours() * 60 + now.getMinutes();
    const groupMs = getTimeMs(group.time_hhmm);
    const isOverdue = canLog && nowMs - groupMs >= 30;

    const allTaken = group.medicines.every(m => m.status === "taken" || m.status === "late");
    const anyMissed = group.medicines.some(m => m.status === "missed");
    const someDone = group.medicines.some(m => m.status !== null);

    const headerBg = allTaken ? "#10B981"
      : anyMissed ? "#EF4444"
      : isOverdue ? "#EF4444"
      : "#2563EB";

    return (
      <View key={group.time_hhmm} style={[s.todayGroupCard, { borderColor: headerBg + "40" }]}>
        {/* ✅ กด header → เปิด modal ทั้งกลุ่ม */}
        <Pressable
          style={[s.todayGroupHeader, { backgroundColor: headerBg }]}
          onPress={canLog ? () => openGroupModal(group) : undefined}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="alarm-outline" size={14} color="white" />
            <Text style={s.todayGroupTime}>{group.time_hhmm}</Text>
            <Text style={s.todayGroupCount}>· {group.medicines.length} รายการ</Text>
          </View>
          <View style={s.todayGroupStatusBadge}>
            <Text style={s.todayGroupStatusText}>
              {allTaken ? "กินครบแล้ว ✓"
                : anyMissed ? "ข้ามมื้อนี้"
                : isOverdue ? "เลยเวลาแล้ว"
                : someDone ? "กินบางส่วน"
                : canLog ? "กด เพื่อบันทึก ›" : "รอบันทึก"}
            </Text>
          </View>
        </Pressable>

        {/* รายการยาแต่ละตัว — ไม่ต้องกดแล้ว แค่แสดงสถานะ */}
        {group.medicines.map((med, index) => {
          const cfg = med.status ? statusConfig[med.status as keyof typeof statusConfig] : null;
          return (
            <View
              key={med.scheduleId}
              style={[
                s.todayMedRow,
                index < group.medicines.length - 1 && s.medRowBorder,
                cfg ? { backgroundColor: cfg.bg + "50" } : null,
              ]}
            >
              <View style={s.todayMedLeft}>
                <View style={[s.todayMedIcon, cfg ? { backgroundColor: cfg.bg } : { backgroundColor: "#F1F5F9" }]}>
                  <Ionicons
                    name={cfg ? (cfg.icon as any) : "medical-outline"}
                    size={16}
                    color={cfg ? cfg.color : "#64748B"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.todayMedName}>{med.medication_name}</Text>
                  <View style={s.medBadgeRow}>
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
                  {/* ✅ แสดงเวลาที่กินจริง */}
                  {med.status && med.status !== "missed" && formatTakenTime(med.taken_at) ? (
                    <View style={s.takenAtRow}>
                      <Ionicons name="checkmark-circle" size={11} color={med.status === "late" ? "#F59E0B" : "#10B981"} />
                      <Text style={[s.takenAtText, { color: med.status === "late" ? "#F59E0B" : "#10B981" }]}>
                        กินเมื่อ {formatTakenTime(med.taken_at)}
                      </Text>
                    </View>
                  ) : null}
                  {med.notes ? (
                    <View style={[s.notesRow, { marginTop: 4 }]}>
                      <Ionicons name="alert-circle-outline" size={11} color="#F97316" />
                      <Text style={[s.notesText, { fontSize: 11 }]} numberOfLines={1}>{med.notes}</Text>
                    </View>
                  ) : null}
                </View>
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

  const renderScheduleGroup = (group: GroupedByTime) => (
    <View key={`${group.time_hhmm}-${group.days_of_week}`} style={s.scheduleGroupCard}>
      {/* ── Header: เวลา + วัน + ปุ่ม ── */}
      <View style={s.groupHeader}>
        <View style={s.groupHeaderLeft}>
          <View style={s.timeBadgeLarge}>
            <Ionicons name="alarm-outline" size={14} color="white" />
            <Text style={s.timeBadgeLargeText}>{group.time_hhmm}</Text>
          </View>
          {/* แสดงแค่วัน — meal แสดงต่อยาแทน */}
          <View style={s.groupMeta}>
            <View style={s.metaChip}>
              <Ionicons name="calendar-outline" size={11} color="white" />
              <Text style={s.metaChipText}>{formatDays(group.days_of_week)}</Text>
            </View>
          </View>
        </View>

        <View style={s.groupActions}>
          <Pressable
            style={s.actionBtn}
            onPress={() => router.push({
              pathname: "/caregiver/(stack)/add-schedule",
              params: {
                editMode: "true",
                scheduleId: group.medicines[0].scheduleId,
                scheduleIds: group.medicines.map(m => m.scheduleId).join(","),
                elderlyId: selectedElderly?.id,
                elderlyName: selectedElderly?.name,
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

      {/* ── Medicine count ── */}
      <View style={s.medCountRow}>
        <Text style={s.medCountText}>{group.medicines.length} รายการยา</Text>
      </View>

      {/* ── รายการยาแต่ละตัว + meal ของแต่ละยา ── */}
      {group.medicines.map((med, index) => (
        <View
          key={med.scheduleId}
          style={[s.medRow, index < group.medicines.length - 1 && s.medRowBorder]}
        >
          <View style={s.medRowLeft}>
            <View style={s.medIndex}>
              <Text style={s.medIndexText}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.medRowName}>{med.medication_name}</Text>
              <View style={s.medBadgeRow}>
                {med.dosage ? (
                  <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                    <Text style={[s.pillText, { color: "#7C3AED" }]}>{med.dosage}</Text>
                  </View>
                ) : null}
                {/* ✅ meal ของยาแต่ละตัว */}
                {med.meal_relation && med.meal_relation !== "ไม่ระบุ" ? (
                  <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                    <Ionicons name={getMealIcon(med.meal_relation)} size={10} color="#059669" />
                    <Text style={[s.pillText, { color: "#059669" }]}>{med.meal_relation}</Text>
                  </View>
                ) : null}
              </View>
              {med.notes ? (
                <View style={[s.notesRow, { marginTop: 4 }]}>
                  <Ionicons name="alert-circle-outline" size={11} color="#F97316" />
                  <Text style={[s.notesText, { fontSize: 11 }]} numberOfLines={2}>{med.notes}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {group.medicines.length > 1 && (
            <Pressable style={s.removeMedBtn} onPress={() => handleDeleteSingleMed(med, group)}>
              <Ionicons name="close-circle-outline" size={18} color="#94A3B8" />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );

  /* ─── Header ─── */

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

      <View style={s.selectorRow}>
        <Pressable style={s.dropdown} onPress={() => setShowDropdownModal(true)}>
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

      <View style={s.tabRow}>
        <Pressable style={[s.tabBtn, tab === "schedule" && s.tabActive]} onPress={() => setTab("schedule")}>
          <Ionicons name="list" size={15} color={tab === "schedule" ? "white" : "#94A3B8"} />
          <Text style={[s.tabText, tab === "schedule" && s.tabTextActive]}>รายการยา</Text>
        </Pressable>
        <Pressable style={[s.tabBtn, tab === "today" && s.tabActive]} onPress={() => setTab("today")}>
          <Ionicons name="today" size={15} color={tab === "today" ? "white" : "#94A3B8"} />
          <Text style={[s.tabText, tab === "today" && s.tabTextActive]}>ตารางยา</Text>
          {todayList.filter(t => !t.status).length > 0 && (
            <View style={s.notifBadge}>
              <Text style={s.notifBadgeText}>{todayList.filter(t => !t.status).length}</Text>
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

  const groupedSchedules = groupByTime(schedules);
  const takenCount = todayList.filter(t => t.status === "taken" || t.status === "late").length;
  const totalCount = todayList.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F9FF" }}>

      {/* ── Elderly Dropdown Modal ── */}
      <Modal visible={showDropdownModal} transparent animationType="fade" onRequestClose={() => setShowDropdownModal(false)}>
        <Pressable style={s.dropdownOverlay} onPress={() => setShowDropdownModal(false)}>
          <View style={s.dropdownModalBox}>
            <Text style={s.dropdownModalTitle}>เลือกผู้สูงอายุ</Text>
            {elderlyList.map((item) => (
              <Pressable
                key={item.id}
                style={[s.dropdownModalItem, selectedElderly?.id === item.id && s.dropdownModalItemActive]}
                onPress={() => handleSelectElderly(item)}
              >
                <View style={[s.dropdownAvatar, { backgroundColor: getAvatarColor(item.id) }]}>
                  <Text style={s.dropdownAvatarText}>{item.name?.charAt(0)}</Text>
                </View>
                <Text style={[s.dropdownItemText, selectedElderly?.id === item.id && { color: "#2563EB", fontWeight: "700" }]}>
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
          keyExtractor={(item) => `${item.time_hhmm}-${item.days_of_week}`}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader()}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="medical-outline" size={52} color="#BFDBFE" />
              <Text style={s.emptyText}>ยังไม่มีรายการยา</Text>
              <Text style={s.emptySubText}>กดปุ่ม + เพื่อเพิ่มยา</Text>
            </View>
          }
          renderItem={({ item: group }) => renderScheduleGroup(group)}
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
            <View style={s.subTabRow}>
              <Pressable
                style={[s.subTabBtn, todaySubTab === "today" && s.subTabActive]}
                onPress={() => setTodaySubTab("today")}
              >
                <Ionicons name="today-outline" size={14} color={todaySubTab === "today" ? "#2563EB" : "#94A3B8"} style={{ marginRight: 4 }} />
                <Text style={[s.subTabText, todaySubTab === "today" && s.subTabTextActive]}>ตารางวันนี้</Text>
              </Pressable>
              <Pressable
                style={[s.subTabBtn, todaySubTab === "pick" && s.subTabActive]}
                onPress={() => {
                  setTodaySubTab("pick");
                  if (selectedElderly) fetchHistory(selectedElderly.id, selectedDate);
                }}
              >
                <Ionicons name="calendar-outline" size={14} color={todaySubTab === "pick" ? "#2563EB" : "#94A3B8"} style={{ marginRight: 4 }} />
                <Text style={[s.subTabText, todaySubTab === "pick" && s.subTabTextActive]}>เลือกวันที่</Text>
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
                  groupTodayByTime(sortTodayList(todayList)).map((group) =>
                    renderTodayGroup(group, true)
                  )
                )}
              </>
            )}

            {/* ─── เลือกวันที่ ─── */}
            {todaySubTab === "pick" && (
              <>
                <Pressable style={s.datePickerBtn} onPress={() => setShowCalendar(true)}>
                  <Ionicons name="calendar" size={16} color="#2563EB" />
                  <Text style={s.datePickerText}>{formatDateTH(selectedDate).long}</Text>
                  <Ionicons name="chevron-down" size={14} color="#64748B" />
                </Pressable>

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
                        markedDates={{ [toDateStr(selectedDate)]: { selected: true, selectedColor: "#2563EB" } }}
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

                {!historyLoading && historyList.length > 0 && (() => {
                  const hTaken = historyList.filter(i => i.status === "taken" || i.status === "late").length;
                  const hTotal = historyList.length;
                  const hPct = hTotal > 0 ? Math.round(hTaken / hTotal * 100) : 0;
                  return (
                    <View style={[s.summaryCard, { backgroundColor: "#475569" }]}>
                      <View>
                        <Text style={s.summaryTitle}>ตารางยา {formatDateTH(selectedDate).short}</Text>
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
                  groupTodayByTime(
                    sortHistoryList(historyList, isDateToday(selectedDate))
                  ).map((group) => renderTodayGroup(group, isDateToday(selectedDate)))
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Modal บันทึกการกินยา (ทั้งกลุ่ม) ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={s.bottomSheet} onPress={(e) => e.stopPropagation()}>

            {/* Header เวลากำหนด */}
            <View style={s.modalHeader}>
              <Ionicons name="alarm-outline" size={18} color="#1D4ED8" />
              <Text style={s.modalHeaderTime}>กำหนดกิน {activeGroup?.time_hhmm}</Text>
              <Text style={s.modalHeaderCount}>· {activeGroup?.medicines.length} รายการ</Text>
            </View>

            {/* รายการยาทั้งหมดในกลุ่ม พร้อมปุ่มลบ */}
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
                    <View style={[s.todayMedIcon, cfg ? { backgroundColor: cfg.bg } : { backgroundColor: "#EFF6FF" }]}>
                      <Ionicons
                        name={cfg ? (cfg.icon as any) : "medical-outline"}
                        size={15}
                        color={cfg ? cfg.color : "#2563EB"}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={s.modalMedName}>{med.medication_name}</Text>
                      <View style={s.medBadgeRow}>
                        {med.dosage ? (
                          <View style={[s.pill, { backgroundColor: "#F3E8FF" }]}>
                            <Text style={[s.pillText, { color: "#7C3AED" }]}>{med.dosage}</Text>
                          </View>
                        ) : null}
                        {med.meal_relation && med.meal_relation !== "ไม่ระบุ" ? (
                          <View style={[s.pill, { backgroundColor: "#ECFDF5" }]}>
                            <Text style={[s.pillText, { color: "#059669" }]}>{med.meal_relation}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    {/* สถานะ หรือ ปุ่มลบ */}
                    {cfg ? (
                      <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={s.modalDeleteBtn}
                        onPress={() => handleDeleteFromModal(med.scheduleId)}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {/* ✅ Time picker — เลื่อนเวลาจริงที่กิน */}
            <View style={s.takenTimeBox}>
              <Ionicons name="time-outline" size={16} color="#2563EB" />
              <Text style={s.takenTimeLabel}>เวลาที่กินจริง</Text>
              <Pressable
                style={s.takenTimeBtn}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={s.takenTimeBtnText}>
                  {String(actualTakenTime.getHours()).padStart(2, "0")}:{String(actualTakenTime.getMinutes()).padStart(2, "0")}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#2563EB" />
              </Pressable>
            </View>

            {/* iOS time picker */}
            {showTimePicker && (
              <Modal transparent animationType="slide">
                <Pressable
                  style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Pressable
                    style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}
                    onPress={e => e.stopPropagation()}
                  >
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

            {/* ✅ ปุ่ม "กินยาครบแล้ว" + "ข้ามมื้อ" เท่านั้น */}
            <Text style={s.modalTitle}>บันทึกการกินยา</Text>
            <Pressable
              style={[s.logBtn, { backgroundColor: "#10B981" }]}
              onPress={() => handleLogGroup("taken")}
              disabled={logging}
            >
              <Ionicons name="checkmark-circle" size={20} color="white" />
              <Text style={s.logBtnText}>✓ กินยาครบแล้ว</Text>
            </Pressable>
            <Pressable
              style={[s.logBtn, { backgroundColor: "white", borderWidth: 1.5, borderColor: "#EF4444" }]}
              onPress={() => handleLogGroup("missed")}
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

/* ─── Styles ─── */

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 16,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#1E3A5F" },
  headerSub: { fontSize: 13, color: "#64748B", marginTop: 2 },
  logoutBtn: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: "#FFF5F5",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#FEE2E2",
  },

  selectorRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12, gap: 10 },
  dropdown: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: "white", padding: 10, borderRadius: 12, gap: 8,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  dropdownAvatar: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  dropdownAvatarText: { color: "white", fontWeight: "800", fontSize: 12 },
  dropdownText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" },
  dropdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" },
  dropdownModalBox: {
    backgroundColor: "white", borderRadius: 18, padding: 16, width: "82%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
  },
  dropdownModalTitle: {
    fontSize: 14, fontWeight: "700", color: "#64748B", marginBottom: 10,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9",
  },
  dropdownModalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, gap: 10, borderRadius: 10 },
  dropdownModalItemActive: { backgroundColor: "#EFF6FF" },
  dropdownItemText: { fontSize: 14, fontWeight: "600", color: "#1E293B", flex: 1 },

  addBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#2563EB", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },

  tabRow: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "white", borderRadius: 12, padding: 4,
    shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
  },
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

  datePickerBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "white", padding: 12, borderRadius: 12, marginBottom: 14,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  datePickerText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E293B" },

  /* ✅ Schedule group card */
  scheduleGroupCard: {
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: "#2563EB",
  },
  groupHeaderLeft: { flex: 1, gap: 6 },
  timeBadgeLarge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
  },
  timeBadgeLargeText: { fontSize: 22, fontWeight: "800", color: "white" },
  groupMeta: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  metaChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20,
  },
  metaChipText: { fontSize: 11, fontWeight: "600", color: "white" },
  groupActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center", alignItems: "center",
  },

  medCountRow: {
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
  },
  medCountText: { fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 },

  /* แต่ละยาใน group */
  medRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  medRowBorder: { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  medRowLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  medIndex: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#DBEAFE", justifyContent: "center", alignItems: "center",
    marginTop: 1,
  },
  medIndexText: { fontSize: 11, fontWeight: "700", color: "#1D4ED8" },
  medBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  medRowName: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  removeMedBtn: { padding: 4, marginTop: -2 },

  /* Shared */
  cardLeft: { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  medName: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 3 },
  pillText: { fontSize: 12, fontWeight: "600" },
  notesRow: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6,
    backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, alignSelf: "flex-start",
  },
  notesText: { fontSize: 12, color: "#F97316", fontWeight: "600", flex: 1, lineHeight: 16 },

  todayCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    backgroundColor: "white", padding: 14, borderRadius: 16, marginBottom: 10,
    shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
    borderLeftWidth: 4, borderLeftColor: "#E2E8F0",
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 2 },
  statusText: { fontSize: 12, fontWeight: "700" },

  summaryCard: {
    backgroundColor: "#2563EB", borderRadius: 16, padding: 18, marginBottom: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
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

  // ✅ เวลาจริงที่กิน
  takenTimeBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#F8FAFF", borderRadius: 12, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: "#DBEAFE",
  },
  takenTimeLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1E3A5F" },
  takenTimeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#EFF6FF", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: "#BFDBFE",
  },
  takenTimeBtnText: { fontSize: 18, fontWeight: "800", color: "#1D4ED8" },

  // ✅ modal header
  modalHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#EFF6FF", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  modalHeaderTime: { fontSize: 16, fontWeight: "800", color: "#1D4ED8" },
  modalHeaderCount: { fontSize: 13, color: "#64748B", fontWeight: "600" },

  // ✅ modal medicine list
  modalMedList: { maxHeight: 220, marginBottom: 12 },
  modalMedRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, paddingHorizontal: 4, gap: 0,
  },
  modalMedName: { fontSize: 14, fontWeight: "700", color: "#1E293B", marginBottom: 3 },
  modalDeleteBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#FECACA",
  },

  // ✅ Today group card styles
  todayGroupCard: {
    backgroundColor: "white", borderRadius: 16, marginBottom: 14,
    borderWidth: 1.5, overflow: "hidden",
    shadowColor: "#1D4ED8", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  todayGroupHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  todayGroupTime: { fontSize: 18, fontWeight: "800", color: "white" },
  todayGroupCount: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  todayGroupStatusBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  todayGroupStatusText: { fontSize: 12, fontWeight: "700", color: "white" },
  todayMedRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  todayMedLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  todayMedIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
  },
  todayMedName: { fontSize: 14, fontWeight: "700", color: "#1E293B", marginBottom: 2 },

  // ✅ เวลาที่กินจริง
  takenAtRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  takenAtText: { fontSize: 11, fontWeight: "700" },
});
