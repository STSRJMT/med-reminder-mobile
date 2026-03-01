import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../../src/config";
import DateTimePicker from "@react-native-community/datetimepicker";

/* ---------------- helpers ---------------- */

const formatTime = (date: Date) => {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const todayString = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
};

const weekDays = [
  { label: "อา", value: 0 },
  { label: "จ", value: 1 },
  { label: "อ", value: 2 },
  { label: "พ", value: 3 },
  { label: "พฤ", value: 4 },
  { label: "ศ", value: 5 },
  { label: "ส", value: 6 },
];

const mealOptions = [
  "ไม่ระบุ",
  "ก่อนอาหาร",
  "หลังอาหาร",
  "พร้อมอาหาร",
];

export default function AddSchedule() {
  const { elderlyId, elderlyName } = useLocalSearchParams<{
    elderlyId: string;
    elderlyName: string;
  }>();

  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate] = useState(todayString());

  // เริ่มต้นมีเวลา 1 เวลาเลย
  const [times, setTimes] = useState<Date[]>([new Date()]);
  const [showPickerIndex, setShowPickerIndex] = useState<number | null>(null);

  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [mealRelation, setMealRelation] = useState("ไม่ระบุ");

  const [errors, setErrors] = useState<any>({});

  /* ---------------- validation ---------------- */

  const validate = () => {
    let newErrors: any = {};

    if (!name.trim()) newErrors.name = true;
    if (times.length === 0) newErrors.times = true;

    const formattedTimes = times.map(formatTime);
    if (new Set(formattedTimes).size !== formattedTimes.length) {
      Alert.alert("เวลาไม่ถูกต้อง", "ห้ามตั้งเวลาเหมือนกัน");
      return false;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      Alert.alert("กรอกข้อมูลไม่ครบ", "กรุณากรอกข้อมูลที่จำเป็น");
      return false;
    }

    return true;
  };

  /* ---------------- time ---------------- */

  const addTime = () => {
    setTimes([...times, new Date()]);
  };

  const removeTime = (index: number) => {
    if (times.length === 1) {
      Alert.alert("แจ้งเตือน", "ต้องมีเวลาอย่างน้อย 1 เวลา");
      return;
    }
    const copy = [...times];
    copy.splice(index, 1);
    setTimes(copy);
  };

  const updateTime = (event: any, selectedDate?: Date) => {
    if (showPickerIndex === null) return;

    if (selectedDate) {
      const copy = [...times];
      copy[showPickerIndex] = selectedDate;
      setTimes(copy);
    }

    if (Platform.OS !== "ios") {
      setShowPickerIndex(null);
    }
  };

  /* ---------------- days ---------------- */

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const toggleAllDays = () => {
    if (selectedDays.length === 7) {
      setSelectedDays([]);
    } else {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    }
  };

  /* ---------------- save ---------------- */

  const handleSave = async () => {
    if (!validate()) return;

    try {
      const token = await AsyncStorage.getItem("token");

      for (const time of times) {
        await axios.post(
          `${API_BASE_URL}/caregiver/schedules`,
          {
            elderlyUserId: Number(elderlyId),
            name,
            dosage,
            timeHHMM: formatTime(time),
            notes,
            daysOfWeek:
              selectedDays.length === 0
                ? [0, 1, 2, 3, 4, 5, 6]
                : selectedDays,
            mealRelation,
            startDate,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }

      Alert.alert("สำเร็จ", "เพิ่มรายการยาเรียบร้อย");
      router.back();
    } catch (err: any) {
      console.log(err.response?.data || err.message);
      Alert.alert("ผิดพลาด", "ไม่สามารถบันทึกได้");
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} />
          </Pressable>

          <View style={{ alignItems: "center" }}>
            <Text style={styles.header}>เพิ่มรายการยา</Text>
            <Text style={{ fontSize: 12 }}>{elderlyName}</Text>
          </View>

          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.label}>ชื่อยา *</Text>
        <TextInput
          style={[styles.input, errors.name && styles.errorInput]}
          value={name}
          onChangeText={setName}
          placeholder="เช่น พาราเซตามอล"
        />

        <Text style={styles.label}>ขนาดยา</Text>
        <TextInput
          style={styles.input}
          value={dosage}
          onChangeText={setDosage}
        />

        <Text style={styles.label}>เวลาที่ต้องกิน *</Text>

        {times.map((time, index) => (
          <View key={index} style={styles.timeRow}>
            <Pressable
              style={[styles.input, { flex: 1 }]}
              onPress={() => setShowPickerIndex(index)}
            >
              <Text>{formatTime(time)}</Text>
            </Pressable>

            <Pressable
              style={styles.removeBtn}
              onPress={() => removeTime(index)}
            >
              <Ionicons name="close" size={16} color="white" />
            </Pressable>

            {showPickerIndex === index && (
              <DateTimePicker
                value={time}
                mode="time"
                is24Hour={true}
                display="default"
                onChange={updateTime}
              />
            )}
          </View>
        ))}

        <Pressable style={styles.addTimeBtn} onPress={addTime}>
          <Ionicons name="add" size={16} />
          <Text style={{ marginLeft: 6 }}>เพิ่มเวลา</Text>
        </Pressable>

        <Text style={styles.label}>เลือกวัน</Text>

        <Pressable
          style={[
            styles.allDaysBtn,
            selectedDays.length === 7 && { backgroundColor: "#1D4ED8" },
          ]}
          onPress={toggleAllDays}
        >
          <Text style={{ color: "white" }}>ทุกวัน</Text>
        </Pressable>

        <View style={styles.weekRow}>
          {weekDays.map((day) => (
            <Pressable
              key={day.value}
              style={[
                styles.dayBtn,
                selectedDays.includes(day.value) && styles.daySelected,
              ]}
              onPress={() => toggleDay(day.value)}
            >
              <Text
                style={{
                  color: selectedDays.includes(day.value)
                    ? "white"
                    : "black",
                }}
              >
                {day.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>วันที่เริ่มต้น</Text>
        <TextInput style={styles.input} value={startDate} editable={false} />

        <Text style={styles.label}>เวลากินเทียบกับอาหาร</Text>

        <View style={styles.mealRow}>
          {mealOptions.map((item) => (
            <Pressable
              key={item}
              style={[
                styles.mealBtn,
                mealRelation === item && styles.mealSelected,
              ]}
              onPress={() => setMealRelation(item)}
            >
              <Text
                style={{
                  color: mealRelation === item ? "white" : "black",
                }}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>หมายเหตุ</Text>
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
        />

        <View style={styles.buttonRow}>
          <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
            <Text>ยกเลิก</Text>
          </Pressable>

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={{ color: "white" }}>บันทึก</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F9FF", padding: 16 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  header: { fontSize: 18, fontWeight: "800" },
  label: { marginTop: 16, marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  errorInput: { borderColor: "red" },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  removeBtn: {
    marginLeft: 8,
    backgroundColor: "#EF4444",
    padding: 10,
    borderRadius: 8,
  },
  addTimeBtn: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  dayBtn: {
    flex: 1,
    padding: 10,
    marginHorizontal: 2,
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    alignItems: "center",
  },
  daySelected: { backgroundColor: "#2563EB" },
  allDaysBtn: {
    backgroundColor: "#2563EB",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  mealRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  mealBtn: {
    backgroundColor: "#E5E7EB",
    padding: 8,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  mealSelected: { backgroundColor: "#2563EB" },
  buttonRow: {
    flexDirection: "row",
    marginTop: 30,
    marginBottom: 50,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#E5E7EB",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginRight: 8,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#2563EB",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
});