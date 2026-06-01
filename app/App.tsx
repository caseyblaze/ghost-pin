import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, AppState, SafeAreaView, ScrollView, View,
  Text, TextInput, Pressable, StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { parseCoords, type Coords } from './src/parseCoords';
import { PRESETS } from './presets';
import { setLocation, resetLocation, getStatus } from './src/api';

const BANNER_HIDDEN_Y = -60;

type BannerProps = {
  coords: Coords;
  onApply: () => void;
  onDismiss: () => void;
};

function ClipboardBanner({ coords, onApply, onDismiss }: BannerProps) {
  const translateY = useRef(new Animated.Value(BANNER_HIDDEN_Y)).current;
  const isHiding = useRef(false);
  const onApplyRef = useRef(onApply);
  const onDismissRef = useRef(onDismiss);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    onApplyRef.current = onApply;
    onDismissRef.current = onDismiss;
  }, [onApply, onDismiss]);

  const hide = useCallback((callback: () => void) => {
    if (isHiding.current) return;
    isHiding.current = true;
    animRef.current = Animated.timing(translateY, {
      toValue: BANNER_HIDDEN_Y,
      duration: 150,
      useNativeDriver: true,
    });
    animRef.current.start(callback);
  }, []);

  useEffect(() => {
    animRef.current = Animated.timing(translateY, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    });
    animRef.current.start();
    const timer = setTimeout(() => hide(onDismissRef.current), 4000);
    return () => {
      clearTimeout(timer);
      animRef.current?.stop();
    };
  }, []);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <View style={styles.bannerAccent} />
      <Text style={styles.bannerText} numberOfLines={1}>
        📋 {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
      </Text>
      <Pressable onPress={() => hide(onApplyRef.current)}>
        <Text style={styles.bannerApply}>套用</Text>
      </Pressable>
      <Pressable onPress={() => hide(onDismissRef.current)}>
        <Text style={styles.bannerDismissBtn}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function App() {
  const [lat, setLat] = useState('25.0330');
  const [lng, setLng] = useState('121.5654');
  const [status, setStatus] = useState('檢查中…');
  const [busy, setBusy] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<Coords | null>(null);
  const lastClipboardRef = useRef<string | null>(null);

  async function refreshStatus() {
    const r = await getStatus();
    if (!r.ok) setStatus(`離線：${r.message}`);
    else setStatus(r.data?.online ? '裝置已連線' : '無裝置連線');
  }

  useEffect(() => { refreshStatus(); }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      const text = await Clipboard.getStringAsync();
      if (!text || text === lastClipboardRef.current) return;
      const coords = parseCoords(text);
      if (!coords) return;
      lastClipboardRef.current = text;
      setPendingCoords(coords);
    });
    return () => sub.remove();
  }, []);

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

  function handleApply() {
    if (!pendingCoords) return;
    setLat(String(pendingCoords.lat));
    setLng(String(pendingCoords.lng));
    lastClipboardRef.current = null;
    setPendingCoords(null);
  }

  function handleDismiss() {
    setPendingCoords(null);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Ghost-Pin</Text>
        {pendingCoords && (
          <ClipboardBanner
            coords={pendingCoords}
            onApply={handleApply}
            onDismiss={handleDismiss}
          />
        )}
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a3a5c',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    paddingVertical: 10,
    paddingRight: 12,
    gap: 8,
  },
  bannerAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#2563eb',
    marginRight: 4,
  },
  bannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  bannerApply: {
    color: '#7fd1ff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  bannerDismissBtn: {
    color: '#9aa',
    fontSize: 16,
    paddingHorizontal: 4,
  },
});
