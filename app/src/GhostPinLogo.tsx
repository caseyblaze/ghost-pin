import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function GhostPinLogo() {
  return (
    <View style={styles.container}>
      <View style={styles.textRow}>
        <Text style={[styles.text, styles.ghost]}>GHOST</Text>
        <Text style={[styles.text, styles.pin]}>PIN</Text>
      </View>
      <LinearGradient
        colors={['#7fd1ff', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.underline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 4 },
  textRow: { flexDirection: 'row' },
  text: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  ghost: { color: '#ffffff' },
  pin: { color: '#2563eb' },
  underline: { height: 2, borderRadius: 1 },
});
