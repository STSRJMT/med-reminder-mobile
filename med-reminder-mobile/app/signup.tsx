import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import axios from "axios";
import { API_BASE_URL } from "../src/config";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSignup = async () => {
    if (!name || !email || !password) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (password.length < 6) {
      Alert.alert("แจ้งเตือน", "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${API_BASE_URL}/auth/register-caregiver`, {
        name,
        email,
        password,
      });
      Alert.alert("สำเร็จ", "สมัครสมาชิกเรียบร้อยแล้ว", [
        { text: "ตกลง", onPress: () => router.replace("/") },
      ]);
    } catch (e: any) {
      Alert.alert(
        "สมัครสมาชิกไม่สำเร็จ",
        e?.response?.data?.message || "เกิดข้อผิดพลาด"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.content}>

          {/* Logo + Title */}
          <View style={s.logoWrap}>
            <View style={s.logoCircle}>
              <Ionicons name="person-add" size={34} color="white" />
            </View>
            <Text style={s.appName}>ระบบแจ้งเตือนการกินยา</Text>
            <Text style={s.appSub}>Med Reminder</Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>สมัครสมาชิก</Text>
            <Text style={s.cardSub}>สำหรับผู้ดูแลผู้สูงอายุ</Text>

            {/* ชื่อ-นามสกุล */}
            <Text style={s.label}>ชื่อ-นามสกุล</Text>
            <View style={s.inputRow}>
              <Ionicons name="person-outline" size={18} color="#9CA3AF" />
              <TextInput
                placeholder="กรอกชื่อผู้ใช้งาน"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                style={s.inputInner}
              />
            </View>

            {/* อีเมล */}
            <Text style={[s.label, { marginTop: 14 }]}>ชื่อผู้ใช้ (อีเมล)</Text>
            <View style={s.inputRow}>
              <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
              <TextInput
                placeholder="กรอกอีเมล"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={s.inputInner}
              />
            </View>

            {/* รหัสผ่าน */}
            <Text style={[s.label, { marginTop: 14 }]}>รหัสผ่าน</Text>
            <View style={s.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
              <TextInput
                placeholder="อย่างน้อย 6 ตัวอักษร"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                style={s.inputInner}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#9CA3AF"
                />
              </Pressable>
            </View>
            <Text style={s.hint}>รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร</Text>

            {/* Submit */}
            <Pressable
              onPress={onSignup}
              disabled={loading}
              style={[s.submitBtn, loading && { opacity: 0.7 }]}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                  <Text style={s.submitText}>สมัครสมาชิก</Text>
                </>
              )}
            </Pressable>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>หรือ</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Back */}
            <Pressable style={s.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={16} color="#2563EB" />
              <Text style={s.backText}>กลับไปหน้าเข้าสู่ระบบ</Text>
            </Pressable>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F0F9FF" },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },

  // Logo
  logoWrap: { alignItems: "center", marginBottom: 28 },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: { fontSize: 22, fontWeight: "800", color: "#1E3A5F", textAlign: "center" },
  appSub: { fontSize: 13, color: "#64748B", marginTop: 4, fontWeight: "500" },

  // Card
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#93C5FD",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  cardTitle: { fontSize: 20, fontWeight: "800", color: "#1E3A5F" },
  cardSub: { fontSize: 13, color: "#94A3B8", marginTop: 4, marginBottom: 20 },

  // Label & Input
  label: { fontSize: 13, color: "#374151", marginBottom: 8, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  inputInner: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
    color: "#1E293B",
  },
  hint: { fontSize: 12, color: "#94A3B8", marginTop: 6 },

  // Submit
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    padding: 15,
    borderRadius: 12,
    marginTop: 22,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitText: { color: "white", fontWeight: "700", fontSize: 16 },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    gap: 10,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#F1F5F9" },
  dividerText: { color: "#CBD5E1", fontSize: 12, fontWeight: "500" },

  // Back
  backBtn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 },
  backText: { color: "#2563EB", fontWeight: "700", fontSize: 14 },
});