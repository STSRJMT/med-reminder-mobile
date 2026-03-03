import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { API_BASE_URL } from "../../../src/config";

export default function AddElderly() {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [disease, setDisease] = useState("");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<any>({});

  const resetForm = () => {
    setName("");
    setBirthDate(null);
    setPhone("");
    setAddress("");
    setDisease("");
    setPin("");
    setErrors({});
  };

  useFocusEffect(
    useCallback(() => {
      resetForm();
    }, [])
  );

  const calculateAge = (date: Date) => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
    return age;
  };

  const formatDateThai = (date: Date) => {
    const thMonths = [
      "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
      "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
    ];
    return `${date.getDate()} ${thMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
  };

  const handleChange = (field: string, value: string) => {
    if (errors[field]) setErrors({ ...errors, [field]: null });
    const map: any = {
      name: setName,
      phone: setPhone,
      address: setAddress,
      disease: setDisease,
      pin: setPin,
    };
    map[field]?.(value);
  };

  const goToElderlyList = () => {
    // ✅ navigate ไปหน้า elderly-list โดยตรง ล้าง stack ทั้งหมด
    router.replace("/caregiver/elderly-list");
  };

  const onSubmit = async () => {
    let newErrors: any = {};
    if (!name) newErrors.name = "กรุณากรอกชื่อ-นามสกุล";
    if (!birthDate) newErrors.birthDate = "กรุณาเลือกวันเกิด";
    if (!phone) newErrors.phone = "กรุณากรอกเบอร์โทร";
    else if (!/^[0-9]{10}$/.test(phone)) newErrors.phone = "เบอร์โทรต้องเป็นตัวเลข 10 หลัก";
    if (!pin) newErrors.pin = "กรุณากรอก PIN";
    else if (!/^[0-9]{6}$/.test(pin)) newErrors.pin = "PIN ต้องเป็นตัวเลข 6 หลัก";

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      const token = await AsyncStorage.getItem("token");
      await axios.post(
        `${API_BASE_URL}/caregiver/create-elderly`,
        {
          name,
          phone,
          pin,
          birthDate: birthDate!.toISOString(),
          address,
          disease,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert("สำเร็จ", "เพิ่มผู้สูงอายุเรียบร้อย", [
        { text: "ตกลง", onPress: goToElderlyList },
      ]);
    } catch (e: any) {
      Alert.alert(
        "ผิดพลาด",
        e?.response?.data?.message || "ไม่สามารถบันทึกข้อมูลได้"
      );
    }
  };

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={goToElderlyList}>
          <Ionicons name="arrow-back" size={20} color="#1D4ED8" />
        </Pressable>
        <Text style={s.headerTitle}>เพิ่มผู้สูงอายุ</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Section: ข้อมูลส่วนตัว */}
        <View style={s.sectionLabel}>
          <Ionicons name="person" size={15} color="#1D4ED8" />
          <Text style={s.sectionText}>ข้อมูลส่วนตัว</Text>
        </View>

        <View style={s.card}>
          {/* ชื่อ */}
          <Text style={s.label}>
            ชื่อ-นามสกุล <Text style={s.req}>*</Text>
          </Text>
          <TextInput
            value={name}
            onChangeText={(v) => handleChange("name", v)}
            placeholder="เช่น นายสมชาย ใจดี"
            placeholderTextColor="#9CA3AF"
            style={[s.input, errors.name && s.inputErr]}
          />
          {errors.name && <Text style={s.errText}>{errors.name}</Text>}

          {/* วันเกิด */}
          <Text style={s.label}>
            วันเกิด <Text style={s.req}>*</Text>
          </Text>
          <Pressable
            style={[s.dateBox, errors.birthDate && s.inputErr]}
            onPress={() => setShowPicker(true)}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={birthDate ? "#1D4ED8" : "#9CA3AF"}
            />
            <Text style={[s.dateText, !birthDate && { color: "#9CA3AF" }]}>
              {birthDate
                ? `${formatDateThai(birthDate)}  (อายุ ${calculateAge(birthDate)} ปี)`
                : "เลือกวันเกิด"}
            </Text>
          </Pressable>
          {errors.birthDate && (
            <Text style={s.errText}>{errors.birthDate}</Text>
          )}

          {showPicker && (
            <DateTimePicker
              value={birthDate || new Date(1950, 0, 1)}
              mode="date"
              maximumDate={new Date()}
              onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                setShowPicker(Platform.OS === "ios");
                if (selectedDate) {
                  setBirthDate(selectedDate);
                  if (errors.birthDate)
                    setErrors({ ...errors, birthDate: null });
                }
              }}
            />
          )}

          {/* เบอร์โทร */}
          <Text style={s.label}>
            เบอร์โทรศัพท์ <Text style={s.req}>*</Text>
          </Text>
          <View style={[s.inputRow, errors.phone && s.inputErr]}>
            <Ionicons name="call-outline" size={16} color="#9CA3AF" />
            <TextInput
              value={phone}
              onChangeText={(v) => handleChange("phone", v)}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="เช่น 0812345678"
              placeholderTextColor="#9CA3AF"
              style={s.inputInner}
            />
          </View>
          {errors.phone && <Text style={s.errText}>{errors.phone}</Text>}

          {/* ที่อยู่ */}
          <Text style={s.label}>ที่อยู่</Text>
          <View style={s.inputRow}>
            <Ionicons name="location-outline" size={16} color="#9CA3AF" />
            <TextInput
              value={address}
              onChangeText={(v) => handleChange("address", v)}
              placeholder="55 หมู่ 7 ตำบลท่าศาลา"
              placeholderTextColor="#9CA3AF"
              style={s.inputInner}
            />
          </View>

          {/* โรคประจำตัว */}
          <Text style={s.label}>โรคประจำตัว</Text>
          <View style={s.inputRow}>
            <Ionicons name="medkit-outline" size={16} color="#9CA3AF" />
            <TextInput
              value={disease}
              onChangeText={(v) => handleChange("disease", v)}
              placeholder="เช่น เบาหวาน ความดันโลหิตสูง"
              placeholderTextColor="#9CA3AF"
              style={s.inputInner}
            />
          </View>
        </View>

        {/* Section: ข้อมูลเข้าใช้งาน */}
        <View style={s.sectionLabel}>
          <Ionicons name="lock-closed" size={15} color="#1D4ED8" />
          <Text style={s.sectionText}>ข้อมูลเข้าใช้งาน</Text>
        </View>

        <View style={s.card}>
          {/* ชื่อผู้ใช้ */}
          <Text style={s.label}>ชื่อผู้ใช้ (อัตโนมัติ)</Text>
          <View style={[s.inputRow, { backgroundColor: "#F1F5F9" }]}>
            <Ionicons name="person-outline" size={16} color="#9CA3AF" />
            <TextInput
              value={phone}
              editable={false}
              placeholder="ใช้เบอร์โทรศัพท์"
              placeholderTextColor="#9CA3AF"
              style={[s.inputInner, { color: "#94A3B8" }]}
            />
          </View>

          {/* PIN */}
          <Text style={s.label}>
            รหัสผ่าน (PIN) <Text style={s.req}>*</Text>
          </Text>
          <View style={[s.inputRow, errors.pin && s.inputErr]}>
            <Ionicons name="keypad-outline" size={16} color="#9CA3AF" />
            <TextInput
              value={pin}
              onChangeText={(v) => handleChange("pin", v)}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6 ตัวเลข"
              placeholderTextColor="#9CA3AF"
              style={s.inputInner}
            />
            <View style={s.pinDots}>
              {[...Array(6)].map((_, i) => (
                <View key={i} style={[s.dot, i < pin.length && s.dotFilled]} />
              ))}
            </View>
          </View>
          {errors.pin && <Text style={s.errText}>{errors.pin}</Text>}
        </View>

        {/* Buttons */}
        <View style={s.btnRow}>
          <Pressable style={s.cancelBtn} onPress={goToElderlyList}>
            <Text style={s.cancelText}>ยกเลิก</Text>
          </Pressable>
          <Pressable style={s.saveBtn} onPress={onSubmit}>
            <Ionicons name="checkmark-circle" size={20} color="white" />
            <Text style={s.saveBtnText}>บันทึก</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F9FF" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E0F0FF",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center", alignItems: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#1E3A5F" },

  sectionLabel: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginTop: 20, marginBottom: 8,
  },
  sectionText: { fontSize: 13, fontWeight: "700", color: "#1D4ED8" },

  card: {
    backgroundColor: "white",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    shadowColor: "#93C5FD",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },

  label: {
    fontSize: 13, color: "#374151",
    marginTop: 12, marginBottom: 6, fontWeight: "500",
  },
  req: { color: "#EF4444" },

  input: {
    backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#E2E8F0", fontSize: 14, color: "#1E293B",
  },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F8FAFC", borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  inputInner: { flex: 1, paddingVertical: 12, fontSize: 14, color: "#1E293B" },
  inputErr: { borderColor: "#EF4444", backgroundColor: "#FFF5F5" },
  errText: { color: "#EF4444", fontSize: 12, marginTop: 4 },

  dateBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  dateText: { flex: 1, fontSize: 14, color: "#1D4ED8", fontWeight: "500" },

  pinDots: { flexDirection: "row", gap: 4, marginLeft: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E2E8F0" },
  dotFilled: { backgroundColor: "#2563EB" },

  btnRow: {
    flexDirection: "row",
    marginHorizontal: 16, marginTop: 24, gap: 10,
  },
  cancelBtn: {
    flex: 1, backgroundColor: "white",
    borderWidth: 1, borderColor: "#E2E8F0",
    padding: 14, borderRadius: 14, alignItems: "center",
  },
  cancelText: { color: "#64748B", fontWeight: "600", fontSize: 15 },
  saveBtn: {
    flex: 2,
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
    backgroundColor: "#2563EB",
    padding: 14, borderRadius: 14,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
});