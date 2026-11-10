'use client'

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
import { supabase } from '@/src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

export default function LoginScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web' && width > 768

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    const trimmedEmail = email.trim()

    if (!trimmedEmail || !senha) {
      const msg = 'Por favor, preencha o e-mail e a senha.'
      setError(msg)
      if (!isWeb) Alert.alert('Atenção', msg)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: senha,
      })

      if (authError || !data.user) {
        throw new Error('E-mail ou senha incorretos.')
      }

      router.replace('/(app)' as any)
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Ocorreu um erro ao tentar entrar.'
      setError(errorMsg)
      if (!isWeb) Alert.alert('Erro no Login', errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = () => {
    router.push('/(auth)/esqueci-senha' as any)
  }

  const handleRegister = () => {
    router.push('/(auth)/cadastro' as any)
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
          {/* Banner Esquerdo / Topo */}
          <View style={[styles.banner, isWeb ? styles.bannerWeb : styles.bannerMobile]}>
            <View style={styles.bannerHeader}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>NutriSchool</Text>
            </View>

            <View style={styles.bannerBody}>
              <View style={styles.badgeCategory}>
                <Text style={styles.badgeCategoryText}>GESTÃO DE CANTINA</Text>
              </View>

              <Text style={styles.bannerHeadline}>
                A cantina da sua escola na palma da mão.
              </Text>

              <Text style={styles.bannerSubtext}>
                Plataforma integrada para consumo escolar, gestão de caixa, recargas via Pix e controle dos responsáveis.
              </Text>
            </View>

            {isWeb && (
              <Text style={styles.bannerFooter}>
                © {new Date().getFullYear()} NutriSchool • Soluções Escolares
              </Text>
            )}
          </View>

          {/* Formulário de Login */}
          <View style={[styles.formContainer, isWeb && styles.formContainerWeb]}>
            <Text style={styles.formTitle}>Entrar na Conta</Text>
            <Text style={styles.formSubtitle}>
              Informe suas credenciais para acessar o painel.
            </Text>

            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#E11D48" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-MAIL</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="seu.email@exemplo.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.passwordLabelRow}>
                <Text style={styles.label}>SENHA</Text>
                <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
                  <Text style={styles.forgotPasswordText}>Esqueceu a senha?</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { paddingRight: 64 }]}
                  placeholder="••••••••••••"
                  placeholderTextColor="#94A3B8"
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.showPasswordBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.showPasswordText}>
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.buttonLoadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.buttonText}>ACESSANDO...</Text>
                </View>
              ) : (
                <Text style={styles.buttonText}>ENTRAR NO SISTEMA</Text>
              )}
            </TouchableOpacity>

            <View style={styles.registerFooterContainer}>
              <Text style={styles.registerFooterText}>Primeiro acesso como responsável? </Text>
              <TouchableOpacity onPress={handleRegister} activeOpacity={0.7}>
                <Text style={styles.registerLink}>Cadastre-se aqui</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 880,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
  },
  cardWeb: {
    flexDirection: 'row',
    minHeight: 500,
  },
  banner: {
    backgroundColor: '#1E2B58',
    padding: 32,
    justifyContent: 'space-between',
  },
  bannerWeb: {
    width: '45%',
  },
  bannerMobile: {
    width: '100%',
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  bannerBody: {
    marginVertical: 20,
  },
  badgeCategory: {
    alignSelf: 'flex-start',
    backgroundColor: '#F27835',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeCategoryText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bannerHeadline: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 10,
  },
  bannerSubtext: {
    fontSize: 12,
    color: '#93C5FD',
    lineHeight: 18,
  },
  bannerFooter: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  formContainer: {
    padding: 32,
    justifyContent: 'center',
  },
  formContainerWeb: {
    width: '55%',
    padding: 44,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  formSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  errorText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
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
  showPasswordBtn: {
    position: 'absolute',
    right: 10,
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  showPasswordText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: '#1E62D0',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    elevation: 3,
  },
  buttonDisabled: {
    backgroundColor: '#94A3B8',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  registerFooterContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  registerFooterText: {
    fontSize: 12,
    color: '#64748B',
  },
  registerLink: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '700',
  },
})