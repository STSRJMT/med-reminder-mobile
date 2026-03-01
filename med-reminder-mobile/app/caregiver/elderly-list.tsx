import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { router } from "expo-router";
import { API_BASE_URL } from "../../src/config";
import { useFocusEffect } from "@react-navigation/native";

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

  /* ---------- fetch ---------- */
  const fetchElderly = async () => {
    try {
      const token = await AsyncStorage.getItem("token");

      const res = await axios.get(`${API_BASE_URL}/caregiver/elderly`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setData(res.data.items);
    } catch (e: any) {
      console.log(e?.response?.data || e.message);
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

  /* ---------- delete ---------- */
  const deleteElderly = async (id: number) => {
    try {
      const token = await AsyncStorage.getItem("token");

      await axios.delete(`${API_BASE_URL}/caregiver/elderly/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      Alert.alert("สำเร็จ", "ลบผู้สูงอายุเรียบร้อย");
      fetchElderly();
    } catch (e: any) {
      console.log(e?.response?.data || e.message);
      Alert.alert("ผิดพลาด", "ไม่สามารถลบผู้สูงอายุได้");
    }
  };

  /* ---------- render ---------- */
  const renderItem = ({ item }: { item: Elderly }) => (
    <Pressable
      style={styles.card}
      onPress={() =>
        router.push(`/caregiver/schedule?elderlyId=${item.id}`)
      }
    >
      <Ionicons name="person-circle" size={42} color="#2563EB" />

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.text}>อายุ {item.age ?? "-"} ปี</Text>
        <Text style={styles.text}>{item.phone}</Text>
        <Text style={styles.text}>{item.address ?? "-"}</Text>
      </View>

      {/* ปุ่มขวา */}
      <View style={{ gap: 14 }}>
        {/* ⚙️ */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            router.push(`/elderly/${item.id}/today`);
          }}
        >
          <Ionicons name="settings-outline" size={22} color="#374151" />
        </Pressable>

        {/* 🗑 */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            Alert.alert(
              "ยืนยันการลบ",
              "ต้องการลบผู้สูงอายุคนนี้หรือไม่?",
              [
                { text: "ยกเลิก", style: "cancel" },
                {
                  text: "ลบ",
                  style: "destructive",
                  onPress: () => deleteElderly(item.id),
                },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={22} color="red" />
        </Pressable>
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>รายชื่อผู้สูงอายุที่ดูแล</Text>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <Pressable
        onPress={() => router.push("/caregiver/add-elderly")}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="white" />
      </Pressable>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF6FF",
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
  },
  text: {
    fontSize: 13,
    color: "#374151",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    backgroundColor: "#2563EB",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});