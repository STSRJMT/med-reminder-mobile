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
} from "react-native";
import { router } from "expo-router";
import axios from "axios";
import { API_BASE_URL } from "../src/config";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        {
          text: "ตกลง",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (e: any) {
      console.log("SIGNUP ERROR:", e?.response?.data || e.message);
      Alert.alert(
        "สมัครสมาชิกไม่สำเร็จ",
        e?.response?.data?.message || "เกิดข้อผิดพลาด"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#EAF6FF" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, justifyContent: "center", padding: 22 }}>
          {/* title */}
          <Text
            style={{
              fontSize: 26,
              fontWeight: "800",
              color: "#1E3A8A",
              textAlign: "center",
            }}
          >
            ระบบแจ้งเตือนการกินยา
          </Text>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              textAlign: "center",
              marginTop: 6,
            }}
          >
            สมัครสมาชิก
          </Text>

          {/* name */}
          <Text style={{ marginTop: 20, marginBottom: 6 }}>ชื่อ-นามสกุล</Text>
          <TextInput
            placeholder="กรอกชื่อผู้ใช้งาน"
            value={name}
            onChangeText={setName}
            style={inputStyle}
          />

          {/* email */}
          <Text style={{ marginTop: 12, marginBottom: 6 }}>
            ชื่อผู้ใช้ (อีเมล)
          </Text>
          <TextInput
            placeholder="กรอกอีเมล"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={inputStyle}
          />

          {/* password */}
          <Text style={{ marginTop: 12, marginBottom: 6 }}>รหัสผ่าน</Text>
          <TextInput
            placeholder="กรอกรหัสผ่าน"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={inputStyle}
          />

          <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
            รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร
          </Text>

          {/* submit */}
          <Pressable
            onPress={onSignup}
            disabled={loading}
            style={{
              backgroundColor: "black",
              borderRadius: 14,
              paddingVertical: 16,
              marginTop: 24,
              alignItems: "center",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: "white", fontWeight: "800" }}>
                สมัครสมาชิก
              </Text>
            )}
          </Pressable>

          {/* back */}
          <Pressable onPress={() => router.back()} style={{ marginTop: 18 }}>
            <Text
              style={{
                color: "#2563EB",
                textAlign: "center",
                fontWeight: "700",
              }}
            >
              กลับไปหน้าเข้าสู่ระบบ
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const inputStyle = {
  backgroundColor: "white",
  borderRadius: 12,
  padding: 12,
  borderWidth: 1,
  borderColor: "#E5E7EB",
};
