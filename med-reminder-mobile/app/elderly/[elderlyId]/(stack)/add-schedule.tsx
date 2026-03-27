import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, Alert, Platform, Modal, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../../../src/config";
import DateTimePicker from "@react-native-community/datetimepicker";

/* ─── Types ─── */

interface MedicineItem {
  id: string;
  name: string;
  dosage: string;
  notes: string;
}

/* ─── Helpers ─── */

const makeId = () => Math.random().toString(36).slice(2, 8);

const formatTime = (date: Date) => {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const formatDateDisplay = (date: Date) => {
  const thMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${date.getDate()} ${thMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const weekDays = [
  { label: "อา", value: 0 }, { label: "จ", value: 1 }, { label: "อ", value: 2 },
  { label: "พ", value: 3 }, { label: "พฤ", value: 4 }, { label: "ศ", value: 5 }, { label: "ส", value: 6 },
];

const mealOptions = [
  { label: "ไม่ระบุ", icon: "remove-circle-outline" },
  { label: "ก่อนอาหาร", icon: "time-outline" },
  { label: "หลังอาหาร", icon: "checkmark-circle-outline" },
  { label: "พร้อมอาหาร", icon: "fast-food-outline" },
];

/* ─── MiniCalendar ─── */

const MiniCalendar = ({
  selectedDate, onSelect, onClose,
}: {
  selectedDate: Date; onSelect: (date: Date) => void; onClose: () => void;
}) => {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  const thMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <Modal transparent animationType="fade">
      <Pressable style={cal.overlay} onPress={onClose}>
        <Pressable style={cal.card} onPress={e => e.stopPropagation()}>
          <View style={cal.navRow}>
            <Pressable onPress={() => { const d = new Date(viewDate); d.setMonth(d.getMonth()-1); setViewDate(d); }} style={cal.navBtn}>
              <Ionicons name="chevron-back" size={20} color="#1D4ED8" />
            </Pressable>
            <Text style={cal.monthLabel}>{thMonths[month]} {year + 543}</Text>
            <Pressable onPress={() => { const d = new Date(viewDate); d.setMonth(d.getMonth()+1); setViewDate(d); }} style={cal.navBtn}>
              <Ionicons name="chevron-forward" size={20} color="#1D4ED8" />
            </Pressable>
          </View>
          <View style={cal.weekHeader}>
            {["อา","จ","อ","พ","พฤ","ศ","ส"].map(d => <Text key={d} style={cal.weekLabel}>{d}</Text>)}
          </View>
          <View style={cal.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={`e-${i}`} style={cal.cell} />;
              const cellDate = new Date(year, month, day); cellDate.setHours(0,0,0,0);
              const isSelected = cellDate.toDateString() === selectedDate.toDateString();
              const isToday = cellDate.toDateString() === today.toDateString();
              const isPast = cellDate < today;
              return (
                <Pressable key={day} style={[cal.cell, isSelected && cal.cellSelected, isToday && !isSelected && cal.cellToday]}
                  onPress={() => { if (!isPast || isToday) { onSelect(cellDate); onClose(); } }}>
                  <Text style={[cal.cellText, isSelected && cal.cellTextSelected, isPast && !isToday && cal.cellTextPast]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={cal.closeBtn} onPress={onClose}>
            <Text style={{ color: "#6B7280", fontSize: 14 }}>ปิด</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/* ─── Main Component ─── */

export default function ElderlyAddSchedule() {
  const { editMode, scheduleId, scheduleIds } = useLocalSearchParams<{
    editMode: string; scheduleId: string; scheduleIds: string;
  }>();

  const isEdit = editMode === "true";
  const [elderlyId, setElderlyId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // ✅ medicines array (หลายยาใน 1 เวลา)
  const [medicines, setMedicines] = useState<MedicineItem[]>([
    { id: makeId(), name: "", dosage: "", notes: "" },
  ]);

  const [startDate, setStartDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  const [times, setTimes] = useState<Date[]>([new Date()]);
  const [showPickerIndex, setShowPickerIndex] = useState<number | null>(null);
  // ✅ iOS picker: tempTime + ยืนยัน
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const [editScheduleIds, setEditScheduleIds] = useState<number[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [mealRelation, setMealRelation] = useState("ไม่ระบุ");
  const [errors, setErrors] = useState<any>({});

  useEffect(() => {
    AsyncStorage.getItem("elderlyId").then(id => setElderlyId(id));
  }, []);

  /* ─── Load edit data ─── */

  useEffect(() => {
    if (!isEdit || !scheduleId) return;
    const load = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const eid = await AsyncStorage.getItem("elderlyId");
        const res = await axios.get(
          `${API_BASE_URL}/elderly/schedules/${eid}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const allSchedules = res.data.items || [];
        const target = allSchedules.find((s: any) => String(s.id) === scheduleId);
        if (!target) return;

        setMealRelation(target.meal_relation || "ไม่ระบุ");
        if (target.days_of_week) {
          setSelectedDays(target.days_of_week.split(",").map((v: string) => Number(v.trim())));
        }

        // เวลาจาก schedule แรก
        const [hh, mm] = target.time_hhmm.split(":").map(Number);
        const t = new Date(); t.setHours(hh, mm, 0, 0);
        setTimes([t]);

        if (scheduleIds) {
          const ids = scheduleIds.split(",").map(Number);
          setEditScheduleIds(ids);
          // โหลดยาแต่ละตัว
          const relatedSchedules = allSchedules.filter((s: any) => ids.includes(s.id));
          setMedicines(relatedSchedules.map((s: any) => ({
            id: makeId(),
            name: s.medication_name || "",
            dosage: s.dosage || "",
            notes: s.notes || "",
          })));
        } else {
          setEditScheduleIds([Number(scheduleId)]);
          setMedicines([{
            id: makeId(),
            name: target.medication_name || "",
            dosage: target.dosage || "",
            notes: target.notes || "",
          }]);
        }
      } catch {
        Alert.alert("ผิดพลาด", "ไม่สามารถโหลดข้อมูลได้");
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [scheduleId]);

  useFocusEffect(useCallback(() => {
    if (!isEdit) {
      setMedicines([{ id: makeId(), name: "", dosage: "", notes: "" }]);
      setStartDate(new Date()); setTimes([new Date()]);
      setEditScheduleIds([]); setSelectedDays([]);
      setMealRelation("ไม่ระบุ"); setErrors({});
      setShowPickerIndex(null);
    }
  }, [isEdit]));

  /* ─── Medicine helpers ─── */

  const addMedicine = () => {
    setMedicines([...medicines, { id: makeId(), name: "", dosage: "", notes: "" }]);
  };

  const removeMedicine = (id: string) => {
    if (medicines.length === 1) { Alert.alert("แจ้งเตือน", "ต้องมียาอย่างน้อย 1 รายการ"); return; }
    setMedicines(medicines.filter(m => m.id !== id));
  };

  const updateMedicine = (id: string, field: keyof Omit<MedicineItem, "id">, value: string) => {
    setMedicines(medicines.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  /* ─── Validation ─── */

  const validate = () => {
    const hasEmptyName = medicines.some(m => !m.name.trim());
    if (hasEmptyName) {
      Alert.alert("กรอกข้อมูลไม่ครบ", "กรุณากรอกชื่อยาให้ครบทุกรายการ");
      setErrors({ medicines: true });
      return false;
    }
    if (times.length === 0) { setErrors({ times: true }); return false; }
    const formattedTimes = times.map(formatTime);
    if (new Set(formattedTimes).size !== formattedTimes.length) {
      Alert.alert("เวลาไม่ถูกต้อง", "ห้ามตั้งเวลาเหมือนกัน");
      return false;
    }
    setErrors({});
    return true;
  };

  /* ─── Time helpers ─── */

  const addTime = () => setTimes([...times, new Date()]);

  const removeTime = (index: number) => {
    if (times.length === 1) { Alert.alert("แจ้งเตือน", "ต้องมีเวลาอย่างน้อย 1 เวลา"); return; }
    const copy = [...times]; copy.splice(index, 1); setTimes(copy);
  };

  const openPicker = (index: number) => {
    setTempTime(new Date(times[index]));
    setShowPickerIndex(index);
  };

  const onPickerChange = (event: any, selectedDate?: Date) => {
    if (!selectedDate) return;
    if (Platform.OS === "android") {
      const copy = [...times]; copy[showPickerIndex!] = selectedDate; setTimes(copy);
      setShowPickerIndex(null);
    } else {
      setTempTime(selectedDate);
    }
  };

  const confirmIOSTime = () => {
    if (showPickerIndex === null) return;
    const copy = [...times]; copy[showPickerIndex] = tempTime; setTimes(copy);
    setShowPickerIndex(null);
  };

  /* ─── Day helpers ─── */

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleAllDays = () => {
    setSelectedDays(selectedDays.length === 7 ? [] : [0,1,2,3,4,5,6]);
  };

  /* ─── Save ─── */

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) { Alert.alert("Session หมดอายุ"); return; }
      const daysToSend = selectedDays.length === 0 ? null : selectedDays;
      const timeHHMM = formatTime(times[0]); // ใช้เวลาเดียวกันทั้งกลุ่ม

      if (isEdit && editScheduleIds.length > 0) {
        // ✅ Edit: อัปเดตแต่ละยา × เวลา times[0]
        for (let i = 0; i < medicines.length; i++) {
          const med = medicines[i];
          if (i < editScheduleIds.length) {
            await axios.put(
              `${API_BASE_URL}/elderly/schedules/${editScheduleIds[i]}`,
              { name: med.name, dosage: med.dosage, notes: med.notes, timeHHMM, daysOfWeek: daysToSend, mealRelation },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else {
            await axios.post(
              `${API_BASE_URL}/elderly/schedules`,
              { name: med.name, dosage: med.dosage, notes: med.notes, timeHHMM, daysOfWeek: daysToSend, mealRelation },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        }
        // ลบยาที่เหลือถ้าจำนวนลดลง
        if (editScheduleIds.length > medicines.length) {
          const idsToDelete = editScheduleIds.slice(medicines.length);
          for (const sid of idsToDelete) {
            await axios.delete(`${API_BASE_URL}/elderly/schedules/${sid}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        }
      } else {
        // ✅ Create: วนยาทุกตัว × ทุกเวลา
        for (const med of medicines) {
          for (const time of times) {
            await axios.post(
              `${API_BASE_URL}/elderly/schedules`,
              { name: med.name, dosage: med.dosage, notes: med.notes, timeHHMM: formatTime(time), daysOfWeek: daysToSend, mealRelation },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }
        }
      }

      Alert.alert("สำเร็จ ✓", isEdit ? "แก้ไขรายการยาเรียบร้อยแล้ว" : "เพิ่มรายการยาเรียบร้อยแล้ว", [
        { text: "ตกลง", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("ผิดพลาด", "ไม่สามารถบันทึกได้");
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {showCalendar && (
        <MiniCalendar selectedDate={startDate} onSelect={setStartDate} onClose={() => setShowCalendar(false)} />
      )}

      {/* ✅ iOS Time Picker Modal */}
      {Platform.OS === "ios" && showPickerIndex !== null && (
        <Modal transparent animationType="slide">
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setShowPickerIndex(null)}>
            <Pressable style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }} onPress={e => e.stopPropagation()}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                <Pressable onPress={() => setShowPickerIndex(null)}>
                  <Text style={{ fontSize: 16, color: "#94A3B8", fontWeight: "600" }}>ยกเลิก</Text>
                </Pressable>
                <Pressable onPress={confirmIOSTime}>
                  <Text style={{ fontSize: 16, color: "#2563EB", fontWeight: "700" }}>ยืนยัน</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                is24Hour
                display="spinner"
                onChange={onPickerChange}
                style={{ height: 180 }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color="#1D4ED8" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>{isEdit ? "แก้ไขรายการยา" : "เพิ่มรายการยา"}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ✅ รายการยา (หลายตัวได้) */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="medical" size={16} color="#1D4ED8" />
            <Text style={s.cardTitle}>รายการยา</Text>
            {!isEdit && (
              <View style={s.medicineBadge}>
  <Text style={s.medicineBadgeText}>{medicines.length} รายการ</Text>
</View>
            )}
          </View>

          {medicines.map((med, index) => (
            <View key={med.id} style={[s.medicineCard, errors.medicines && !med.name.trim() && s.medicineCardError]}>
              <View style={s.medicineCardHeader}>
                <View style={s.medicineNumberBadge}>
                  <Text style={s.medicineNumberText}>{index + 1}</Text>
                </View>
                <Text style={s.medicineCardTitle}>ยารายการที่ {index + 1}</Text>
                {medicines.length > 1 && (
  <Pressable onPress={() => removeMedicine(med.id)}>
    <Ionicons name="close-circle" size={20} color="#EF4444" />
  </Pressable>
)}
              </View>

              <Text style={s.label}>ชื่อยา <Text style={s.required}>*</Text></Text>
              <TextInput
                style={[s.input, errors.medicines && !med.name.trim() && s.inputError]}
                value={med.name}
                onChangeText={v => updateMedicine(med.id, "name", v)}
                placeholder="เช่น พาราเซตามอล"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={s.label}>ขนาดยา</Text>
              <TextInput
                style={s.input}
                value={med.dosage}
                onChangeText={v => updateMedicine(med.id, "dosage", v)}
                placeholder="เช่น 1 เม็ด / 5 ml"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={s.label}>หมายเหตุ</Text>
              <TextInput
                style={s.inputMultiline}
                value={med.notes}
                onChangeText={v => updateMedicine(med.id, "notes", v)}
                placeholder="เช่น ห้ามบด / ต้องกินพร้อมน้ำมากๆ"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>
          ))}

          {!isEdit && (
            <Pressable style={s.addMedicineBtn} onPress={addMedicine}>
  <Ionicons name="add-circle" size={18} color="#059669" />
  <Text style={s.addMedicineText}>เพิ่มยา</Text>
</Pressable>
          )}
        </View>

        {/* เวลา */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="time" size={16} color="#1D4ED8" />
            <Text style={s.cardTitle}>เวลาที่ต้องกิน <Text style={s.required}>*</Text></Text>
          </View>

          {times.map((time, index) => (
            <View key={index} style={s.timeRow}>
              <Pressable style={s.timeBox} onPress={() => openPicker(index)}>
                <Ionicons name="alarm-outline" size={16} color="#1D4ED8" />
                <Text style={s.timeText}>{formatTime(time)}</Text>
              </Pressable>
              <Pressable style={s.removeBtn} onPress={() => removeTime(index)}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
              {/* Android inline picker */}
              {Platform.OS === "android" && showPickerIndex === index && (
                <DateTimePicker
                  value={time}
                  mode="time"
                  is24Hour
                  display="default"
                  onChange={onPickerChange}
                />
              )}
            </View>
          ))}

          <Pressable style={s.addTimeBtn} onPress={addTime}>
            <Ionicons name="add-circle" size={18} color="#1D4ED8" />
            <Text style={s.addTimeText}>เพิ่มเวลา</Text>
          </Pressable>

          {/* สรุป */}
          {!isEdit && medicines.length > 0 && times.length > 0 && (
            <View style={s.summaryBox}>
              <Ionicons name="information-circle-outline" size={14} color="#2563EB" />
              <Text style={s.summaryText}>
                จะบันทึกทั้งหมด {medicines.length} ยา × {times.length} เวลา = {medicines.length * times.length} รายการ
              </Text>
            </View>
          )}
        </View>

        {/* วัน */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="calendar" size={16} color="#1D4ED8" />
            <Text style={s.cardTitle}>วันที่ต้องกิน</Text>
          </View>
          <Pressable style={[s.allDaysBtn, selectedDays.length === 7 && s.allDaysActive]} onPress={toggleAllDays}>
            <Ionicons name={selectedDays.length === 7 ? "checkmark-circle" : "ellipse-outline"} size={16} color="white" />
            <Text style={s.allDaysText}>ทุกวัน</Text>
          </Pressable>
          <View style={s.weekRow}>
            {weekDays.map(day => {
              const active = selectedDays.includes(day.value);
              return (
                <Pressable key={day.value} style={[s.dayBtn, active && s.dayActive]} onPress={() => toggleDay(day.value)}>
                  <Text style={[s.dayText, active && s.dayTextActive]}>{day.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* วันที่เริ่มต้น */}
        {!isEdit && (
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <Ionicons name="today" size={16} color="#1D4ED8" />
              <Text style={s.cardTitle}>วันที่เริ่มต้น</Text>
            </View>
            <Pressable style={s.dateBox} onPress={() => setShowCalendar(true)}>
              <Ionicons name="calendar-outline" size={18} color="#1D4ED8" />
              <Text style={s.dateText}>{formatDateDisplay(startDate)}</Text>
              <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
            </Pressable>
          </View>
        )}

        {/* มื้ออาหาร */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="restaurant" size={16} color="#1D4ED8" />
            <Text style={s.cardTitle}>เวลาเทียบกับมื้ออาหาร</Text>
          </View>
          <View style={s.mealGrid}>
            {mealOptions.map(item => {
              const active = mealRelation === item.label;
              return (
                <Pressable key={item.label} style={[s.mealBtn, active && s.mealActive]} onPress={() => setMealRelation(item.label)}>
                  <Ionicons name={item.icon as any} size={18} color={active ? "white" : "#6B7280"} />
                  <Text style={[s.mealText, active && s.mealTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ปุ่ม */}
        <View style={s.btnRow}>
          <Pressable style={s.cancelBtn} onPress={() => router.back()}>
            <Text style={s.cancelText}>ยกเลิก</Text>
          </Pressable>
          <Pressable style={s.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="white" /> : (
              <>
                <Ionicons name="checkmark" size={18} color="white" />
                <Text style={s.saveText}>{isEdit ? "บันทึกการแก้ไข" : "บันทึก"}</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── Styles ─── */

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: "#F0F9FF" },
  header:              { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: "white", borderBottomWidth: 1, borderBottomColor: "#E0F0FF" },
  backBtn:             { width: 36, height: 36, borderRadius: 10, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  headerTitle:         { fontSize: 17, fontWeight: "700", color: "#1E3A5F" },
  card:                { backgroundColor: "white", borderRadius: 16, padding: 16, marginHorizontal: 16, marginTop: 12, shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 },
  cardTitleRow:        { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#EFF6FF" },
  cardTitle:           { fontSize: 14, fontWeight: "700", color: "#1E3A5F" },
  label:               { fontSize: 13, color: "#374151", marginBottom: 6, marginTop: 8, fontWeight: "500" },
  required:            { color: "#EF4444" },
  input:               { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", fontSize: 14, color: "#1E293B" },
  inputError:          { borderColor: "#EF4444", backgroundColor: "#FFF5F5" },
  inputMultiline:      { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", fontSize: 14, color: "#1E293B", minHeight: 60, textAlignVertical: "top" },

  // Medicine cards
  medicineBadge:       { marginLeft: "auto", backgroundColor: "#DBEAFE", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  medicineBadgeText:   { fontSize: 11, color: "#1D4ED8", fontWeight: "700" },
  medicineCard:        { backgroundColor: "#F8FAFF", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#DBEAFE" },
  medicineCardError:   { borderColor: "#FCA5A5", backgroundColor: "#FFF5F5" },
  medicineCardHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  medicineNumberBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center" },
  medicineNumberText:  { color: "white", fontSize: 11, fontWeight: "700" },
  medicineCardTitle:   { flex: 1, fontSize: 13, fontWeight: "600", color: "#1E3A5F" },
  addMedicineBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5", borderRadius: 10, padding: 10, marginTop: 4, gap: 6, borderWidth: 1, borderColor: "#6EE7B7", borderStyle: "dashed" },
  addMedicineText:     { fontSize: 13, color: "#059669", fontWeight: "600" },

  timeRow:             { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  timeBox:             { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, gap: 8, borderWidth: 1, borderColor: "#BFDBFE" },
  timeText:            { fontSize: 16, fontWeight: "700", color: "#1D4ED8" },
  removeBtn:           { width: 40, height: 40, borderRadius: 10, backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FECACA" },
  addTimeBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10, marginTop: 4, gap: 6, borderWidth: 1, borderColor: "#BFDBFE", borderStyle: "dashed" },
  addTimeText:         { fontSize: 13, color: "#1D4ED8", fontWeight: "600" },
  summaryBox:          { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", borderRadius: 8, padding: 8, marginTop: 10 },
  summaryText:         { fontSize: 12, color: "#2563EB", fontWeight: "500", flex: 1 },

  allDaysBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#93C5FD", borderRadius: 10, padding: 10, marginBottom: 10, gap: 6 },
  allDaysActive:       { backgroundColor: "#1D4ED8" },
  allDaysText:         { color: "white", fontWeight: "700", fontSize: 14 },
  weekRow:             { flexDirection: "row", gap: 4 },
  dayBtn:              { flex: 1, paddingVertical: 10, backgroundColor: "#F1F5F9", borderRadius: 8, alignItems: "center" },
  dayActive:           { backgroundColor: "#2563EB" },
  dayText:             { fontSize: 12, fontWeight: "600", color: "#64748B" },
  dayTextActive:       { color: "white" },
  dateBox:             { flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#BFDBFE", gap: 10 },
  dateText:            { flex: 1, fontSize: 15, color: "#1D4ED8", fontWeight: "600" },
  mealGrid:            { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealBtn:             { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  mealActive:          { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  mealText:            { fontSize: 13, color: "#64748B", fontWeight: "500" },
  mealTextActive:      { color: "white", fontWeight: "600" },
  btnRow:              { flexDirection: "row", marginHorizontal: 16, marginTop: 20, gap: 10 },
  cancelBtn:           { flex: 1, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", padding: 14, borderRadius: 12, alignItems: "center" },
  cancelText:          { color: "#64748B", fontWeight: "600", fontSize: 15 },
  saveBtn:             { flex: 2, backgroundColor: "#2563EB", padding: 14, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveText:            { color: "white", fontWeight: "700", fontSize: 15 },
});

const cal = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  card:             { backgroundColor: "white", borderRadius: 20, padding: 20, width: 320, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10 },
  navRow:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  navBtn:           { width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  monthLabel:       { fontSize: 16, fontWeight: "700", color: "#1E3A5F" },
  weekHeader:       { flexDirection: "row", marginBottom: 8 },
  weekLabel:        { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: "#93C5FD" },
  grid:             { flexDirection: "row", flexWrap: "wrap" },
  cell:             { width: `${100/7}%`, aspectRatio: 1, justifyContent: "center", alignItems: "center" },
  cellSelected:     { backgroundColor: "#2563EB", borderRadius: 8 },
  cellToday:        { borderWidth: 1.5, borderColor: "#2563EB", borderRadius: 8 },
  cellText:         { fontSize: 14, color: "#1E293B", fontWeight: "500" },
  cellTextSelected: { color: "white", fontWeight: "700" },
  cellTextPast:     { color: "#CBD5E1" },
  closeBtn:         { marginTop: 16, alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
});