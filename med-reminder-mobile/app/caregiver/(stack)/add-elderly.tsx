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
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age;
  };

  const handleChange = (field: string, value: string) => {
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }

    switch (field) {
      case "name":
        setName(value);
        break;
      case "phone":
        setPhone(value);
        break;
      case "address":
        setAddress(value);
        break;
      case "disease":
        setDisease(value);
        break;
      case "pin":
        setPin(value);
        break;
    }
  };

  const onSubmit = async () => {
    let newErrors: any = {};

    if (!name) newErrors.name = "กรุณากรอกชื่อ-นามสกุล";

    if (!birthDate) newErrors.birthDate = "กรุณาเลือกวันเกิด";

    if (!phone) {
      newErrors.phone = "กรุณากรอกเบอร์โทร";
    } else if (!/^[0-9]{10}$/.test(phone)) {
      newErrors.phone = "เบอร์โทรต้องเป็นตัวเลข 10 หลัก";
    }

    if (!pin) {
      newErrors.pin = "กรุณากรอก PIN";
    } else if (!/^[0-9]{6}$/.test(pin)) {
      newErrors.pin = "PIN ต้องเป็นตัวเลข 6 หลัก";
    }

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
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      Alert.alert("สำเร็จ", "เพิ่มผู้สูงอายุเรียบร้อย");
      router.back();
    } catch (e: any) {
      Alert.alert(
        "ผิดพลาด",
        e?.response?.data?.message || "ไม่สามารถบันทึกข้อมูลได้"
      );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>เพิ่มผู้สูงอายุ</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.title}>ลงทะเบียนผู้สูงอายุ</Text>

      <Text style={styles.label}>ชื่อ-นามสกุล</Text>
      <TextInput
        value={name}
        onChangeText={(v) => handleChange("name", v)}
        placeholder="เช่น นายสมชาย ใจดี"
        style={[
          styles.input,
          errors.name && { borderColor: "red" },
        ]}
      />
      {errors.name && <Text style={styles.error}>{errors.name}</Text>}

      <Text style={styles.label}>วันเกิด</Text>
      <Pressable
        style={[
          styles.input,
          errors.birthDate && { borderColor: "red" },
        ]}
        onPress={() => setShowPicker(true)}
      >
        <Text>
          {birthDate
            ? `วันเกิด: ${birthDate.toLocaleDateString()} (อายุ ${calculateAge(
                birthDate
              )} ปี)`
            : "เลือกวันเกิด"}
        </Text>
      </Pressable>
      {errors.birthDate && (
        <Text style={styles.error}>{errors.birthDate}</Text>
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
              if (errors.birthDate) {
                setErrors({ ...errors, birthDate: null });
              }
            }
          }}
        />
      )}

      <Text style={styles.label}>เบอร์โทรศัพท์ (ใช้เข้าสู่ระบบ)</Text>
      <TextInput
        value={phone}
        onChangeText={(v) => handleChange("phone", v)}
        keyboardType="number-pad"
        maxLength={10}
        placeholder="เช่น 0812345678"
        style={[
          styles.input,
          errors.phone && { borderColor: "red" },
        ]}
      />
      {errors.phone && <Text style={styles.error}>{errors.phone}</Text>}

      <Text style={styles.label}>ที่อยู่</Text>
      <TextInput
        placeholder="55 หมู่ 7 ตำบลท่าศาลา"
        value={address}
        onChangeText={(v) => handleChange("address", v)}
        style={styles.input}
      />

      <Text style={styles.label}>โรคประจำตัว</Text>
      <TextInput
        placeholder="เบาหวาน ความดันโลหิตสูง ไขมันในเลือดสูง"
        value={disease}
        onChangeText={(v) => handleChange("disease", v)}
        style={styles.input}
      />

      <Text style={styles.section}>ข้อมูลเข้าใช้งาน</Text>

      <Text style={styles.label}>ชื่อผู้ใช้ (อัตโนมัติ)</Text>
      <TextInput value={phone} editable={false} style={styles.disabled} />

      <Text style={styles.label}>รหัสผ่าน (PIN)</Text>
      <TextInput
        value={pin}
        onChangeText={(v) => handleChange("pin", v)}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        placeholder="6 ตัวเลข"
        style={[
          styles.input,
          errors.pin && { borderColor: "red" },
        ]}
      />
      {errors.pin && <Text style={styles.error}>{errors.pin}</Text>}

      <Pressable style={styles.button} onPress={onSubmit}>
        <Text style={styles.buttonText}>บันทึก</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF6FF", padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  title: { fontSize: 20, fontWeight: "800", marginVertical: 12 },
  label: { marginTop: 12, marginBottom: 4, fontWeight: "600" },
  section: { marginTop: 20, fontWeight: "800" },
  input: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  disabled: {
    backgroundColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
  },
  error: {
    color: "red",
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    backgroundColor: "#3B82F6",
    padding: 16,
    borderRadius: 14,
    marginTop: 24,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "800", fontSize: 16 },
});
