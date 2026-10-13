// src/services/cacheService.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { HasilGeocoding } from "../types/geocoding";
import { DataCuacaLengkap, DataKualitasUdara } from "../types/weather";

const KUNCI_KOTA = "@jelajah_aman:cache_kota";
const KUNCI_CUACA = "@jelajah_aman:cache_cuaca";

export interface CuacaTersimpan {
  cuaca: DataCuacaLengkap;
  kualitasUdara: DataKualitasUdara;
  waktuSimpan: string; // format ISO
}

function kunciKoordinat(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function bacaDaftarKota(): Promise<HasilGeocoding[]> {
  const json = await AsyncStorage.getItem(KUNCI_KOTA);
  return json ? JSON.parse(json) : [];
}

export async function simpanKota(daftar: HasilGeocoding[]): Promise<void> {
  const semua = await bacaDaftarKota();
  for (const kota of daftar) {
    if (!semua.some((k) => k.id === kota.id)) semua.push(kota);
  }
  await AsyncStorage.setItem(KUNCI_KOTA, JSON.stringify(semua));
}

export async function cariKotaTersimpan(nama: string): Promise<HasilGeocoding[]> {
  const kata = nama.trim().toLowerCase();
  const semua = await bacaDaftarKota();
  return semua.filter((k) => k.name.toLowerCase().includes(kata)).slice(0, 5);
}

export async function simpanCuaca(
  latitude: number,
  longitude: number,
  cuaca: DataCuacaLengkap,
  kualitasUdara: DataKualitasUdara
): Promise<void> {
  const json = await AsyncStorage.getItem(KUNCI_CUACA);
  const semua: Record<string, CuacaTersimpan> = json ? JSON.parse(json) : {};
  semua[kunciKoordinat(latitude, longitude)] = {
    cuaca,
    kualitasUdara,
    waktuSimpan: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KUNCI_CUACA, JSON.stringify(semua));
}

export async function ambilCuacaTersimpan(
  latitude: number,
  longitude: number
): Promise<CuacaTersimpan | null> {
  const json = await AsyncStorage.getItem(KUNCI_CUACA);
  const semua: Record<string, CuacaTersimpan> = json ? JSON.parse(json) : {};
  return semua[kunciKoordinat(latitude, longitude)] ?? null;
}