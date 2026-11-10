import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
  Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web' && width > 768

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      const msg = 'Por favor, informe seu e-mail cadastrado.'
      setError(msg)
      if (!isWeb) Alert.alert('Atenção', msg)
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail)

      if (resetError) throw resetError

      const msg = 'Enviamos as instruções de redefinição para o seu e-mail.'
      setSuccessMsg(msg)
      if (!isWeb) Alert.alert('E-mail Enviado', msg)
    } catch (err: unknown) {
      console.error('Erro na redefinição de senha:', err)
      const errorMsg = (err as Error)?.message || 'Ocorreu um erro ao tentar redefinir a senha.'
      setError(errorMsg)
      if (!isWeb) Alert.alert('Erro', errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, isWeb && styles.cardWeb]}>
          {/* Banner Lateral */}
          <View style={[styles.banner, isWeb ? styles.bannerWeb : styles.bannerMobile]}>
            <View style={styles.bannerHeader}>
              <Image
                source={require('../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>NutriSchool</Text>
            </View>

            <View style={styles.bannerBody}>
              <View style={styles.badgeCategory}>
                <Text style={styles.badgeCategoryText}>RECUPERAÇÃO DE ACESSO</Text>
              </View>

              <Text style={styles.bannerHeadline}>
                Recupere o acesso à sua conta.
              </Text>

              <Text style={styles.bannerSubtext}>
                Enviaremos um e-mail seguro para você redefinir sua senha com facilidade.
              </Text>
            </View>

            {isWeb && (
              <Text style={styles.bannerFooter}>
                © {new Date().getFullYear()} NutriSchool • Soluções Escolares
              </Text>
            )}
          </View>

          {/* Formulário */}
          <View style={[styles.formContainer, isWeb && styles.formContainerWeb]}>
            <Text style={styles.formTitle}>Esqueceu a senha?</Text>
            <Text style={styles.formSubtitle}>
              Digite seu e-mail abaixo para receber um link de redefinição.
            </Text>

            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#E11D48" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {successMsg && (
              <View style={styles.successContainer}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            )}

            {/* Campo E-mail */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-MAIL CADASTRADO</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="seu.email@exemplo.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>
            </View>

            {/* Botão de Envio */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>ENVIAR E-MAIL</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <TouchableOpacity onPress={() => router.push('/')} style={styles.backButton}>
                <Ionicons name="arrow-back-outline" size={16} color="#2563EB" />
                <Text style={styles.footerLink}>Voltar para o Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 880,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 5,
  },
  cardWeb: { flexDirection: 'row', minHeight: 480 },
  banner: { backgroundColor: '#1E2B58', padding: 32, justifyContent: 'space-between' },
  bannerWeb: { width: '45%' },
  bannerMobile: { width: '100%' },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoImage: { width: 40, height: 40 },
  brandTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  bannerBody: { marginVertical: 24 },
  badgeCategory: {
    alignSelf: 'flex-start',
    backgroundColor: '#F27835',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeCategoryText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  bannerHeadline: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', lineHeight: 30, marginBottom: 10 },
  bannerSubtext: { fontSize: 12, color: '#93C5FD', lineHeight: 18 },
  bannerFooter: { fontSize: 10, color: 'rgba(255, 255, 255, 0.45)' },
  formContainer: { padding: 32, justifyContent: 'center' },
  formContainerWeb: { width: '55%', padding: 44 },
  formTitle: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  formSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 20 },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#E11D48', fontSize: 12, fontWeight: '600', flex: 1 },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  successText: { color: '#16A34A', fontSize: 12, fontWeight: '600', flex: 1 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '800', color: '#475569', marginBottom: 6, letterSpacing: 0.6 },
  inputWrapper: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    width: '100%',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingLeft: 42,
    paddingRight: 16,
    fontSize: 13,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: '#1E62D0',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    elevation: 3,
  },
  buttonDisabled: { backgroundColor: '#94A3B8' },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerLink: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
})