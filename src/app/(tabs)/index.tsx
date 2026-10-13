// src/app/(tabs)/index.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, ActivityIndicator, Button, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import SearchBox from "../../../components/SearchBox";
import WeatherCard from "../../../components/WeatherCard";
import AtribusiCuaca from "../../../components/AtribusiCuaca";
import { useDebounce } from "../../hooks/use-debounce";
import { cariKota } from "../../services/geocodingService";
import { ambilCuaca } from "../../services/weatherService";
import { ambilKualitasUdara } from "../../services/airQualityService";
import { konversiTingkatAQI } from "../../services/weatherAdapter";
import { mintaIzinLokasi, ambilKoordinatSaatIni } from "../../services/locationService";
import { ambilSemuaFavorit } from "../../services/favoritStorage";
import {
  simpanKota,
  cariKotaTersimpan,
  simpanCuaca,
  ambilCuacaTersimpan,
} from "../../services/cacheService";
import { labelKodeCuaca } from "../../constants/weatherCodes";
import { HasilGeocoding } from "../../types/geocoding";
import { DataCuacaLengkap, DataKualitasUdara } from "../../types/weather";

export default function HalamanUtama() {
  const [teksCari, setTeksCari] = useState("");
  const [hasilPencarian, setHasilPencarian] = useState<HasilGeocoding[]>([]);
  const [kotaTerpilih, setKotaTerpilih] = useState<HasilGeocoding | null>(null);
  const [cuaca, setCuaca] = useState<DataCuacaLengkap | null>(null);
  const [kualitasUdara, setKualitasUdara] = useState<DataKualitasUdara | null>(null);
  const [sedangMemuat, setSedangMemuat] = useState(false);
  const [pesanError, setPesanError] = useState<string | null>(null);
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);
  const [sudahFavorit, setSudahFavorit] = useState(false);
  const [pencarianOffline, setPencarianOffline] = useState(false);
  const [waktuData, setWaktuData] = useState<string | null>(null);

  const teksTertunda = useDebounce(teksCari, 500);
  const requestIdRef = useRef(0); // pencegah race condition

  useEffect(() => {
    if (teksTertunda.trim().length === 0) {
      setHasilPencarian([]);
      setPencarianOffline(false);
      return;
    }
    cariKota(teksTertunda)
      .then((hasil) => {
        setHasilPencarian(hasil);
        setPencarianOffline(false);
        simpanKota(hasil).catch(() => {});
      })
      .catch(async () => {
        // gagal (offline) -> cari di kota yang pernah tersimpan
        const lokal = await cariKotaTersimpan(teksTertunda);
        setHasilPencarian(lokal);
        setPencarianOffline(true);
      });
  }, [teksTertunda]);

  useFocusEffect(
    useCallback(() => {
      if (!kotaTerpilih) {
        setSudahFavorit(false);
        return;
      }
      ambilSemuaFavorit().then((daftar) => {
        setSudahFavorit(daftar.some((k) => k.id === kotaTerpilih.id));
      });
    }, [kotaTerpilih])
  );

  async function pilihKota(kota: HasilGeocoding) {
    setKotaTerpilih(kota);
    const idSaatIni = ++requestIdRef.current;
    setSedangMemuat(true);
    setPesanError(null);
    setWaktuData(null);

    try {
      const [dataCuaca, dataAQI] = await Promise.all([
        ambilCuaca(kota.latitude, kota.longitude),
        ambilKualitasUdara(kota.latitude, kota.longitude),
      ]);

      if (idSaatIni !== requestIdRef.current) return; // hasil basi, abaikan
      setCuaca(dataCuaca);
      setKualitasUdara(dataAQI);
      simpanCuaca(kota.latitude, kota.longitude, dataCuaca, dataAQI).catch(() => {});
    } catch (err) {
      if (idSaatIni !== requestIdRef.current) return;
      // gagal (offline) -> coba pakai data tersimpan
      const tersimpan = await ambilCuacaTersimpan(kota.latitude, kota.longitude);
      if (idSaatIni !== requestIdRef.current) return;
      if (tersimpan) {
        setCuaca(tersimpan.cuaca);
        setKualitasUdara(tersimpan.kualitasUdara);
        setWaktuData(tersimpan.waktuSimpan);
      } else {
        setCuaca(null);
        setKualitasUdara(null);
        setPesanError("Tidak ada koneksi dan belum ada data tersimpan untuk kota ini.");
      }
    } finally {
      if (idSaatIni === requestIdRef.current) setSedangMemuat(false);
    }
  }

  async function gunakanLokasiSaatIni() {
    const status = await mintaIzinLokasi();

    if (status === "denied") {
      setPesanLokasi("Izin lokasi ditolak. Silakan cari kota secara manual di atas.");
      return;
    }
    if (status === "unavailable") {
      setPesanLokasi("Layanan lokasi tidak aktif di perangkat ini. Silakan cari kota secara manual.");
      return;
    }

    setPesanLokasi(null);
    const koordinat = await ambilKoordinatSaatIni();
    pilihKota({
      id: -1,
      name: "Lokasi Saat Ini",
      latitude: koordinat.latitude,
      longitude: koordinat.longitude,
      country: "",
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 16 }}>
      <SearchBox onCari={setTeksCari} />

      <Button title="Gunakan Lokasi Saat Ini" onPress={gunakanLokasiSaatIni} />
      {pesanLokasi && <Text>{pesanLokasi}</Text>}

      {pencarianOffline && (
        <Text style={{ fontSize: 12, color: "#B45309" }}>
          Mode offline: pencarian hanya dari kota yang pernah dicari sebelumnya.
        </Text>
      )}
      {pencarianOffline && hasilPencarian.length === 0 && (
        <Text>Kota tidak ditemukan di data tersimpan</Text>
      )}

      {hasilPencarian.map((kota) => (
        <TouchableOpacity key={kota.id} onPress={() => pilihKota(kota)}>
          <Text>{kota.name}</Text>
        </TouchableOpacity>
      ))}

      {sedangMemuat && <ActivityIndicator />}

      {pesanError && (
        <View>
          <Text>{pesanError}</Text>
          <Button
            title="Coba Lagi"
            onPress={() => kotaTerpilih && pilihKota(kotaTerpilih)}
          />
        </View>
      )}

      {waktuData && (
        <Text style={{ fontSize: 12, color: "#B45309" }}>
          Mode offline: data tersimpan, terakhir diperbarui{" "}
          {new Date(waktuData).toLocaleString("id-ID")}
        </Text>
      )}

      {cuaca && kualitasUdara && kotaTerpilih && !sedangMemuat && (
        <>
          <WeatherCard
            kota={kotaTerpilih.name}
            suhu={cuaca.saatIni.suhu}
            tingkatAQI={konversiTingkatAQI(kualitasUdara.indeksAQI)}
            indeksAQI={kualitasUdara.indeksAQI}
          />
          <Button
            title={sudahFavorit ? "Sudah di Favorit" : "Tambahkan ke Favorit"}
            disabled={sudahFavorit}
            onPress={() =>
              router.push({
                pathname: "/tambah-favorit",
                params: {
                  id: String(kotaTerpilih.id),
                  nama: kotaTerpilih.name,
                  lat: String(kotaTerpilih.latitude),
                  lon: String(kotaTerpilih.longitude),
                },
              })
            }
          />
        </>
      )}

      {cuaca && (
        <Text style={{ fontSize: 12, color: "#888" }}>
          Kondisi: {labelKodeCuaca(cuaca.saatIni.kodeCuaca)} • Angin{" "}
          {cuaca.saatIni.kecepatanAngin} km/j
        </Text>
      )}

      {cuaca && (
        <Text style={{ fontSize: 12, color: "#888" }}>
          Hari ini: {cuaca.harian.suhuMaksimal[0]}°C / {cuaca.harian.suhuMinimal[0]}°C
        </Text>
      )}

      {kualitasUdara && (
        <Text style={{ fontSize: 12, color: "#888" }}>
          PM2.5: {kualitasUdara.pm25} µg/m³ • PM10: {kualitasUdara.pm10} µg/m³
        </Text>
      )}

      <AtribusiCuaca />
    </SafeAreaView>
  );
}