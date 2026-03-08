import { Stack } from "expo-router";
import { useEffect } from "react";
import { registerFCMToken } from "../src/useFCMToken";

export default function RootLayout() {
  useEffect(() => {
    console.log("calling registerFCMToken...");
    registerFCMToken().then(() => {
      console.log("registerFCMToken done");
    });
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}