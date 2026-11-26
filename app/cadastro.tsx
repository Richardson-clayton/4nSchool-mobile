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
  StatusBar,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

export default function RegisterScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web' && width > 768

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegister = async () => {
    const trimmedNome = nome.trim()
    const trimmedEmail = email.trim()

    if (!trimmedNome || !trimmedEmail || !senha || !confirmarSenha) {
      const msg = 'Por favor, preencha todos os campos.'
      setError(msg)
      if (!isWeb) Alert.alert('Atenção', msg)
      return
    }

    if (senha !== confirmarSenha) {
      const msg = 'As senhas não coincidem.'
      setError(msg)
      if (!isWeb) Alert.alert('Atenção', msg)
      return
    }

    if (senha.length < 6) {
      const msg = 'A senha deve ter pelo menos 6 caracteres.'
      setError(msg)
      if (!isWeb) Alert.alert('Atenção', msg)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: senha,
        options: {
          data: {
            full_name: trimmedNome,
            role: 'responsavel',
          },
        },
      })

      if (signUpError) throw signUpError

      const msgSucesso = 'Cadastro realizado com sucesso! Faça login para continuar.'
      if (isWeb) {
        alert(msgSucesso)
      } else {
        Alert.alert('Sucesso', msgSucesso)
      }

      router.replace('/')
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Ocorreu um erro ao criar a conta.'
      setError(errorMsg)
      if (!isWeb) Alert.alert('Erro no Cadastro', errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={[styles.scrollContainer, isWeb && styles.scrollContainerWeb]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.card, isWeb && styles.cardWeb]}>
          {/* Banner Superior (Mobile) / Esquerdo (Web) */}
          <View style={[styles.banner, isWeb ? styles.bannerWeb : styles.bannerMobile]}>
            <View style={styles.bannerAccentCircle} />

            <View style={[styles.bannerTop, !isWeb && styles.bannerTopMobile]}>
              <Image
                source={require('../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />

              <View style={styles.badgeCategory}>
                <Text style={styles.badgeCategoryText}>NOVO RESPONSÁVEL</Text>
              </View>

              <Text style={[styles.bannerHeadline, !isWeb && styles.bannerHeadlineMobile]}>
                Crie sua conta familiar.
              </Text>

              {isWeb && (
                <Text style={styles.bannerSubtext}>
                  Cadastre-se para vincular seus dependentes, recarregar via PIX e acompanhar pedidos.
                </Text>
              )}
            </View>

            {isWeb && (
              <Text style={styles.copyrightWeb}>
                © {new Date().getFullYear()} Menu Coffee Break • Soluções Escolares. Todos os direitos reservados.
              </Text>
            )}
          </View>

          {/* Formulário */}
          <View style={[styles.formContainer, !isWeb && styles.formContainerMobile]}>
            <TouchableOpacity
              style={styles.backRow}
              onPress={() => router.replace('/')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={16} color="#2563EB" />
              <Text style={styles.backText}>Voltar ao login</Text>
            </TouchableOpacity>

            <Text style={styles.formTitle}>Criar Conta</Text>
            <Text style={styles.formSubtitle}>
              Preencha seus dados para acessar o portal da família.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#E11D48" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.label}>NOME COMPLETO</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="Seu nome completo"
                placeholderTextColor="#94A3B8"
                autoCapitalize="words"
                autoComplete="name"
                value={nome}
                onChangeText={setNome}
              />
            </View>

            <Text style={styles.label}>E-MAIL</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="seu.email@exemplo.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <Text style={styles.label}>SENHA</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                value={senha}
                onChangeText={setSenha}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.eyeBtnText}>
                  {showPassword ? 'Ocultar' : 'Ver'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>CONFIRMAR SENHA</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="Repita a senha"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                value={confirmarSenha}
                onChangeText={setConfirmarSenha}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.65 }]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryBtnText}>CADASTRANDO...</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>FINALIZAR CADASTRO</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginLinkBtn}
              onPress={() => router.replace('/')}
            >
              <Text style={styles.loginLinkText}>
                Já possui uma conta?{' '}
                <Text style={styles.loginLinkHighlight}>Entrar aqui</Text>
              </Text>
            </TouchableOpacity>

            {!isWeb && (
              <Text style={styles.copyrightMobile}>
                © {new Date().getFullYear()} Menu Coffee Break • Soluções Escolares
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E2B58',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  scrollContainerWeb: {
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F1F5F9',
  },
  card: {
    flex: 1,
    backgroundColor: '#1E2B58',
  },
  cardWeb: {
    flex: 0,
    flexDirection: 'row',
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
  },
  banner: {
    backgroundColor: '#1E2B58',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  bannerAccentCircle: {
    position: 'absolute',
    right: -60,
    bottom: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#2853A4',
    opacity: 0.55,
  },
  bannerMobile: {
    paddingTop: Platform.OS === 'ios' ? 54 : 38,
    paddingBottom: 26,
  },
  bannerWeb: {
    width: '43%',
    padding: 36,
  },
  bannerTop: {
    alignItems: 'flex-start',
    zIndex: 1,
  },
  bannerTopMobile: {
    alignItems: 'center',
  },
  logoImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
    marginBottom: 12,
  },
  badgeCategory: {
    backgroundColor: '#F27835',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  badgeCategoryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bannerHeadline: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
  },
  bannerHeadlineMobile: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  bannerSubtext: {
    color: 'rgba(219, 234, 254, 0.85)',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 19,
  },
  copyrightWeb: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 10,
    marginTop: 32,
    zIndex: 1,
  },
  formContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  formContainerMobile: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    justifyContent: 'flex-start',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
  },
  formSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#1E293B',
  },
  eyeBtn: {
    backgroundColor: 'rgba(226, 232, 240, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  eyeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  primaryBtn: {
    backgroundColor: '#1E62D0',
    height: 50,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    elevation: 3,
    shadowColor: '#1E62D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  loginLinkBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLinkText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  loginLinkHighlight: {
    color: '#2563EB',
    fontWeight: '800',
  },
  copyrightMobile: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 'auto',
    paddingTop: 24,
  },
})