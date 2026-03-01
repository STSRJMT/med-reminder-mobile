import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../../src/config";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";

/* ---------- types ---------- */
type Elderly = {
  id: number;
  name: string;
  age: number | null;
};

type Schedule = {
  id: number;
  time_hhmm: string;
  medication_name: string;
  dosage: string | null;
  notes: string | null;
};

export default function CaregiverSchedule() {
  const router = useRouter();

  const [elderlyList, setElderlyList] = useState<Elderly[]>([]);
  const [selectedElderly, setSelectedElderly] =
    useState<Elderly | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);

  const [selectedSchedule, setSelectedSchedule] =
    useState<Schedule | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  /* ---------- load elderly ---------- */
  const fetchElderly = async () => {
    const token = await AsyncStorage.getItem("token");

    const res = await axios.get(
      `${API_BASE_URL}/caregiver/elderly`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const list = res.data.items || [];
    setElderlyList(list);

    if (!selectedElderly && list.length > 0) {
      setSelectedElderly(list[0]);
      await fetchSchedules(list[0].id);
    }
  };

  /* ---------- load schedules ---------- */
  const fetchSchedules = async (elderlyId: number) => {
    const token = await AsyncStorage.getItem("token");

    const res = await axios.get(
      `${API_BASE_URL}/caregiver/schedules?elderlyId=${elderlyId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setSchedules(res.data.items || []);
  };

  /* ---------- delete ---------- */
  const handleDelete = async (scheduleId: number) => {
    Alert.alert("ยืนยันการลบ", "ต้องการลบรายการนี้หรือไม่?", [
      { text: "ยกเลิก", style: "cancel" },
      {
        text: "ลบ",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem("token");

            await axios.delete(
              `${API_BASE_URL}/caregiver/schedules/${scheduleId}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );

            setShowDetail(false);
            await fetchSchedules(selectedElderly!.id);
            Alert.alert("ลบสำเร็จ");
          } catch {
            Alert.alert("ลบไม่สำเร็จ");
          }
        },
      },
    ]);
  };

  /* ---------- reload when focus ---------- */
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        try {
          setLoading(true);
          await fetchElderly();
        } catch {
          Alert.alert("โหลดข้อมูลไม่ได้");
        } finally {
          setLoading(false);
        }
      };
      load();
    }, [])
  );

  /* ---------- select elderly ---------- */
  const selectElderly = async (item: Elderly) => {
    setSelectedElderly(item);
    setShowDropdown(false);
    await fetchSchedules(item.id);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>ตารางยา</Text>

      {/* ===== Selector Row ===== */}
      <View style={styles.manageRow}>
        <Pressable
          style={styles.dropdown}
          onPress={() => setShowDropdown(true)}
        >
          <Text style={styles.dropdownText}>
            {selectedElderly
              ? `${selectedElderly.name} ${
                  selectedElderly.age
                    ? `(${selectedElderly.age} ปี)`
                    : ""
                }`
              : "ไม่มีผู้สูงอายุ"}
          </Text>
          <Ionicons name="chevron-down" size={16} />
        </Pressable>

        <Pressable
          style={[
            styles.addBtn,
            !selectedElderly && { opacity: 0.5 },
          ]}
          disabled={!selectedElderly}
          onPress={() =>
            router.push({
              pathname: "/caregiver/(stack)/add-schedule",
              params: {
                elderlyId: selectedElderly?.id,
                elderlyName: selectedElderly?.name,
              },
            })
          }
        >
          <Ionicons name="add" size={20} color="white" />
        </Pressable>
      </View>

      {/* ===== Schedule List ===== */}
      {schedules.length === 0 ? (
        <Text style={{ marginTop: 20 }}>ไม่พบตารางยา</Text>
      ) : (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => {
                setSelectedSchedule(item);
                setShowDetail(true);
              }}
            >
              <Ionicons name="medical" size={22} color="#2563EB" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.medName}>
                  {item.medication_name}
                </Text>
                {item.dosage && (
                  <Text>ขนาดยา: {item.dosage}</Text>
                )}
                <Text style={styles.time}>
                  เวลา: {item.time_hhmm}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* ===== Dropdown Modal ===== */}
      <Modal visible={showDropdown} transparent animationType="fade">
        <Pressable
          style={styles.overlay}
          onPress={() => setShowDropdown(false)}
        >
          <View style={styles.dropdownModal}>
            {elderlyList.map((item) => (
              <Pressable
                key={item.id}
                style={styles.dropdownItem}
                onPress={() => selectElderly(item)}
              >
                <Text style={{ fontSize: 16 }}>
                  {item.name}{" "}
                  {item.age ? `(${item.age} ปี)` : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* ===== Detail Modal ===== */}
      <Modal visible={showDetail} transparent animationType="slide">
        <View style={styles.detailOverlay}>
          <View style={styles.detailBox}>

            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={styles.detailTitle}>
                {selectedSchedule?.medication_name}
              </Text>

              <View style={{ flexDirection: "row" }}>
                <Pressable
                  style={{ marginRight: 12 }}
                  onPress={() => {
                    setShowDetail(false);
                    router.push({
                      pathname: "/caregiver/(stack)/add-schedule",
                      params: {
                        editMode: "true",
                        scheduleId: selectedSchedule?.id,
                      },
                    });
                  }}
                >
                  <Ionicons name="create-outline" size={22} />
                </Pressable>

                <Pressable
                  onPress={() =>
                    selectedSchedule &&
                    handleDelete(selectedSchedule.id)
                  }
                >
                  <Ionicons name="trash-outline" size={22} color="red" />
                </Pressable>
              </View>
            </View>

            {selectedSchedule?.dosage && (
              <Text style={{ marginTop: 10 }}>
                ขนาดยา: {selectedSchedule.dosage}
              </Text>
            )}

            <Text style={{ marginTop: 10 }}>
              เวลา: {selectedSchedule?.time_hhmm}
            </Text>

            {selectedSchedule?.notes && (
              <Text style={{ marginTop: 10 }}>
                หมายเหตุ: {selectedSchedule.notes}
              </Text>
            )}

            <Pressable
              style={styles.closeBtn}
              onPress={() => setShowDetail(false)}
            >
              <Text style={{ color: "white" }}>ปิด</Text>
            </Pressable>

          </View>
        </View>
      </Modal>

    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF6FF", padding: 16 },
  header: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
  },
  manageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 10,
    borderRadius: 10,
  },
  dropdownText: { fontWeight: "600" },
  addBtn: {
    backgroundColor: "black",
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  medName: { fontWeight: "700", fontSize: 16 },
  time: { marginTop: 6, fontWeight: "600" },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 20,
  },
  dropdownModal: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
  },
  dropdownItem: { paddingVertical: 12 },

  detailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  detailBox: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeBtn: {
    marginTop: 20,
    backgroundColor: "#2563EB",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});