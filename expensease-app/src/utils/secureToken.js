// SecureStore + AsyncStorage fallback helpers
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function setSecureItem(key, value) {
  try { await SecureStore.setItemAsync(key, value); }
  catch { await AsyncStorage.setItem(key, value); }
}
export async function getSecureItem(key) {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v != null) return v;
  } catch {}
  return AsyncStorage.getItem(key);
}
export async function deleteSecureItem(key) {
  try { await SecureStore.deleteItemAsync(key); }
  catch { await AsyncStorage.removeItem(key); }
}
