import { useEffect, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet,
} from 'react-native';
import { PRESETS } from './presets';
import { setLocation, resetLocation, getStatus } from './src/api';

export default function App() {
  const [lat, setLat] = useState('25.0330');
  const [lng, setLng] = useState('121.5654');
  const [status, setStatus] = useState('檢查中…');
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    const r = await getStatus();
    if (!r.ok) setStatus(`離線：${r.message}`);
    else setStatus(r.data?.online ? '裝置已連線' : '無裝置連線');
  }

  useEffect(() => { refreshStatus(); }, []);

  async function onSet() {
    setBusy(true);
    const r = await setLocation(Number(lat), Number(lng));
    setStatus(r.ok ? `已設定 ${lat}, ${lng}` : `失敗：${r.message}`);
    setBusy(false);
  }

  async function onReset() {
    setBusy(true);
    const r = await resetLocation();
    setStatus(r.ok ? '已恢復真實定位' : `失敗：${r.message}`);
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ghost-Pin</Text>
        <Text style={styles.status}>{status}</Text>

        <Text style={styles.label}>緯度 (lat)</Text>
        <TextInput style={styles.input} value={lat} onChangeText={setLat}
          keyboardType="numbers-and-punctuation" />
        <Text style={styles.label}>經度 (lng)</Text>
        <TextInput style={styles.input} value={lng} onChangeText={setLng}
          keyboardType="numbers-and-punctuation" />

        <Text style={styles.label}>預設地點</Text>
        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <Pressable key={p.name} style={styles.preset}
              onPress={() => { setLat(String(p.lat)); setLng(String(p.lng)); }}>
              <Text style={styles.presetText}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.btn, styles.primary]} disabled={busy} onPress={onSet}>
          <Text style={styles.btnText}>設定定位</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.secondary]} disabled={busy} onPress={onReset}>
          <Text style={styles.btnText}>恢復真實定位</Text>
        </Pressable>
        <Pressable style={styles.refresh} onPress={refreshStatus}>
          <Text style={styles.refreshText}>重新檢查狀態</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1419' },
  container: { padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', marginBottom: 4 },
  status: { fontSize: 14, color: '#7fd1ff', marginBottom: 16 },
  label: { fontSize: 13, color: '#9aa', marginTop: 8 },
  input: {
    backgroundColor: '#1c2530', color: '#fff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  preset: { backgroundColor: '#26323f', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  presetText: { color: '#cfe', fontSize: 14 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primary: { backgroundColor: '#2563eb' },
  secondary: { backgroundColor: '#3a4654' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  refresh: { alignItems: 'center', marginTop: 16 },
  refreshText: { color: '#7fd1ff', fontSize: 14 },
});
