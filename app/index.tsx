import React, { useState, useEffect } from 'react'
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
import { supabase } from '@/src/lib/supabase'
import { Ionicons } from '@expo/vector-icons'

export default function LoginScreen() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isWeb = Platform.OS === 'web' && width > 768

  const [initialChecking, setInitialChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) {
          router.replace('/(tabs)' as any)
        } else {
          setInitialChecking(false)
        }
      })
      .catch(() => setInitialChecking(false))
  }, [router])

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

      const { data: usuario } = await supabase
        .from('usuarios')
        .select('ativo')
        .eq('id', data.user.id)
        .maybeSingle()

      if (usuario?.ativo === false) {
        await supabase.auth.signOut()
        throw new Error('Sua conta está inativa. Contate o suporte.')
      }

      router.replace('/(tabs)' as any)
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Ocorreu um erro ao tentar entrar.'
      setError(errorMsg)
      if (!isWeb) Alert.alert('Erro no Login', errorMsg)
    } finally {
      setLoading(false)
    }
  }

  if (initialChecking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1E2B58" />
      </View>
    )
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
            {/* Detalhe decorativo sutil no fundo */}
            <View style={styles.bannerAccentCircle} />

            <View style={[styles.bannerTop, !isWeb && styles.bannerTopMobile]}>
              <Image
                source={require('../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />

              <View style={styles.badgeCategory}>
                <Text style={styles.badgeCategoryText}>GESTÃO DE CANTINA</Text>
              </View>

              <Text style={[styles.bannerHeadline, !isWeb && styles.bannerHeadlineMobile]}>
                A cantina da sua escola na palma da mão.
              </Text>

              {isWeb && (
                <Text style={styles.bannerSubtext}>
                  Plataforma integrada para consumo escolar, gestão de caixa, recargas via Pix e controle dos responsáveis.
                </Text>
              )}
            </View>

            {isWeb && (
              <Text style={styles.copyrightWeb}>
                © {new Date().getFullYear()} Menu Coffee Break • Soluções Escolares. Todos os direitos reservados.
              </Text>
            )}
          </View>

          {/* Formulário (Bottom Sheet no Mobile / Coluna Direita no Web) */}
          <View style={[styles.formContainer, !isWeb && styles.formContainerMobile]}>
            <Text style={styles.formTitle}>Entrar na Conta</Text>
            <Text style={styles.formSubtitle}>
              Informe suas credenciais para acessar o painel.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#E11D48" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

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

            <View style={styles.passwordLabelRow}>
              <Text style={styles.label}>SENHA</Text>
              <TouchableOpacity
                onPress={() => router.push('/esqueci-senha' as any)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotText}>Esqueceu a senha?</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" />
              <TextInput
                style={styles.input}
                placeholder="••••••••••••"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoComplete="password"
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

            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.65 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryBtnText}>ACESSANDO...</Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>ENTRAR NO SISTEMA</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.registerBtn}
              onPress={() => router.push('/cadastro' as any)}
            >
              <Text style={styles.registerText}>
                Primeiro acesso como responsável?{' '}
                <Text style={styles.registerLink}>Cadastre-se aqui</Text>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
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
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 32,
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
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 14,
  },
  badgeCategory: {
    backgroundColor: '#F27835',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
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
    maxWidth: 280,
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
    paddingTop: 28,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  formContainerMobile: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    justifyContent: 'flex-start',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
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
    marginBottom: 22,
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
    marginBottom: 16,
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
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '600',
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
    marginBottom: 16,
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
  registerBtn: {
    marginTop: 22,
    alignItems: 'center',
  },
  registerText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  registerLink: {
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