import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

export type ScheduleItem = {
  scheduleId: number;
  timeHHMM: string;
  medicationName: string;
  dosage: string | null;
  daysOfWeek: string | null; // ✅ เพิ่ม
};

if (typeof (Notifications as any).setNotificationHandler === "function") {
  (Notifications as any).setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("medicine", {
      name: "แจ้งเตือนกินยา",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return true;
}

export async function scheduleAllNotifications(items: ScheduleItem[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const granted = await requestNotificationPermission();
  if (!granted) return;

  let count = 0;
  const now = new Date();

  for (const item of items) {
    const [hh, mm] = item.timeHHMM.split(":").map(Number);
    const medText = `${item.medicationName}${item.dosage ? ` · ${item.dosage}` : ""}`;

    // ✅ แปลง daysOfWeek เป็น array ของตัวเลข เช่น [1,2,3,4,5]
    const allowedDays: number[] | null = item.daysOfWeek
      ? item.daysOfWeek.split(",").map(d => parseInt(d.trim()))
      : null; // null = ทุกวัน

    for (let day = 0; day < 7; day++) {
      const base = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + day,
        hh,
        mm,
        0
      );

      // ✅ เช็คว่าวันนั้นต้องกินมั้ย
      if (allowedDays !== null && !allowedDays.includes(base.getDay())) {
        continue; // ข้ามวันที่ไม่ต้องกิน
      }

      // ครั้งที่ 1 — ตรงเวลา
      if (base > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "💊 ถึงเวลากินยาแล้ว",
            body: `กรุณากิน ${medText} ได้เลยครับ`,
            sound: "default",
            data: { scheduleId: item.scheduleId, timeHHMM: item.timeHHMM, medicationName: item.medicationName },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: base,
            channelId: "medicine",
          },
        });
        count++;
      }

      // ครั้งที่ 2 — +5 นาที
      const plus5 = new Date(base.getTime() + 5 * 60 * 1000);
      if (plus5 > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "⏰ อย่าลืมกินยานะคะ",
            body: `${medText} ยังรอคุณอยู่นะครับ`,
            sound: "default",
            data: { scheduleId: item.scheduleId, timeHHMM: item.timeHHMM, medicationName: item.medicationName },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: plus5,
            channelId: "medicine",
          },
        });
        count++;
      }

      // ครั้งที่ 3 — +10 นาที
      const plus10 = new Date(base.getTime() + 10 * 60 * 1000);
      if (plus10 > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "🔔 เตือนครั้งสุดท้าย",
            body: `${medText} ยังไม่ได้กินเลยนะครับ`,
            sound: "default",
            data: { scheduleId: item.scheduleId, timeHHMM: item.timeHHMM, medicationName: item.medicationName },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: plus10,
            channelId: "medicine",
          },
        });
        count++;
      }
    }
  }

  console.log("total notifications scheduled:", count);
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}