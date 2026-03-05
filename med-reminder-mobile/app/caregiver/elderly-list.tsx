import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { router } from "expo-router";
import { API_BASE_URL } from "../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";

type Elderly = {
  id: number;
  name: string;
  age: number;
  phone: string;
  address: string;
};

export default function ElderlyList() {
  const [data, setData] = useState<Elderly[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchElderly = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const res = await axios.get(`${API_BASE_URL}/caregiver/elderly`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data.items ?? []);
    } catch (e: any) {
      Alert.alert("ผิดพลาด", "ไม่สามารถดึงข้อมูลผู้สูงอายุได้");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchElderly();
    }, [])
  );

  const deleteElderly = async (id: number) => {
    try {
      const token = await AsyncStorage.getItem("token");
      await axios.delete(`${API_BASE_URL}/caregiver/elderly/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      Alert.alert("สำเร็จ", "ลบผู้สูงอายุเรียบร้อย");
      fetchElderly();
    } catch (e: any) {
      Alert.alert("ผิดพลาด", "ไม่สามารถลบผู้สูงอายุได้");
    }
  };

  // ── Logout ──
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

  const avatarColors = ["#2563EB", "#7C3AED", "#059669", "#DC2626", "#D97706"];
  const getColor = (id: number) => avatarColors[id % avatarColors.length];

  const renderItem = ({ item }: { item: Elderly }) => (
    <Pressable
      style={s.card}
      onPress={() =>
        router.push({
          pathname: "/caregiver/schedule",
          params: { elderlyId: String(item.id) },
        })
      }
    >
      <View style={[s.avatar, { backgroundColor: getColor(item.id) }]}>
        <Text style={s.avatarText}>{item.name?.charAt(0) ?? "?"}</Text>
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.name}>{item.name}</Text>
        <View style={s.infoRow}>
          <Ionicons name="person-outline" size={12} color="#6B7280" />
          <Text style={s.infoText}>อายุ {item.age ?? "-"} ปี</Text>
        </View>
        <View style={s.infoRow}>
          <Ionicons name="call-outline" size={12} color="#6B7280" />
          <Text style={s.infoText}>{item.phone}</Text>
        </View>
        <View style={s.infoRow}>
          <Ionicons name="location-outline" size={12} color="#6B7280" />
          <Text style={s.infoText} numberOfLines={1}>{item.address ?? "-"}</Text>
        </View>
      </View>

      <View style={s.actions}>
        <Pressable
          style={s.actionBtn}
          onPress={(e) => {
            e.stopPropagation();
            router.push({
              pathname: "/caregiver/(stack)/add-elderly",
              params: { elderlyId: String(item.id) },
            });
          }}
        >
          <Ionicons name="settings-outline" size={18} color="#2563EB" />
        </Pressable>

        <Pressable
          style={[s.actionBtn, s.actionBtnRed]}
          onPress={(e) => {
            e.stopPropagation();
            Alert.alert(
              "ยืนยันการลบ",
              `ต้องการลบ "${item.name}" หรือไม่?`,
              [
                { text: "ยกเลิก", style: "cancel" },
                { text: "ลบ", style: "destructive", onPress: () => deleteElderly(item.id) },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </Pressable>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={{ marginTop: 12, color: "#6B7280", fontSize: 14 }}>กำลังโหลด...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.container}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>ผู้สูงอายุ</Text>
            <Text style={s.subtitle}>ที่คุณดูแลอยู่</Text>
          </View>
          {/* badge จำนวน + ปุ่ม logout */}
          <View style={s.headerRight}>
            <View style={s.countBadge}>
              <Text style={s.countText}>{data.length} คน</Text>
            </View>
            <Pressable style={s.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            </Pressable>
          </View>
        </View>

        {data.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={64} color="#BFDBFE" />
            <Text style={s.emptyText}>ยังไม่มีผู้สูงอายุที่ดูแล</Text>
            <Text style={s.emptySubText}>กดปุ่ม + เพื่อเพิ่มผู้สูงอายุ</Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* FAB ปุ่มเพิ่มผู้สูงอายุ */}
        <Pressable
          onPress={() => router.push("/caregiver/(stack)/add-elderly")}
          style={s.fab}
        >
          <Ionicons name="add" size={28} color="white" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea:     { flex: 1, backgroundColor: "#F0F9FF" },
  container:    { flex: 1, paddingHorizontal: 16 },
  header:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 20 },
  title:        { fontSize: 26, fontWeight: "800", color: "#1E3A5F", lineHeight: 30 },
  subtitle:     { fontSize: 14, color: "#64748B", marginTop: 2 },
  headerRight:  { flexDirection: "row", alignItems: "center", gap: 8 },
  countBadge:   { backgroundColor: "#DBEAFE", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  countText:    { color: "#1D4ED8", fontWeight: "700", fontSize: 14 },
  logoutBtn:    { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFF5F5", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FEE2E2" },
  card:         { flexDirection: "row", backgroundColor: "white", padding: 14, borderRadius: 16, marginBottom: 10, alignItems: "center", shadowColor: "#93C5FD", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 },
  avatar:       { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  avatarText:   { color: "white", fontSize: 20, fontWeight: "800" },
  name:         { fontSize: 16, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  infoRow:      { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  infoText:     { fontSize: 12, color: "#6B7280", flexShrink: 1 },
  actions:      { gap: 8, marginLeft: 8 },
  actionBtn:    { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center" },
  actionBtnRed: { backgroundColor: "#FFF5F5" },
  empty:        { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText:    { fontSize: 16, color: "#64748B", fontWeight: "600" },
  emptySubText: { fontSize: 13, color: "#9CA3AF" },
  fab:          { position: "absolute", bottom: 24, alignSelf: "center", backgroundColor: "#2563EB", width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center", shadowColor: "#2563EB", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  center:       { flex: 1, justifyContent: "center", alignItems: "center" },
});
