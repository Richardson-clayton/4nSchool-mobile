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
            role: 'portal',
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
      console.error('Erro no cadastro:', err)
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
                <Text style={styles.badgeCategoryText}>CRIAR CONTA DE RESPONSÁVEL</Text>
              </View>

              <Text style={styles.bannerHeadline}>
                Junte-se ao portal de gestão da cantina.
              </Text>

              <Text style={styles.bannerSubtext}>
                Acompanhe o saldo dos alunos, autorize pedidos e realize recargas em segundos.
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
            <Text style={styles.formTitle}>Cadastre-se</Text>
            <Text style={styles.formSubtitle}>
              Crie sua conta para gerenciar os cartões dos alunos.
            </Text>

            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={18} color="#E11D48" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Campo Nome Completo */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>NOME COMPLETO</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Seu nome completo"
                  placeholderTextColor="#94A3B8"
                  value={nome}
                  onChangeText={setNome}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Campo E-mail */}
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
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>
            </View>

            {/* Campo Senha */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>SENHA</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { paddingRight: 64 }]}
                  placeholder="Mínimo de 6 caracteres"
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
                >
                  <Text style={styles.showPasswordText}>{showPassword ? 'Ocultar' : 'Ver'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirmar Senha */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONFIRMAR SENHA</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Repita a senha"
                  placeholderTextColor="#94A3B8"
                  value={confirmarSenha}
                  onChangeText={setConfirmarSenha}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>
            </View>

            {/* Botão de Cadastro */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>CRIAR CONTA</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Já possui uma conta? </Text>
              <TouchableOpacity onPress={() => router.push('/')}>
                <Text style={styles.footerLink}>Fazer Login</Text>
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
  cardWeb: { flexDirection: 'row', minHeight: 540 },
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
  inputGroup: { marginBottom: 14 },
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
  showPasswordBtn: { position: 'absolute', right: 10, backgroundColor: '#E2E8F0', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  showPasswordText: { fontSize: 11, fontWeight: '700', color: '#475569' },
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
  buttonDisabled: { backgroundColor: '#94A3B8' },
  buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  footerText: { fontSize: 12, color: '#64748B' },
  footerLink: { fontSize: 12, color: '#2563EB', fontWeight: '700' },
})