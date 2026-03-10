import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import axios from "axios";
import { API_BASE_URL } from "../src/config";

export default function Index() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // เช็คว่าเป็น email (ผู้ดูแล) หรือ phone (ผู้สูงอายุ)
  const isEmail = (value: string) => value.includes("@");

  const onLogin = async () => {
    if (!username || !password) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    try {
      setLoading(true);

      // 🔹 ผู้ดูแล (email + password)
      if (isEmail(username)) {
        const res = await axios.post(`${API_BASE_URL}/auth/login`, {
          email: username,
          password,
        });

        await AsyncStorage.setItem("token", res.data.token);
        await AsyncStorage.setItem("role", "caregiver");

        // ✅ เข้า Tab ผู้ดูแล → จัดการผู้สูงอายุ
        router.replace("/caregiver/dashboard");

      }

      // 🔹 ผู้สูงอายุ (phone + pin)
      else {
        const res = await axios.post(`${API_BASE_URL}/auth/login-elderly`, {
          phone: username,
          pin: password,
        });

        await AsyncStorage.setItem("token", res.data.token);
        await AsyncStorage.setItem("role", "elderly");
        await AsyncStorage.setItem("elderlyId", String(res.data.elderlyId));

        await new Promise(resolve => setTimeout(resolve, 100));


        // ✅ เข้า Today ของผู้สูงอายุคนนั้น
        router.replace(`/elderly/${res.data.elderlyId}/today`);
      }
    } catch (e: any) {
      Alert.alert(
        "เข้าสู่ระบบไม่สำเร็จ",
        e?.response?.data?.message || "ข้อมูลไม่ถูกต้อง"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          {/* Title */}
          <Text style={styles.title}>ระบบแจ้งเตือนการกินยา</Text>

          <Text style={styles.subtitle}>เข้าสู่ระบบ</Text>

          {/* Username */}
          <Text style={styles.label}>ชื่อผู้ใช้</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="อีเมล หรือ เบอร์โทรศัพท์"
            autoCapitalize="none"
            style={styles.input}
          />

          {/* Password / PIN */}
          <Text style={[styles.label, { marginTop: 12 }]}>รหัสผ่าน</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="รหัสผ่าน / PIN"
            secureTextEntry
            style={styles.input}
          />

          {/* Login Button */}
          <Pressable
            onPress={onLogin}
            disabled={loading}
            style={[
              styles.button,
              { opacity: loading ? 0.7 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
            )}
          </Pressable>

          {/* Signup */}
          <Pressable onPress={() => router.push("/signup")}>
            <Text style={styles.signupText}>
              ยังไม่มีบัญชีผู้ดูแล? สมัครสมาชิก
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* =======================
   Styles
======================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF6FF",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1E3A8A",
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginVertical: 10,
    fontSize: 16,
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  button: {
    backgroundColor: "black",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 18,
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  signupText: {
    textAlign: "center",
    color: "#2563EB",
    marginTop: 16,
    fontWeight: "600",
  },
});
