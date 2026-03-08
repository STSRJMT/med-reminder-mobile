import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "./config";

export async function registerFCMToken() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "afef8cc6-4da9-4992-8332-1fa7949f8c3c",
    });

    const token = tokenData.data;
    const authToken = await AsyncStorage.getItem("token");
    const role = await AsyncStorage.getItem("role");

    // ✅ ส่งเฉพาะตอนที่ login เป็น caregiver เท่านั้น
    if (!token || !authToken || role !== "caregiver") return;

    await axios.post(
      `${API_BASE_URL}/caregiver/fcm-token`,
      { token },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    console.log("Push token registered:", token);
  } catch (err) {
    console.error("Push token error:", err);
  }
}